import { DurableObject } from "cloudflare:workers";
import {
  DAILY_LIMIT, DOCUMENTATION, EXPIRE_SECONDS, FEEDS, FRESH_SECONDS, LINE_ID,
  POLL_SECONDS, SUPPORTED_LINES, FeedError, dateKST, enabledLines, iso,
  normalizeRows, parsePayload, requestedLines, type FeedLineId, type TrainReport,
} from "./subway-core";

const PAGE_SIZE = 1000;
const ERROR_BACKOFF_MS = 60_000;
const MAX_RESPONSE_BYTES = 4_000_000;

export interface Budget {
  dateKST: string;
  used: number;
  localLimit: number;
  remaining: number;
}

export interface LineResult {
  lineId: string;
  state: "ok" | "empty" | "error" | "unconfigured" | "disabled";
  trains: TrainReport[];
  message: string;
  code?: string;
  fetchedAt?: string | null;
  lastAttemptAt?: string;
  rawCount?: number;
  skippedRecords?: number;
  truncated?: boolean;
}

export interface CacheRecord {
  line: LineResult;
  nextAttemptMs: number;
}

export interface FeedStore {
  budget(nowMs: number): Budget;
  reserve(nowMs: number): void;
  providerBlock(nowMs: number): string | null;
  blockProvider(nowMs: number, code: string): void;
  read(lineId: FeedLineId): CacheRecord | null;
  write(lineId: FeedLineId, record: CacheRecord): void;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

function configuredKey(key: string): boolean {
  return !!key && !["sample", "paste_your_key_here", "your_key_here"].includes(key.toLowerCase());
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new FeedError("RESPONSE_TOO_LARGE", "The provider response exceeded the safety limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

interface EngineOptions {
  enabled?: FeedLineId[];
  pollSeconds?: number;
}

async function boundedLines(ids: FeedLineId[], fn: (id: FeedLineId) => Promise<LineResult>): Promise<LineResult[]> {
  const results: LineResult[] = new Array(ids.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, async () => {
    while (next < ids.length) {
      const index = next++;
      results[index] = await fn(ids[index]);
    }
  }));
  return results;
}

export class SubwayFeedEngine {
  private readonly pending = new Map<FeedLineId, Promise<LineResult>>();
  private readonly enabled: FeedLineId[];
  private readonly pollSeconds: number;
  private authBlocked = false;

  constructor(
    private readonly store: FeedStore,
    private readonly key: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly clock: () => number = Date.now,
    options: EngineOptions = {},
  ) {
    this.enabled = options.enabled ?? [LINE_ID];
    this.pollSeconds = options.pollSeconds ?? POLL_SECONDS;
  }

  status() {
    const now = this.clock();
    const budget = this.store.budget(now);
    // Every enabled line requested continuously, with one page per snapshot.
    // Pagination can only increase the actual call count.
    const continuousDailyCallsMinimum = this.enabled.length * Math.ceil(86_400 / this.pollSeconds);
    const quotaWarning = continuousDailyCallsMinimum > budget.localLimit
      ? `Continuous ${this.pollSeconds}-second polling of ${this.enabled.length} enabled lines needs at least ${continuousDailyCallsMinimum} upstream calls per KST day, before pagination; the local cap is ${budget.localLimit}. Refreshes will stop at the cap.`
      : null;
    return {
      configured: configuredKey(this.key),
      provider: "Seoul TOPIS / realtimePosition",
      sourceUrl: DOCUMENTATION,
      pollSeconds: this.pollSeconds,
      freshSeconds: FRESH_SECONDS,
      expireSeconds: EXPIRE_SECONDS,
      enabledLines: this.enabled,
      supportedLines: SUPPORTED_LINES,
      budget,
      continuousDailyCallsMinimum,
      quotaWarning,
      upstreamTransport: "http",
      serverTime: iso(now),
    };
  }

  async positions(requested: FeedLineId[] = this.enabled) {
    const lines = await boundedLines(requested, id => this.line(id));
    return { ...this.status(), lines };
  }

  async line(lineId: FeedLineId = LINE_ID): Promise<LineResult> {
    if (!this.enabled.includes(lineId)) {
      return { lineId, state: "disabled", trains: [], message: "This feed is not enabled on the server." };
    }
    if (!configuredKey(this.key)) {
      return { lineId, state: "unconfigured", trains: [], message: "Live feed is not configured." };
    }
    const old = this.store.read(lineId);
    if (old && this.clock() < old.nextAttemptMs) return old.line;
    // All visitors to this one Durable Object share each line's refresh.
    let pending = this.pending.get(lineId);
    if (!pending) {
      pending = this.refresh(lineId, old).finally(() => { this.pending.delete(lineId); });
      this.pending.set(lineId, pending);
    }
    return pending;
  }

  private async requestPage(lineId: FeedLineId, start: number): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    // Fixed destination and allowlisted route; only the server secret is interpolated.
    const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(this.key)}/json/realtimePosition/${start}/${start + PAGE_SIZE}/${encodeURIComponent(FEEDS[lineId].name)}`;
    const response = await this.fetcher(url, {
      method: "GET", redirect: "manual", referrerPolicy: "no-referrer",
      headers: { Accept: "application/json", "User-Agent": "SeoulSubsurface/2.0 (personal transit visualization)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new FeedError("HTTP_REDIRECT", "The provider redirected the request; live updates were stopped.");
    }
    if (!response.ok) throw new FeedError(`HTTP_${response.status}`, "The upstream request failed.");
    return parsePayload(await readLimited(response));
  }

  private async refresh(lineId: FeedLineId, old: CacheRecord | null): Promise<LineResult> {
    const started = this.clock();
    let line: LineResult;
    let failed = false;
    try {
      const rows: Record<string, unknown>[] = [];
      let reportedTotal = 0;
      let start = 0;
      const seenPages = new Set<string>();
      while (start === 0 || start < reportedTotal) {
        // Another route may have hit a provider-wide limit while this route
        // awaited its previous page. Do not spend a request after that signal.
        if (this.authBlocked) {
          throw new FeedError("INFO-100", "The API key was rejected. Correct the local secret and restart the Worker.");
        }
        const providerCode = this.store.providerBlock(this.clock());
        if (providerCode) {
          throw new FeedError(providerCode, `The provider returned ${providerCode}; its meaning for this feed is unconfirmed.`);
        }
        // Persist one reservation before each upstream call, including retries.
        this.store.reserve(this.clock());
        const page = await this.requestPage(lineId, start);
        const pageText = JSON.stringify(page.rows);
        if (seenPages.has(pageText)) {
          throw new FeedError("INCOMPLETE_RESPONSE", "The provider repeated a page. Existing observations were retained.");
        }
        seenPages.add(pageText);
        if (page.rows.length > PAGE_SIZE + 1) {
          throw new FeedError("INVALID_RESPONSE", "The provider returned an oversized page.");
        }
        rows.push(...page.rows);
        reportedTotal = Math.max(reportedTotal, page.total);
        if (start === 0 && page.total === 0) break;
        if (rows.length < reportedTotal && page.rows.length < PAGE_SIZE) {
          throw new FeedError("INCOMPLETE_RESPONSE", "The provider returned a short page. Existing observations were retained.");
        }
        start += page.rows.length;
      }
      if (rows.length < reportedTotal) {
        throw new FeedError("INCOMPLETE_RESPONSE", "The provider snapshot is incomplete. Existing observations were retained.");
      }
      const { trains, skipped } = normalizeRows(rows, started, lineId);
      line = {
        lineId, state: trains.length ? "ok" : "empty", trains,
        fetchedAt: iso(started), lastAttemptAt: iso(started),
        rawCount: rows.length, skippedRecords: skipped, truncated: false, message: "",
      };
    } catch (error) {
      failed = true;
      const safe = error instanceof FeedError
        ? error : new FeedError("NETWORK_ERROR", "Cannot reach or process Seoul's data service.");
      if (safe.code === "INFO-100") this.authBlocked = true;
      if (safe.code === "ERROR-337" || safe.code === "ERROR-338") {
        this.store.blockProvider(this.clock(), safe.code);
        safe.message += " Further calls are paused through this local KST day as a precaution.";
      }
      line = {
        lineId, state: "error", code: safe.code, message: safe.message,
        trains: old?.line.trains ?? [], fetchedAt: old?.line.fetchedAt ?? null,
        lastAttemptAt: iso(started),
      };
    }
    this.store.write(lineId, { line, nextAttemptMs: this.clock() + (failed ? ERROR_BACKOFF_MS : this.pollSeconds * 1000) });
    return line;
  }
}

// Existing local tests and consumers may still import the old class name.
export { SubwayFeedEngine as Line2Engine };

interface SqlCursor<T> { toArray(): T[] }
interface SqlStorage { exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T> }
interface DurableState { storage: { sql: SqlStorage } }
interface DurableEnv {
  SEOUL_SUBWAY_API_KEY?: string;
  SEOUL_LIVE_LINES?: string;
  SEOUL_POLL_SECONDS?: string;
  SEOUL_DAILY_LIMIT?: string;
}

export class SqliteFeedStore implements FeedStore {
  constructor(private readonly sql: SqlStorage, private readonly dailyLimit = DAILY_LIMIT) {
    this.sql.exec("CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY CHECK (id = 1), date_kst TEXT NOT NULL, used INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS snapshots (line_id TEXT PRIMARY KEY, body TEXT NOT NULL, next_attempt_ms INTEGER NOT NULL)");
    // Carry forward the first local-only schema's provider-wide quota latch.
    this.sql.exec("CREATE TABLE IF NOT EXISTS provider_blocks (date_kst TEXT PRIMARY KEY)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS provider_quota (date_kst TEXT PRIMARY KEY, code TEXT NOT NULL)");
    this.sql.exec("INSERT OR IGNORE INTO provider_quota (date_kst, code) SELECT date_kst, 'ERROR-337' FROM provider_blocks");
  }

  budget(nowMs: number): Budget {
    const day = dateKST(nowMs);
    const row = this.sql.exec<{ date_kst: string; used: number }>("SELECT date_kst, used FROM quota WHERE id = 1").toArray()[0];
    if (!row) {
      this.sql.exec("INSERT INTO quota (id, date_kst, used) VALUES (1, ?, 0)", day);
      return { dateKST: day, used: 0, localLimit: this.dailyLimit, remaining: this.dailyLimit };
    }
    if (row.date_kst !== day) {
      this.sql.exec("UPDATE quota SET date_kst = ?, used = 0 WHERE id = 1", day);
      return { dateKST: day, used: 0, localLimit: this.dailyLimit, remaining: this.dailyLimit };
    }
    return { dateKST: day, used: row.used, localLimit: this.dailyLimit, remaining: Math.max(0, this.dailyLimit - row.used) };
  }

  reserve(nowMs: number): void {
    const budget = this.budget(nowMs);
    if (budget.used >= this.dailyLimit) {
      throw new FeedError("LOCAL_QUOTA_LIMIT", "The daily request cap has been reached.");
    }
    this.sql.exec("UPDATE quota SET used = used + 1 WHERE id = 1");
  }

  providerBlock(nowMs: number): string | null {
    const day = dateKST(nowMs);
    return this.sql.exec<{ code: string }>("SELECT code FROM provider_quota WHERE date_kst = ?", day).toArray()[0]?.code ?? null;
  }

  blockProvider(nowMs: number, code: string): void {
    const day = dateKST(nowMs);
    this.sql.exec("DELETE FROM provider_quota WHERE date_kst <> ?", day);
    this.sql.exec("INSERT OR IGNORE INTO provider_quota (date_kst, code) VALUES (?, ?)", day, code);
  }

  read(lineId: FeedLineId): CacheRecord | null {
    const row = this.sql.exec<{ body: string; next_attempt_ms: number }>("SELECT body, next_attempt_ms FROM snapshots WHERE line_id = ?", lineId).toArray()[0];
    if (!row) return null;
    try { return { line: JSON.parse(row.body) as LineResult, nextAttemptMs: row.next_attempt_ms }; }
    catch { return null; }
  }

  write(lineId: FeedLineId, record: CacheRecord): void {
    this.sql.exec(
      "INSERT INTO snapshots (line_id, body, next_attempt_ms) VALUES (?, ?, ?) ON CONFLICT(line_id) DO UPDATE SET body = excluded.body, next_attempt_ms = excluded.next_attempt_ms",
      lineId, JSON.stringify(record.line), record.nextAttemptMs,
    );
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    },
  });
}

function configuredInteger(value: string | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return Number(value);
}

// The historical class/binding name is retained, but one named instance now
// keeps all allowlisted lines and their shared quota in SQLite.
export class SeoulLine2Feed extends DurableObject {
  private readonly engine: SubwayFeedEngine;

  constructor(state: DurableState, env: DurableEnv) {
    super(state, env);
    const dailyLimit = configuredInteger(env.SEOUL_DAILY_LIMIT, DAILY_LIMIT, 1, 1_000_000, "SEOUL_DAILY_LIMIT");
    const pollSeconds = configuredInteger(env.SEOUL_POLL_SECONDS, POLL_SECONDS, 15, 3600, "SEOUL_POLL_SECONDS");
    this.engine = new SubwayFeedEngine(
      new SqliteFeedStore(state.storage.sql, dailyLimit), env.SEOUL_SUBWAY_API_KEY?.trim() ?? "",
      fetch, Date.now, { enabled: enabledLines(env.SEOUL_LIVE_LINES), pollSeconds },
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);
    if (path === "/api/live/status") {
      if (url.search) return jsonResponse({ error: "Unexpected query parameters." }, 400);
      return jsonResponse(this.engine.status());
    }
    if (path === "/api/live/positions") {
      const entries = [...url.searchParams.entries()];
      if (entries.length > 1 || (entries.length === 1 && entries[0][0] !== "lines")) {
        return jsonResponse({ error: "Invalid line selection." }, 400);
      }
      const selected = entries.length ? requestedLines(entries[0][1]) : undefined;
      if (selected === null) return jsonResponse({ error: "Invalid line selection." }, 400);
      return jsonResponse(await this.engine.positions(selected));
    }
    return jsonResponse({ error: "Not found." }, 404);
  }
}
