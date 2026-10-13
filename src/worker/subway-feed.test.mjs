import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

async function load(entry) {
  const result = await build({
    entryPoints: [entry], platform: 'node', format: 'esm', bundle: true, write: false,
    plugins: [{
      name: 'cloudflare-runtime-test-stub',
      setup(builder) {
        builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'cloudflare:workers', namespace: 'cloudflare-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'cloudflare-test' }, () => ({ contents: 'export class DurableObject {}', loader: 'js' }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const core = await load('src/worker/subway-core.ts');
const { Line2Engine, SqliteFeedStore } = await load('src/worker/subway-feed.ts');
const worker = await load('src/worker/index.ts');

function sqlite() {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      if (/^SELECT\b/i.test(query)) return { toArray: () => statement.all(...bindings) };
      statement.run(...bindings);
      return { toArray: () => [] };
    },
  };
  return { db, store: new SqliteFeedStore(sql), sql };
}

const clockStart = Date.parse('2026-10-13T05:00:30Z');
const key = 'FIXTURE-KEY-PRIVATE';
const row = (number = '2001', other = {}) => ({
  subwayId: '1002', trainNo: number, statnId: '1002000213', statnNm: '강남',
  recptnDt: '2026-10-13 14:00:00', updnLine: 0, trainSttus: 0,
  statnTnm: '성수', directAt: '0', lstcarAt: '0', ...other,
});
const payload = (rows, total = rows.length) => ({ errorMessage: { code: 'INFO-000', total }, realtimePositionList: rows });

test('normalizes KST observations and never invents a missing timestamp', () => {
  assert.equal(core.observationTime(row(), clockStart), '2026-10-13T05:00:00Z');
  assert.equal(core.observationTime(row('1', { recptnDt: '23:59:50' }), Date.parse('2026-10-13T15:00:20Z')), '2026-10-13T14:59:50Z');
  assert.equal(core.observationTime(row('1', { recptnDt: '00:00:10', lastRecptnDt: '20261014' }), clockStart), '2026-10-13T15:00:10Z');
  assert.equal(core.observationTime(row('1', { recptnDt: 'broken' }), clockStart), null);
  const normalized = core.normalizeRows([
    row(), row('2001', { recptnDt: '2026-10-13 13:59:00' }),
    row('wrong-line', { subwayId: '1001' }), row('unknown', { recptnDt: '' }),
  ], clockStart);
  assert.equal(normalized.skipped, 1);
  assert.equal(normalized.trains.length, 2);
  assert.equal(normalized.trains[0].observedAt, '2026-10-13T05:00:00Z');
  assert.equal(normalized.trains[0].direction, '0');
  assert.equal(normalized.trains[0].status, '0');
  assert.equal(normalized.trains[1].observedAt, null);
});

test('provider errors strip message and key', () => {
  for (const raw of [
    JSON.stringify({ errorMessage: { code: 'INFO-100', message: key } }),
    `<RESULT><CODE>INFO-100</CODE><MESSAGE>${key}</MESSAGE></RESULT>`,
  ]) {
    assert.throws(() => core.parsePayload(raw), error => error.code === 'INFO-100' && !error.message.includes(key));
  }
  assert.deepEqual(core.parsePayload('{"code":"INFO-200"}'), { rows: [], total: 0 });
  for (const invalid of [
    { errorMessage: { code: 'INFO-000' }, realtimePositionList: [row()] },
    { errorMessage: { code: 'INFO-000', total: 'bad' }, realtimePositionList: [row()] },
  ]) assert.throws(() => core.parsePayload(JSON.stringify(invalid)), error => error.code === 'INVALID_RESPONSE');
});

test('retrieves every reported page and persists the shared snapshot', async () => {
  const { db, store, sql } = sqlite();
  const reports = Array.from({ length: 3501 }, (_, i) => row(String(1000 + i)));
  const starts = [];
  const fetcher = async (url, init) => {
    const match = url.match(/\/realtimePosition\/(\d+)\/(\d+)\//);
    assert.ok(match);
    assert.equal(init.redirect, 'manual');
    assert.equal(new URL(url).protocol, 'http:');
    starts.push(Number(match[1]));
    return Response.json(payload(reports.slice(Number(match[1]), Number(match[2])), reports.length));
  };
  const engine = new Line2Engine(store, key, fetcher, () => clockStart);
  const first = await engine.positions();
  assert.deepEqual(starts, [0, 1000, 2000, 3000]);
  assert.equal(first.lines[0].state, 'ok');
  assert.equal(first.lines[0].trains.length, 3501);
  assert.equal(first.budget.used, 4);
  assert.equal(first.lines[0].truncated, false);
  assert.equal(JSON.stringify(first).includes(key), false);
  const restored = new Line2Engine(new SqliteFeedStore(sql), key, fetcher, () => clockStart);
  assert.equal((await restored.positions()).lines[0].trains.length, 3501);
  assert.equal(starts.length, 4);
  db.close();
});

test('inclusive page bounds advance by received count', async () => {
  const { db, store } = sqlite();
  const reports = Array.from({ length: 2003 }, (_, i) => row(String(1000 + i)));
  const starts = [];
  const fetcher = async url => {
    const [, first, last] = url.match(/\/realtimePosition\/(\d+)\/(\d+)\//);
    starts.push(Number(first));
    return Response.json(payload(reports.slice(Number(first), Number(last) + 1), reports.length));
  };
  const result = await new Line2Engine(store, key, fetcher, () => clockStart).positions();
  assert.deepEqual(starts, [0, 1001, 2002]);
  assert.equal(result.lines[0].trains.length, 2003);
  db.close();
});

test('repeated and short pages fail without publishing a partial snapshot', async () => {
  for (const kind of ['repeat', 'short', 'empty']) {
    const { db, store } = sqlite();
    let calls = 0;
    const first = Array.from({ length: 1000 }, (_, i) => row(String(i)));
    const fetcher = async () => {
      calls++;
      const rows = kind === 'repeat' ? first : kind === 'short' ? first.slice(0, 400) : [];
      return Response.json(payload(rows, 2000));
    };
    const result = await new Line2Engine(store, key, fetcher, () => clockStart).positions();
    assert.equal(result.lines[0].state, 'error', kind);
    assert.equal(result.lines[0].trains.length, 0, kind);
    assert.equal(result.lines[0].code, 'INCOMPLETE_RESPONSE', kind);
    assert.equal(calls, kind === 'repeat' ? 2 : 1, kind);
    db.close();
  }
});

test('concurrent visitors share one fetch; errors retain timestamps and back off 60 seconds', async () => {
  const { db, store } = sqlite();
  let now = clockStart;
  let calls = 0;
  let fail = false;
  const fetcher = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 15));
    if (fail) throw new Error(`URL and ${key} must never be shown`);
    return Response.json(payload([row()]));
  };
  const engine = new Line2Engine(store, key, fetcher, () => now);
  const responses = await Promise.all(Array.from({ length: 12 }, () => engine.positions()));
  assert.equal(calls, 1);
  assert.equal(responses.every(r => r.lines[0].state === 'ok'), true);
  const observed = responses[0].lines[0].trains[0].observedAt;
  const fetched = responses[0].lines[0].fetchedAt;
  now += 121_000;
  fail = true;
  const error = (await engine.positions()).lines[0];
  assert.equal(error.state, 'error');
  assert.equal(error.trains[0].observedAt, observed);
  assert.equal(error.fetchedAt, fetched);
  assert.equal(error.message.includes(key), false);
  now += 59_000;
  await engine.positions();
  assert.equal(calls, 2);
  now += 2_000;
  await engine.positions();
  assert.equal(calls, 3);
  db.close();
});

test('failed later page retains the previous complete observation', async () => {
  const { db, store } = sqlite();
  let now = clockStart;
  let later = false;
  let calls = 0;
  const reports = Array.from({ length: 1500 }, (_, i) => row(String(1000 + i)));
  const fetcher = async url => {
    calls++;
    if (!later) return Response.json(payload([row()]));
    const start = Number(url.match(/\/realtimePosition\/(\d+)\//)[1]);
    if (start > 0) throw new Error(`unsafe ${key}`);
    return Response.json(payload(reports.slice(0, 1000), reports.length));
  };
  const engine = new Line2Engine(store, key, fetcher, () => now);
  const first = (await engine.positions()).lines[0];
  now += 121_000;
  later = true;
  const failed = (await engine.positions()).lines[0];
  assert.equal(calls, 3);
  assert.equal(failed.state, 'error');
  assert.deepEqual(failed.trains, first.trains);
  assert.equal(failed.fetchedAt, first.fetchedAt);
  assert.equal(failed.message.includes(key), false);
  db.close();
});

test('redirect responses are refused without a second destination request', async () => {
  const { db, store } = sqlite();
  let calls = 0;
  const fetcher = async () => { calls++; return new Response('', { status: 302, headers: { Location: `https://evil.invalid/${key}` } }); };
  const result = await new Line2Engine(store, key, fetcher, () => clockStart).positions();
  assert.equal(result.lines[0].code, 'HTTP_REDIRECT');
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes(key), false);
  db.close();
});

test('SQLite quota persists, stops at 900, and resets at KST midnight', () => {
  const { db, store, sql } = sqlite();
  const before = Date.parse('2026-10-13T14:59:59Z');
  for (let i = 0; i < 900; i++) store.reserve(before);
  assert.equal(store.budget(before).used, 900);
  const restored = new SqliteFeedStore(sql);
  assert.throws(() => restored.reserve(before), error => error.code === 'LOCAL_QUOTA_LIMIT');
  const after = before + 1000;
  assert.equal(restored.budget(after).dateKST, '2026-10-14');
  assert.equal(restored.budget(after).used, 0);
  restored.reserve(after);
  assert.equal(store.budget(after).used, 1);
  db.close();
});

test('provider quota error is latched until the next KST day', async () => {
  const { db, store } = sqlite();
  let now = clockStart;
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ errorMessage: { code: 'ERROR-338', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => now);
  const first = await engine.positions();
  assert.equal(first.lines[0].code, 'ERROR-338');
  assert.equal(first.budget.used, 1);
  now += 61_000;
  const second = await engine.positions();
  assert.equal(second.lines[0].code, 'ERROR-338');
  assert.equal(calls, 1);
  assert.equal(second.budget.used, 1);
  now = Date.parse('2026-10-13T15:01:00Z');
  const nextDay = await engine.positions();
  assert.equal(calls, 2);
  assert.equal(nextDay.budget.dateKST, '2026-10-14');
  assert.equal(nextDay.budget.used, 1);
  db.close();
});

test('Worker feed is gated locally; invalid lines and methods never reach the object', async () => {
  let calls = 0;
  const assets = { fetch: async () => new Response('asset', { headers: { 'Content-Type': 'text/plain' } }) };
  const namespace = {
    idFromName: name => name,
    get: () => ({ fetch: async () => { calls++; return Response.json({ lines: [] }); } }),
  };
  const env = { ASSETS: assets, SITE_ORIGIN: 'https://sunhyuk.dev', SUBWAY_DEV_ENABLED: 'true', SEOUL_LINE2_FEED: namespace };
  const base = 'http://localhost:8788/api/live/positions';
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`), { ...env, SUBWAY_DEV_ENABLED: undefined })).status, 200);
  assert.equal(calls, 0);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=1`), env)).status, 400);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`, { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`, { headers: { Origin: 'https://evil.invalid' } }), env)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`), env)).status, 200);
  assert.equal(calls, 1);
});

test('production-origin OAuth and admin asset routing remain available', async () => {
  let assetCalls = 0;
  const env = {
    ASSETS: { fetch: async () => { assetCalls++; return new Response('admin asset', { headers: { 'Content-Type': 'text/plain' } }); } },
    SITE_ORIGIN: 'https://sunhyuk.dev',
  };
  const auth = 'https://sunhyuk.dev/oauth/auth';
  const login = await worker.default.fetch(new Request(auth), env);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /<form id="login"/);
  assert.equal((await worker.default.fetch(new Request(auth, { method: 'PUT' }), env)).status, 405);
  assert.equal((await worker.default.fetch(new Request(auth, { method: 'POST' }), env)).status, 400);
  const admin = await worker.default.fetch(new Request('https://sunhyuk.dev/admin/'), env);
  assert.equal(admin.status, 200);
  assert.equal(await admin.text(), 'admin asset');
  assert.equal(assetCalls, 1);
});
