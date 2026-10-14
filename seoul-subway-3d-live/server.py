#!/usr/bin/env python3
"""Local Seoul Subsurface web server + secret-preserving TOPIS proxy.
Run: python server.py --open
Only Python 3.10+ is required. The server binds to 127.0.0.1, not the LAN.
"""
from __future__ import annotations
import argparse
import json
import mimetypes
import os
from pathlib import Path
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
import webbrowser
from server.feed import FEEDS, FeedClient

ROOT = Path(__file__).resolve().parent


def load_env(path: Path):
    """Load a minimal KEY=value .env without executing code or shell expansion."""
    if not path.exists():
        return
    for raw in path.read_text(encoding='utf-8-sig').splitlines():
        raw = raw.strip()
        if not raw or raw.startswith('#') or '=' not in raw:
            continue
        key, value = raw.split('=', 1)
        key, value = key.strip(), value.strip()
        if key.startswith('SEOUL_'):
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            os.environ.setdefault(key, value)


def create_server(root: Path, feed: FeedClient, port: int):
    # Explicit assets only. Never expose .env, runtime files, server code, or directory listings.
    assets = {name: root/name for name in ['index.html', 'src/styles.css', 'src/theme.js', 'src/app.js', 'src/trains.js', 'src/live.js', 'data/network.js', 'data/korea.js', 'data/national-rail.js', 'data/kpop.js']}

    class Handler(BaseHTTPRequestHandler):
        server_version = 'SeoulSubsurface'
        def log_message(self, fmt, *args):
            pass  # No request URL logging (protect against accidentally pasted credentials).

        def reply(self, code, data: bytes, mime='application/json; charset=utf-8'):
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
            self.end_headers()
            if self.command != 'HEAD':
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def json(self, code, obj):
            self.reply(code, json.dumps(obj, ensure_ascii=False, allow_nan=False).encode('utf-8'))

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            host = self.headers.get('Host', '')
            allowed = {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}
            # Blocks DNS-rebinding and cross-site calls that would spend the API quota.
            if host not in allowed:
                return self.json(403, {'error': 'Invalid Host header.'})
            origin = self.headers.get('Origin')
            if origin and origin not in {f'http://{h}' for h in allowed}:
                return self.json(403, {'error': 'Cross-origin access is not allowed.'})
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.json(403, {'error': 'Cross-site access is not allowed.'})
            parsed = urlsplit(self.path)
            if parsed.path == '/api/live/status':
                return self.json(200, feed.status())
            if parsed.path == '/api/live/positions':
                if self.command == 'HEAD':
                    return self.json(200, feed.status())
                raw = parse_qs(parsed.query).get('lines', [''])[0]
                if len(raw) > 500:
                    return self.json(400, {'error': 'Too many line parameters.'})
                requested = raw.split(',') if raw else feed.enabled
                if any(x not in FEEDS for x in requested):
                    return self.json(400, {'error': 'Unknown route. Use the documented route IDs.'})
                return self.json(200, feed.positions(requested))
            name = unquote(parsed.path).lstrip('/') or 'index.html'
            path = assets.get(name)
            if path is None or not path.is_file():
                return self.json(404, {'error': 'Not found.'})
            mime = 'text/javascript' if path.suffix == '.js' else (mimetypes.guess_type(name)[0] or 'application/octet-stream')
            self.reply(200, path.read_bytes(), mime+'; charset=utf-8')

    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    srv.daemon_threads = True
    return srv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--open', action='store_true', help='Open the website in the default browser.')
    args = parser.parse_args()
    load_env(ROOT/'.env')
    try:
        feed = FeedClient(ROOT)
        srv = create_server(ROOT, feed, args.port)
    except (ValueError, OSError) as exc:
        parser.exit(1, f'Cannot start the server: {exc}\n')
    url = f'http://127.0.0.1:{srv.server_port}'
    print(f'Seoul Subsurface: {url}\nPress Ctrl+C to stop.')
    print('Live API key configured.' if feed.configured else 'Live tracking is NOT connected. Set SEOUL_SUBWAY_API_KEY in .env, then restart.')
    if feed.configured and feed.scheme == 'http':
        print('Notice: the documented upstream API uses HTTP; the API key is sent to swopenapi.seoul.go.kr in the URL. See README for HTTPS configuration.')
    if args.open:
        threading.Timer(.5, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        feed.pool.shutdown(wait=False, cancel_futures=True)


if __name__ == '__main__':
    main()
