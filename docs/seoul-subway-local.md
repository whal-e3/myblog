# Seoul subway local preview

The subway map is a hobby project previewed at `/miniprj/seoul-subway/`.
Its post at `/blog/seoul-subway/` appears in the Blog listing and in normal
blog builds. The map assets still require the separate release staging step;
the normal blog build does not copy them.

From the blog repository root, start the local Python server in one terminal:

```sh
cd seoul-subway-3d-live
cp .env.example .env
# Add your approved Seoul realtime-subway key to .env for live Line 2 reports.
python3 server.py
```

The map works without a key, but then shows no live trains. Keep `.env` local;
it is ignored by Git. In another terminal, start Astro:

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:4321/blog/seoul-subway/` or
`http://127.0.0.1:4321/miniprj/seoul-subway/`. In this WSL setup, Windows
Chrome may not reach Astro through the `localhost` hostname. Astro proxies the map files
and `/api/live/*` to the Python server at `127.0.0.1:8787`, so the browser
uses one origin. The source project's README has the feed's data and license
details.

## Local Worker feed

The separate `wrangler.subway-dev.toml` exercises the future Worker feed
locally. This configuration is separate from the unchanged production
`wrangler.toml`. To use it, first build the blog, then start the Worker:

```sh
npm run build
npm run dev:subway-worker
```

Wrangler listens on `127.0.0.1:8788`. For live reports in this local Worker,
put `SEOUL_SUBWAY_API_KEY=<your key>` in a root `.dev.vars` file; Git ignores
that file. The Worker still returns status and an unconfigured feed without a
key. To view its API through the Astro map preview, keep the Python server
running for the map assets and restart Astro with:

```sh
SUBWAY_API_PROXY_TARGET=http://127.0.0.1:8788 npm run dev -- --host 127.0.0.1
```

Only the API proxy changes; the map remains at Astro's origin. Worker tests
use synthetic fixtures and do not contact Seoul's service.

## Release boundary

Do not run the asset staging command as part of normal development or build.
For the later publication session, after a normal build, the explicit command
`node scripts/stage-subway.mjs --out dist` copies only the approved map files
into `dist/miniprj/seoul-subway/`. It does not copy `.env`, Python code,
or test artifacts. The production Worker has no subway binding or enable flag,
and this branch is for local development only. Do not deploy this branch before
the map assets and live feed are ready, because the now-visible post links to
the map path.
