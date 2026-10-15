import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { SUBWAY_ASSETS } from './subway-assets.mjs';

const prefix = '/miniprj/seoul-subway';
const source = new URL('../seoul-subway-3d-live/', import.meta.url);
const assets = new Set(SUBWAY_ASSETS);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

export async function serveSubwayAsset(request, response, next) {
  const url = request.url || '/';
  const path = url.split('?')[0];
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return next();

  const reply = (status, message, extra = {}) => {
    response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return reply(405, 'Method not allowed.', { Allow: 'GET, HEAD' });
  }
  if (path === prefix) {
    return reply(308, '', { Location: `${prefix}/${url.slice(path.length)}` });
  }

  let file;
  try {
    file = decodeURIComponent(path.slice(prefix.length + 1)) || 'index.html';
  } catch {
    return reply(400, 'Invalid asset path.');
  }
  // Exact matches only: never expose .env, the quota ledger, source tools, or directories.
  if (!assets.has(file)) return reply(404, 'Map asset not found.');

  try {
    const data = await readFile(new URL(file, source));
    response.writeHead(200, {
      ...headers,
      'Content-Type': types[extname(file)] || 'text/plain; charset=utf-8',
      'Content-Length': data.length,
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    reply(error.code === 'ENOENT' ? 404 : 500, 'Map asset unavailable.');
  }
}

export function subwayPreview() {
  return {
    name: 'subway-static-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(serveSubwayAsset);
    },
  };
}
