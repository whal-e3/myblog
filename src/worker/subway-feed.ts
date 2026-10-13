import { DurableObject } from "cloudflare:workers";
import {
  DAILY_LIMIT, DOCUMENTATION, EXPIRE_SECONDS, FRESH_SECONDS, LINE_ID, LINE_NAME,
  POLL_SECONDS, FeedError, dateKST, iso, normalizeRows, parsePayload,
  type TrainReport,
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
  state: "ok" | "empty" | "error" | "unconfigured";
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
  providerBlocked(nowMs: number): boolean;
  blockProvider(nowMs: number): void;
  read(): CacheRecord | null;
  write(record: CacheRecord): void;
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

export class Line2Engine {
  private pending: Promise<LineResult> | null = null;

  constructor(
    private readonly store: FeedStore,
    private readonly key: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  status() {
    const now = this.clock();
    return {
      configured: configuredKey(this.key),
      provider: "Seoul TOPIS / realtimePosition",
      sourceUrl: DOCUMENTATION,
      pollSeconds: POLL_SECONDS,
      freshSeconds: FRESH_SECONDS,
      expireSeconds: EXPIRE_SECONDS,
      enabledLines: [LINE_ID],
      supportedLines: [LINE_ID],
      budget: this.store.budget(now),
      upstreamTransport: "http",
      serverTime: iso(now),
    };
  }

  async positions() {
    const line = await this.line();
    return { ...this.status(), lines: [line] };
  }

  async line(): Promise<LineResult> {
    if (!configuredKey(this.key)) {
      return { lineId: LINE_ID, state: "unconfigured", trains: [], message: "Live feed is not configured." };
    }
    const old = this.store.read();
    if (old && this.clock() < old.nextAttemptMs) return old.line;
    // All visitors for this named Durable Object wait for the same refresh.
    if (!this.pending) {
      this.pending = this.refresh(old).finally(() => { this.pending = null; });
    }
    return this.pending;
  }

  private async requestPage(start: number): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    // Fixed destination and route; only the server secret is interpolated.
    const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(this.key)}/json/realtimePosition/${start}/${start + PAGE_SIZE}/${encodeURIComponent(LINE_NAME)}`;
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

  private async refresh(old: CacheRecord | null): Promise<LineResult> {
    const started = this.clock();
    let line: LineResult;
    let failed = false;
    try {
      const rows: Record<string, unknown>[] = [];
      let reportedTotal = 0;
      let start = 0;
      const seenPages = new Set<string>();
      if (this.store.providerBlocked(started)) {
        throw new FeedError("ERROR-338", "The provider's daily API quota has been reached.");
      }
      while (start === 0 || start < reportedTotal) {
        // Persist one reservation before each upstream call, including retries.
        this.store.reserve(this.clock());
        const page = await this.requestPage(start);
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
      const { trains, skipped } = normalizeRows(rows, started);
      line = {
        lineId: LINE_ID, state: trains.length ? "ok" : "empty", trains,
        fetchedAt: iso(started), lastAttemptAt: iso(started),
        rawCount: rows.length, skippedRecords: skipped, truncated: false, message: "",
      };
    } catch (error) {
      failed = true;
      const safe = error instanceof FeedError
        ? error : new FeedError("NETWORK_ERROR", "Cannot reach or process Seoul's data service.");
      if (safe.code === "ERROR-338") this.store.blockProvider(this.clock());
      line = {
        lineId: LINE_ID, state: "error", code: safe.code, message: safe.message,
        trains: old?.line.trains ?? [], fetchedAt: old?.line.fetchedAt ?? null,
        lastAttemptAt: iso(started),
      };
    }
    this.store.write({ line, nextAttemptMs: this.clock() + (failed ? ERROR_BACKOFF_MS : POLL_SECONDS * 1000) });
    return line;
  }
}

interface SqlCursor<T> { toArray(): T[] }
interface SqlStorage { exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T> }
interface DurableState { storage: { sql: SqlStorage } }
interface DurableEnv { SEOUL_SUBWAY_API_KEY?: string }

export class SqliteFeedStore implements FeedStore {
  constructor(private readonly sql: SqlStorage) {
    this.sql.exec("CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY CHECK (id = 1), date_kst TEXT NOT NULL, used INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL, next_attempt_ms INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS provider_blocks (date_kst TEXT PRIMARY KEY)");
  }

  budget(nowMs: number): Budget {
    const day = dateKST(nowMs);
    const row = this.sql.exec<{ date_kst: string; used: number }>("SELECT date_kst, used FROM quota WHERE id = 1").toArray()[0];
    if (!row) {
      this.sql.exec("INSERT INTO quota (id, date_kst, used) VALUES (1, ?, 0)", day);
      return { dateKST: day, used: 0, localLimit: DAILY_LIMIT, remaining: DAILY_LIMIT };
    }
    if (row.date_kst !== day) {
      this.sql.exec("UPDATE quota SET date_kst = ?, used = 0 WHERE id = 1", day);
      return { dateKST: day, used: 0, localLimit: DAILY_LIMIT, remaining: DAILY_LIMIT };
    }
    return { dateKST: day, used: row.used, localLimit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - row.used) };
  }

  reserve(nowMs: number): void {
    const budget = this.budget(nowMs);
    if (budget.used >= DAILY_LIMIT) {
      throw new FeedError("LOCAL_QUOTA_LIMIT", "The daily request cap has been reached.");
    }
    this.sql.exec("UPDATE quota SET used = used + 1 WHERE id = 1");
  }

  providerBlocked(nowMs: number): boolean {
    const day = dateKST(nowMs);
    return this.sql.exec<{ date_kst: string }>("SELECT date_kst FROM provider_blocks WHERE date_kst = ?", day).toArray().length > 0;
  }

  blockProvider(nowMs: number): void {
    const day = dateKST(nowMs);
    this.sql.exec("DELETE FROM provider_blocks WHERE date_kst <> ?", day);
    this.sql.exec("INSERT OR IGNORE INTO provider_blocks (date_kst) VALUES (?)", day);
  }

  read(): CacheRecord | null {
    const row = this.sql.exec<{ body: string; next_attempt_ms: number }>("SELECT body, next_attempt_ms FROM snapshot WHERE id = 1").toArray()[0];
    if (!row) return null;
    try { return { line: JSON.parse(row.body) as LineResult, nextAttemptMs: row.next_attempt_ms }; }
    catch { return null; }
  }

  write(record: CacheRecord): void {
    this.sql.exec(
      "INSERT INTO snapshot (id, body, next_attempt_ms) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, next_attempt_ms = excluded.next_attempt_ms",
      JSON.stringify(record.line), record.nextAttemptMs,
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

// Exactly one named instance ("line-2") is used for every visitor. SQLite
// keeps both the provider call count and the last report after a restart.
export class SeoulLine2Feed extends DurableObject {
  private readonly engine: Line2Engine;

  constructor(state: DurableState, env: DurableEnv) {
    super(state, env);
    this.engine = new Line2Engine(new SqliteFeedStore(state.storage.sql), env.SEOUL_SUBWAY_API_KEY?.trim() ?? "");
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);
    if (path === "/api/live/status") return jsonResponse(this.engine.status());
    if (path === "/api/live/positions") return jsonResponse(await this.engine.positions());
    return jsonResponse({ error: "Not found." }, 404);
  }
}
