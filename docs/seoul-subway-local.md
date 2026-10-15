# Seoul subway local preview

The subway map is a hobby project previewed at `/miniprj/seoul-subway/`.
Its post at `/blog/seoul-subway/` appears in the Blog listing and in normal
blog builds. The map assets still require the separate release staging step;
the normal blog build does not copy them.

From the blog repository root, start Astro:

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:4321/blog/seoul-subway/` or
`http://127.0.0.1:4321/miniprj/seoul-subway/`, using the port printed by Astro.
Astro serves the allowlisted map files directly. The moving trains are simulated;
the page needs no API key, Python server, or Worker feed. Reload the map after
editing its files.

The optional Python backend remains inside `seoul-subway-3d-live/` for local
diagnostics and manual aggregate-profile collection. See that directory's
README for those tools and data credits. The unused Cloudflare subway feed has
been removed; the blog Worker still serves assets and handles CMS login.

`npm run test:worker` checks that CMS login and routing remain available.
`node --test scripts/subway-preview.test.mjs` checks the local map asset server.
Neither test contacts the Seoul API.

## Publishing

Cloudflare builds the production `main` branch with:

```sh
npm install && npm run build && node scripts/stage-subway.mjs --out dist
```

The deploy command is `npx wrangler deploy`. After a normal build, the explicit
staging command copies only the approved map files
into `dist/miniprj/seoul-subway/`. It does not copy `.env`, Python code,
or test artifacts. The blog post and staged map must be published together,
because the visible post links to the map path. This static simulation needs no
subway API secrets or live feed. Normal local `npm run build` still skips staging.
