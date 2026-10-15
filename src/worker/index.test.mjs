import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/worker/index.ts'],
  platform: 'node', format: 'esm', bundle: true, write: false,
});
const worker = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

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
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await worker.default.fetch(new Request(auth, { method: 'PUT' }), env)).status, 405);
  assert.equal((await worker.default.fetch(new Request(auth, { method: 'POST' }), env)).status, 400);
  const admin = await worker.default.fetch(new Request('https://sunhyuk.dev/admin/'), env);
  assert.equal(admin.status, 200);
  assert.equal(await admin.text(), 'admin asset');
  assert.equal(assetCalls, 1);
});

test('OAuth remains disabled on preview origins', async () => {
  const env = {
    SITE_ORIGIN: 'https://sunhyuk.dev',
    ASSETS: { fetch: async () => { throw new Error('OAuth must not fall through to assets.'); } },
  };
  const response = await worker.default.fetch(new Request('https://preview.example/oauth/auth'), env);
  assert.equal(response.status, 403);
  assert.equal(await response.text(), 'OAuth disabled on this origin.');
});

test('removed subway API endpoints have no handler or Durable Object export', async () => {
  assert.deepEqual(Object.keys(worker), ['default']);
  const paths = [];
  const env = {
    SITE_ORIGIN: 'https://sunhyuk.dev',
    ASSETS: { fetch: async request => {
      paths.push(new URL(request.url).pathname);
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    } },
  };
  for (const path of ['/api/live/status', '/api/live/positions?lines=2']) {
    assert.equal((await worker.default.fetch(new Request(`https://sunhyuk.dev${path}`), env)).status, 404);
  }
  assert.deepEqual(paths, ['/api/live/status', '/api/live/positions']);
});
