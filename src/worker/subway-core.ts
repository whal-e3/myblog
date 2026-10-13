// Shared, secret-free parsing for Seoul TOPIS realtimePosition. These are
// station observations, not GPS positions or arrival predictions.

export const LINE_ID = "2";
export const PROVIDER_LINE_ID = "1002";
export const LINE_NAME = "2호선";
export const DOCUMENTATION = "https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do";
export const POLL_SECONDS = 120;
export const FRESH_SECONDS = 90;
export const EXPIRE_SECONDS = 300;
export const DAILY_LIMIT = 900;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface TrainReport {
  key: string;
  lineId: string;
  providerLineId: string;
  number: string;
  stationId: string;
  stationName: string;
  observedAt: string | null;
  receivedAt: string;
  direction: string;
  status: string;
  destination: string;
  destinationId: string;
  express: boolean;
  lastTrain: boolean;
}

export class FeedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FeedError";
  }
}

export function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function dateKST(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function validDate(ms: number): boolean {
  return Number.isFinite(ms) && !Number.isNaN(new Date(ms).getTime());
}

// Never replace a missing or malformed provider time with the fetch time.
export function observationTime(row: Record<string, unknown>, nowMs: number): string | null {
  const raw = String(row.recptnDt ?? "").trim();
  if (!raw) return null;

  let ms: number;
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) {
    const normalized = raw.replace(" ", "T");
    ms = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`);
  } else if (/^\d{14}$/.test(raw)) {
    const local = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
    ms = Date.parse(`${local}+09:00`);
  } else if (/^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    const digits = String(row.lastRecptnDt ?? "").replace(/\D/g, "").slice(0, 8);
    const day = digits.length === 8
      ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
      : dateKST(nowMs);
    ms = Date.parse(`${day}T${raw}+09:00`);
    if (digits.length !== 8 && validDate(ms) && ms > nowMs + 60_000) ms -= 86_400_000;
  } else {
    return null;
  }
  return validDate(ms) ? iso(ms) : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function providerError(code: string): FeedError {
  const safeCode = code.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "UPSTREAM_ERROR";
  const messages: Record<string, string> = {
    "INFO-100": "The API key was rejected. Check approval for the realtime subway service.",
    "ERROR-300": "The provider rejected the request parameters.",
    "ERROR-331": "The provider rejected the pagination range.",
    "ERROR-337": "Line 2 is unavailable to this API key.",
    "ERROR-338": "The provider's daily API quota has been reached.",
  };
  return new FeedError(safeCode, messages[safeCode] ?? `The upstream service returned ${safeCode}.`);
}

export function parsePayload(raw: string): { rows: Record<string, unknown>[]; total: number } {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    // The provider sometimes sends an XML error even for a JSON URL. Only its
    // status code is extracted; its message could contain the credential URL.
    const match = raw.match(/<(?:code|CODE)>\s*([^<]*)\s*<\/(?:code|CODE)>/);
    if (!match) throw new FeedError("INVALID_RESPONSE", "The upstream service returned an unrecognized response.");
    payload = { code: match[1] };
  }
  const root = object(payload);
  if (!root) throw new FeedError("INVALID_RESPONSE", "The upstream service returned an unexpected response type.");
  const result = object(root.errorMessage) ?? object(root.RESULT) ?? root;
  const code = String(result.code ?? result.CODE ?? "");
  if (code === "INFO-200") return { rows: [], total: 0 };
  if (code && code !== "INFO-000" && code !== "200") throw providerError(code);
  if (!Array.isArray(root.realtimePositionList)) {
    throw new FeedError("INVALID_RESPONSE", "The upstream response is missing train reports.");
  }
  const rows = root.realtimePositionList as Record<string, unknown>[];
  // A missing total makes it impossible to know whether all pages were read.
  const reported = object(root.errorMessage)?.total;
  if (!(typeof reported === "number" || (typeof reported === "string" && /^\d+$/.test(reported)))) {
    throw new FeedError("INVALID_RESPONSE", "The provider did not report the snapshot size.");
  }
  const total = Number(reported);
  if (!Number.isSafeInteger(total) || total < rows.length) {
    throw new FeedError("INVALID_RESPONSE", "The provider reported an invalid snapshot size.");
  }
  return { rows, total };
}

const field = (row: Record<string, unknown>, name: string, limit: number): string =>
  String(row[name] ?? "").slice(0, limit);

export function normalizeRows(rows: unknown[], fetchedMs: number): { trains: TrainReport[]; skipped: number } {
  const byKey = new Map<string, TrainReport>();
  let skipped = 0;
  for (const value of rows) {
    const row = object(value);
    if (!row) { skipped++; continue; }
    const providerId = String(row.subwayId ?? "");
    const number = String(row.trainNo ?? "").trim();
    const stationName = String(row.statnNm ?? "").trim();
    if (providerId !== PROVIDER_LINE_ID || !number || !stationName) { skipped++; continue; }
    const observedAt = observationTime(row, fetchedMs);
    const serviceDay = observedAt ? dateKST(Date.parse(observedAt)) : "unknown";
    const key = `${LINE_ID}:${serviceDay}:${number}`;
    const item: TrainReport = {
      key, lineId: LINE_ID, providerLineId: providerId,
      number: number.slice(0, 32), stationId: field(row, "statnId", 40),
      stationName: stationName.slice(0, 100), observedAt, receivedAt: iso(fetchedMs),
      direction: field(row, "updnLine", 20), status: field(row, "trainSttus", 20),
      destination: field(row, "statnTnm", 100), destinationId: field(row, "statnTid", 40),
      express: String(row.directAt ?? "0") === "1",
      lastTrain: String(row.lstcarAt ?? "0") === "1",
    };
    const previous = byKey.get(key);
    if (!previous || (item.observedAt ?? "") > (previous.observedAt ?? "")) byKey.set(key, item);
  }
  return { trains: [...byKey.values()], skipped };
}
