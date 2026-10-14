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
const { Line2Engine, SqliteFeedStore, SeoulLine2Feed } = await load('src/worker/subway-feed.ts');
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
const rowFor = (lineId, number = `${lineId}-001`) => row(number, { subwayId: core.FEEDS[lineId].providerId });

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

test('undocumented provider code pauses calls until the next local KST day', async () => {
  const { db, store } = sqlite();
  let now = clockStart;
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ errorMessage: { code: 'ERROR-337', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => now);
  const first = await engine.positions();
  assert.equal(first.lines[0].code, 'ERROR-337');
  assert.match(first.lines[0].message, /meaning for this feed is unconfirmed/);
  assert.match(first.lines[0].message, /paused through this local KST day/);
  assert.doesNotMatch(first.lines[0].message, /quota/i);
  assert.equal(first.budget.used, 1);
  now += 61_000;
  const second = await engine.positions();
  assert.equal(second.lines[0].code, 'ERROR-337');
  assert.match(second.lines[0].message, /paused through this local KST day/);
  assert.equal(calls, 1);
  assert.equal(second.budget.used, 1);
  now = Date.parse('2026-10-13T15:01:00Z');
  const nextDay = await engine.positions();
  assert.equal(calls, 2);
  assert.equal(nextDay.budget.dateKST, '2026-10-14');
  assert.equal(nextDay.budget.used, 1);
  db.close();
});

test('undocumented provider code pauses every enabled route in the shared object', async () => {
  const { db, store } = sqlite();
  let now = clockStart;
  const names = [];
  const fetcher = async url => {
    names.push(decodeURIComponent(new URL(url).pathname.split('/').at(-1)));
    return Response.json({ errorMessage: { code: 'ERROR-337', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => now, { enabled: ['1', '2'] });
  assert.equal((await engine.positions(['1'])).lines[0].code, 'ERROR-337');
  now += 61_000;
  assert.equal((await engine.positions(['2'])).lines[0].code, 'ERROR-337');
  assert.deepEqual(names, ['1호선']);
  assert.equal(engine.status().budget.used, 1);
  db.close();
});

test('ERROR-338 also blocks later routes without another provider request', async () => {
  const { db, store, sql } = sqlite();
  let now = clockStart;
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ errorMessage: { code: 'ERROR-338', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => now, { enabled: ['1', '2'] });
  assert.equal((await engine.positions(['1'])).lines[0].code, 'ERROR-338');
  now += 61_000;
  assert.equal((await engine.positions(['2'])).lines[0].code, 'ERROR-338');
  assert.equal(calls, 1);
  const restored = new SqliteFeedStore(sql);
  assert.equal(restored.providerBlock(now), 'ERROR-338');
  db.close();
});

test('rejected API key stops later routes on the same object', async () => {
  const { db, store } = sqlite();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ errorMessage: { code: 'INFO-100', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => clockStart, { enabled: ['1', '2'] });
  assert.equal((await engine.positions(['1'])).lines[0].code, 'INFO-100');
  assert.equal((await engine.positions(['2'])).lines[0].code, 'INFO-100');
  assert.equal(calls, 1);
  assert.equal(engine.status().budget.used, 1);
  db.close();
});

test('an undocumented provider code on another route stops an in-flight snapshot before its next page', async () => {
  const { db, store } = sqlite();
  const reports = Array.from({ length: 1000 }, (_, index) => rowFor('1', String(index)));
  let enterFirst;
  let releaseFirst;
  const firstEntered = new Promise(resolve => { enterFirst = resolve; });
  const firstPageGate = new Promise(resolve => { releaseFirst = resolve; });
  const calls = [];
  const fetcher = async url => {
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const start = Number(url.match(/\/realtimePosition\/(\d+)\//)[1]);
    calls.push([name, start]);
    if (name === '1호선') {
      enterFirst();
      await firstPageGate;
      return Response.json(payload(reports, 1500));
    }
    return Response.json({ errorMessage: { code: 'ERROR-337', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => clockStart, { enabled: ['1', '2'] });
  const first = engine.positions(['1']);
  await firstEntered;
  assert.equal((await engine.positions(['2'])).lines[0].code, 'ERROR-337');
  releaseFirst();
  assert.equal((await first).lines[0].code, 'ERROR-337');
  assert.deepEqual(calls, [['1호선', 0], ['2호선', 0]]);
  assert.equal(engine.status().budget.used, 2);
  db.close();
});

test('status exposes the minimum all-line call demand and warns when the cap is too low', () => {
  const { db, store, sql } = sqlite();
  const single = new Line2Engine(store, key, async () => Response.json(payload([])), () => clockStart);
  assert.equal(single.status().continuousDailyCallsMinimum, 720);
  assert.equal(single.status().quotaWarning, null);
  const all = new Line2Engine(store, key, async () => Response.json(payload([])), () => clockStart,
    { enabled: core.enabledLines('all') });
  assert.equal(all.status().continuousDailyCallsMinimum, 13_680);
  assert.match(all.status().quotaWarning, /13\s?680|13680/);
  assert.match(all.status().quotaWarning, /900/);
  const approved = new Line2Engine(new SqliteFeedStore(sql, 15_000), key,
    async () => Response.json(payload([])), () => clockStart, { enabled: core.enabledLines('all') });
  assert.equal(approved.status().quotaWarning, null);
  db.close();
});

test('all verified route names are available but only Line 2 is enabled by default', () => {
  assert.equal(core.SUPPORTED_LINES.length, 19);
  assert.deepEqual(core.enabledLines(), ['2']);
  assert.deepEqual(core.enabledLines('2,GTX-A,2,경강'), ['2', 'GTX-A', '경강']);
  assert.equal(core.enabledLines('all').length, 19);
  assert.equal(core.FEEDS['GTX-A'].providerId, '1032');
  assert.equal(core.normalizeRows([rowFor('GTX-A')], clockStart, 'GTX-A').trains[0].lineId, 'GTX-A');
  assert.equal(core.normalizeRows([rowFor('GTX-A')], clockStart, 'GTX-A').trains[0].providerLineId, '1032');
});

test('multi-line positions preserve request order and separate empty, failed and live routes', async () => {
  const { db, store } = sqlite();
  const names = [];
  const fetcher = async url => {
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    names.push(name);
    if (name === '1호선') return Response.json(payload([rowFor('1')]));
    if (name === '2호선') return Response.json({ errorMessage: { code: 'INFO-200' } });
    if (name === 'GTX-A') return Response.json(payload([rowFor('GTX-A')]));
    return Response.json({ errorMessage: { code: 'ERROR-500', message: key } });
  };
  const engine = new Line2Engine(store, key, fetcher, () => clockStart,
    { enabled: ['1', '2', 'GTX-A', '3'] });
  const result = await engine.positions(['3', '2', 'GTX-A', '1']);
  assert.deepEqual(result.lines.map(line => [line.lineId, line.state]),
    [['3', 'error'], ['2', 'empty'], ['GTX-A', 'ok'], ['1', 'ok']]);
  assert.deepEqual(result.lines[2].trains.map(train => train.providerLineId), ['1032']);
  assert.equal(result.lines[0].message.includes(key), false);
  assert.deepEqual(names.sort(), ['1호선', '2호선', '3호선', 'GTX-A'].sort());
  assert.equal(result.budget.used, 4);
  db.close();
});

test('one object merges concurrent visitors per line and reserves from one quota', async () => {
  const { db, store, sql } = sqlite();
  let now = clockStart;
  const calls = { '1': 0, '2': 0 };
  const fetcher = async url => {
    const lineId = decodeURIComponent(new URL(url).pathname.split('/').at(-1))[0];
    calls[lineId]++;
    await new Promise(resolve => setTimeout(resolve, 15));
    return Response.json(payload([rowFor(lineId)]));
  };
  const engine = new Line2Engine(store, key, fetcher, () => now, { enabled: ['1', '2'] });
  const results = await Promise.all(Array.from({ length: 10 }, () => engine.positions(['1', '2'])));
  assert.deepEqual(calls, { '1': 1, '2': 1 });
  assert.equal(results.every(result => result.lines.every(line => line.state === 'ok')), true);
  assert.equal(results[0].budget.used, 2);
  const restored = new Line2Engine(new SqliteFeedStore(sql), key, fetcher, () => now, { enabled: ['1', '2'] });
  await restored.positions(['2', '1']);
  assert.deepEqual(calls, { '1': 1, '2': 1 });
  now += 121_000;
  await engine.positions(['2']);
  assert.deepEqual(calls, { '1': 1, '2': 2 });
  assert.equal(engine.status().budget.used, 3);
  db.close();
});

test('multi-line requests use at most three upstream calls at once', async () => {
  const { db, store } = sqlite();
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const fetcher = async url => {
    calls++;
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 4));
    active--;
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const lineId = core.SUPPORTED_LINES.find(id => core.FEEDS[id].name === name);
    return Response.json(payload([rowFor(lineId)]));
  };
  const engine = new Line2Engine(store, key, fetcher, () => clockStart,
    { enabled: core.enabledLines('all') });
  const result = await engine.positions(core.enabledLines('all'));
  assert.equal(result.lines.length, 19);
  assert.equal(result.lines.every(line => line.state === 'ok'), true);
  assert.equal(calls, 19);
  assert.ok(maximum <= 3 && maximum > 1);
  assert.equal(result.budget.used, 19);
  db.close();
});

test('all-line opt-in does not override the shared cap or invent freshness', async () => {
  const { db, sql } = sqlite();
  const store = new SqliteFeedStore(sql, 2);
  let calls = 0;
  const fetcher = async url => {
    calls++;
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const lineId = core.SUPPORTED_LINES.find(id => core.FEEDS[id].name === name);
    return Response.json(payload([rowFor(lineId)]));
  };
  const engine = new Line2Engine(store, key, fetcher, () => clockStart,
    { enabled: ['1', '2', '3'], pollSeconds: 120 });
  const result = await engine.positions(['1', '2', '3']);
  assert.equal(result.pollSeconds, 120);
  assert.equal(result.budget.localLimit, 2);
  assert.equal(result.budget.used, 2);
  assert.deepEqual(result.lines.map(line => line.state), ['ok', 'ok', 'error']);
  assert.equal(result.lines[2].code, 'LOCAL_QUOTA_LIMIT');
  assert.equal(calls, 2);
  assert.equal(result.lines[0].trains[0].observedAt, '2026-10-13T05:00:00Z');
  db.close();
});

test('unconfigured object reports enabled and supported routes without fetching', async () => {
  const { db, sql } = sqlite();
  const object = new SeoulLine2Feed({ storage: { sql } },
    { SEOUL_LIVE_LINES: 'all', SEOUL_DAILY_LIMIT: '1500', SEOUL_POLL_SECONDS: '120' });
  const status = await (await object.fetch(new Request('http://localhost/api/live/status'))).json();
  assert.equal(status.configured, false);
  assert.equal(status.enabledLines.length, 19);
  assert.equal(status.supportedLines.length, 19);
  assert.equal(status.budget.localLimit, 1500);
  const result = await (await object.fetch(new Request('http://localhost/api/live/positions?lines=1,GTX-A'))).json();
  assert.deepEqual(result.lines.map(line => line.state), ['unconfigured', 'unconfigured']);
  assert.equal(result.budget.used, 0);
  assert.equal((await object.fetch(new Request('http://localhost/api/live/positions?lines=invalid'))).status, 400);
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
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=not-a-line`), env)).status, 400);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=1,1`), env)).status, 400);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=1,2,GTX-A`), env)).status, 200);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`, { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`, { headers: { Origin: 'https://evil.invalid' } }), env)).status, 403);
  assert.equal(calls, 1);
  assert.equal((await worker.default.fetch(new Request(`${base}?lines=2`), env)).status, 200);
  assert.equal(calls, 2);
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
