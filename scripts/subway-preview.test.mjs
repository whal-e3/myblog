import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { after, before, test } from 'node:test';
import { serveSubwayAsset } from './subway-preview.mjs';

const prefix = '/miniprj/seoul-subway';
let server;
before(async () => {
  server = createServer((req, res) => serveSubwayAsset(req, res, () => {
    res.writeHead(418);
    res.end('Continue to Astro');
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
});
after(() => new Promise(resolve => server.close(resolve)));

function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the map and every HTML dependency load without a Python backend', async () => {
  const page = await get(`${prefix}/`);
  assert.equal(page.status, 200);
  assert.match(page.body, /SIMULATED TRAINS · NOT LIVE/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.headers['content-security-policy'], /script-src 'self';/);
  const paths = [...page.body.matchAll(/(?:src|href)="((?:src|data)\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const asset = await get(`${prefix}/${path}?v=dev`);
    assert.equal(asset.status, 200, path);
    assert.match(asset.headers['content-type'], path.endsWith('.css') ? /^text\/css/ : /^text\/javascript/);
    assert.ok(asset.body.length > 0, path);
  }
});

test('the slash redirect retains query parameters and HEAD sends no body', async () => {
  const redirect = await get(`${prefix}?debug=1`);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, `${prefix}/?debug=1`);
  const head = await get(`${prefix}/`, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
});

test('backend files, credentials, and traversal paths remain inaccessible', async () => {
  for (const path of ['.env', '%2eenv', 'server.py', 'server/feed.py', 'data/', 'data/../.env', '..%2f.env', 'src/%2e%2e/.env']) {
    const result = await get(`${prefix}/${path}`);
    assert.equal(result.status, 404, path);
    assert.equal(result.body, 'Map asset not found.');
  }
  assert.equal((await get(`${prefix}/%GG`)).status, 400);
});

test('other blog and API routes continue to their existing handlers', async () => {
  for (const path of ['/', '/blog/seoul-subway/', '/projects/', '/admin/', '/oauth/auth', '/api/live/status', `${prefix}-other/`]) {
    assert.equal((await get(path)).status, 418, path);
  }
});

test('map assets only accept GET and HEAD', async () => {
  const result = await get(`${prefix}/`, 'POST');
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'GET, HEAD');
});
