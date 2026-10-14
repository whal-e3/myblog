# Seoul Subsurface — live-report edition with dark mode

A three-dimensional atlas of the Seoul metropolitan subway with a full South Korea
land backdrop, a Seoul Metro–inspired blue-and-white / navy-dark interface, source route
colors, pan-first navigation, and an official TOPIS train-position connector. No third-party JavaScript, CDN assets, accounts in the
app, analytics, npm packages, or downloaded train models.

**Live tracking requires your own approved Seoul realtime-subway API key and an internet
connection. No key is included. Without one, the network remains usable but no trains
are invented or shown as live.** The approved key returned complete provider-reported
snapshots for the 19 supported routes during a local survey on 2026-10-14. This does
not establish that the provider reports every operating train. Public hosting has not
been verified against the feed.

## Dark mode and upgrading an existing installation

Use the **sun / moon button in the top-right header** to switch between light and dark.
The dark palette covers the map surface, station labels and markers, train
inspector, dialogs, menus, and exported PNGs. The dataset's route colors are unchanged.
Theme switching does not reset the camera, selected stations/lines/trains, smoothing,
follow mode, feed state, or API settings.

On a first visit, the app follows the device's color preference. Choosing a theme saves
`seoul-subsurface-theme` in this browser's local storage. To follow the device again,
open **About this atlas → Appearance → Use device setting**. An explicit light/dark
selection overrides later device changes. Other tabs update via the storage event.
When browser storage is blocked, toggling still works but the choice lasts only for
that page. Storage availability for a directly opened `file://` HTML depends on the
browser; the local-server version provides a normal, stable site origin.

**To upgrade your live version:** stop the previous server, extract this complete project
to a new folder, copy your existing **`.env`** into that folder, and run
**`start-windows.bat`** (or `python server.py --open`). Do not overwrite your saved key
with `.env.example`. Refresh the browser after restarting. No new API key is needed.
The `src/theme.js` and `data/korea.js` assets are on the server's explicit allowlist; use the new
`server.py` as well as the updated frontend. Script CSP restrictions are unchanged.

## Start on Windows

1. Extract the entire ZIP to a folder. Python **3.10 or newer** must be installed and
   available through `py` or `python`.
2. Open the official dataset page and follow its API-key application instructions:
   https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do
   Dataset name: **서울시 지하철 실시간 열차 위치정보**. Ensure your key is approved
   for the **realtime subway** service. Use the Seoul key expected by `swopenapi`, not
   an unrelated portal's service key. Do not paste the key into the HTML or share it.
3. Copy `.env.example` to a new file named **`.env`**, in the same folder as `server.py`.
   Open it in Notepad and replace `PASTE_YOUR_KEY_HERE`:

   ```dotenv
   SEOUL_SUBWAY_API_KEY=YOUR_ACTUAL_KEY
   ```

   The filename must be `.env`, not `.env.txt`. In PowerShell, the following commands
   make the copy and open the correct file:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

4. Double-click **`start-windows.bat`**. The included server opens the website at
   `http://127.0.0.1:8787`. Keep its terminal open. Close it or press Ctrl+C to stop.
   Alternatively, run `py -3 server.py --open` from the extracted folder.

After a successful fetch, the badge changes from **API KEY REQUIRED** to **LIVE REPORTS**
when fresh, mapped reports exist. Click the badge or **SETUP** to see individual feed
statuses and unmatched-record counts. A valid key can still return no fresh reports,
for example when no services are running or a provider feed is delayed.

Restart the server after editing `.env`. No browser-side credential entry is needed.

## Ubuntu / macOS

```sh
cp .env.example .env
# Edit .env and replace the key placeholder before continuing.
python3 server.py --open
```

`./start.sh` is a convenience launcher. No pip installation is needed to run the app.
A different local port can be chosen with `python3 server.py --port 8788 --open`.

## Important transport and hosting limitation

The provider's documented `swopenapi.seoul.go.kr` endpoint uses **HTTP**. The default
backend configuration follows that documented endpoint; **the API key is sent in the
upstream URL without TLS encryption**. It is hidden from the browser, not encrypted
on that default upstream connection. Use a trusted connection and treat the key as a
credential. `SEOUL_API_SCHEME=https` is available only when HTTPS works for this service
in your environment. HTTPS support has not been validated here; the connector will
**not** silently downgrade or follow a redirect carrying your key elsewhere.

The server binds only to `127.0.0.1`. It explicitly serves website assets, not `.env`,
server code, directory listings, or the request ledger. It rejects cross-origin requests
and unexpected Host headers. **This is a local-use server, not a public hosting stack.**
Do not expose it through port forwarding or remove these checks for deployment. A public
installation needs a production web server, authentication/access control, HTTPS,
per-client limits, and a shared server-side feed cache.

## Navigation and visual design

- The map opens above the full South Korea outline, then zooms toward the Seoul-area
  subway network and tilts into its 3D view. **South Korea** returns to the national
  view; **Network** fits the rail network, and **Seoul** focuses on the center.
  Moving the map interrupts the introduction. Reduced-motion settings skip it.
  The geographic land layer includes Jeju and smaller islands; no grid is drawn.
- **Left-drag / one-finger drag:** pan in the direction of your drag. The map's angle does
  not change. **Arrow keys** and the on-map **Move** arrows pan the view in four
  directions, including on touch screens. Hold a Move arrow to keep panning.
  **Right-drag or Shift-drag:** rotate the view.
  The separate **Rotate** arrows also turn it.
- **Mouse wheel:** zoom around the point under the cursor; it stays pinned during easing.
  **Ctrl + wheel** pans vertically; **Shift + wheel** pans horizontally. On touch screens,
  two fingers pan and pinch around their midpoint. Manual gestures stop camera-follow
  and auto-orbit, but do not stop real data updates.
- Click a train, or press **T**, to inspect its four-car mesh and reported station,
  destination, train number, direction, status, and source timestamp. The model preview
  itself rotates on drag. **Follow train** follows the displayed model; any movement
  between reports is labeled as an estimate.
- The single 3D view includes line visibility and isolation, Korean/English station
  search, image export, geometry export,
  and keyboard controls.
  **Space** toggles brief visual motion, not the feed or real-world trains. Use
  **Pause updates** for the actual polling control.

The interface uses transit blue (`#0052A4`), white panels, navy text, and a pale-blue map.
Each route uses the original color from the bundled source network, without the previous
lightening applied for the dark-green theme. This is an independent visualization,
not an official Seoul Metro interface or branding compliance claim.

## What “live” does — and does not — mean

The connector requests **realtimePosition**, not a timetable, and uses the provider's
actual `trainNo`, `statnNm`, `trainSttus`, `recptnDt`, `updnLine`, and destination fields.
Reports are normalized on the server and matched to the static network by **line +
station name**, including a small explicit alias table. Ambiguous or unmatched stations
are excluded and counted; the adapter never picks a nearby station as a silent guess.
Missing/invalid timestamps are not replaced with the current time.

**These are station/status observations, not continuous GPS coordinates.** The
reported station remains the observation anchor. The app does not know a train's
exact position inside the adjacent tunnel.
The original four-car mesh, exaggerated dimensions, heading and vertical line offsets
are illustrative, not measured rolling-stock or engineering geometry.

When two consecutive observations report the same train at **adjacent mapped stations**,
optional smoothing joins those received stations over **three seconds**. When a newer,
fresh report says **departed**, the display may also move a model a short distance
along the next segment if the previous reported station establishes one unambiguous
outgoing track. This is an explicitly labeled visual estimate, not a measured position,
speed, or arrival prediction. It stops well before the next station; branches,
disconnected or non-adjacent reports, missing route history, stale reports, failures,
and paused updates do not start an estimate. Duplicate reports do not restart motion.
Disabling smoothing or using a reduced-motion setting leaves models at their reported
stations. The former random/simulated train generator is removed from this version.

Freshness is determined from each provider timestamp (Korean time is parsed explicitly):

| Condition | Presentation |
|---|---|
| Age up to 90 seconds, feed healthy | Fresh report; included in fresh train count |
| Older than 90 seconds, update error, or polling paused | Stale label and reduced-opacity train; estimated movement stops |
| Older than 300 seconds, unknown time, or invalid future time | Not rendered as a live train |
| No key, missing/unsupported feed, or empty response | No simulated replacement trains |

Data may be delayed by the provider. The “Latest report” age is the newest visible-line
observation, not a freshness guarantee for every train; inspect an individual train to
see its own report time. Separate line/feed status is available in Connection settings.

## Map coverage versus live coverage

The static atlas still includes **24 source lines, 659 station records, and 843 source
segments**, snapshot **2026-08-24**. Connecting a key does not update that geometry.
New stations absent from this snapshot will appear in unmatched-record diagnostics,
not at invented map positions. See `LICENSE-DATA.md` for provenance and transformations.

The adapter has query mappings for Lines 1–9, AREX, Gyeongui–Jungang, Gyeongchun,
Suin–Bundang, Shinbundang, Gyeonggang, Seohae, Ui–Sinseol, Sillim and GTX-A. On
2026-10-14, the approved key returned HTTP 200 / INFO-000 for a full provider-reported
snapshot of each of these 19 routes: 457 raw reports in total, all within one page per
route. That establishes what the provider reported at the test time, **not** that every
operating train was present or that every feed will remain available. Four additional
route/station name pairs needed exact atlas coordinate fallbacks; AREX Hongdae and
Ui–Sinseol Bomun have no route-specific station geometry in this atlas, so their
coordinates come from the same physical station on another mapped line. Incheon Lines
1/2, Gimpo Goldline, Everline and Uijeongbu have no confirmed reusable live adapter in
this release and remain **MAP ONLY**.

## Polling and request budget

Configuration lives in `.env`; environment variables take precedence:

| Variable | Default | Meaning |
|---|---|---|
| `SEOUL_SUBWAY_API_KEY` | empty | Approved realtime-subway key; never served to clients |
| `SEOUL_LIVE_LINES` | `2` | Comma-separated provider route IDs, or `all` for the 19 surveyed feeds; enabling more lines requires sufficient approved quota |
| `SEOUL_POLL_SECONDS` | `120` | Per-line minimum cache interval; accepts 3–3,600 seconds, subject to your approved quota |
| `SEOUL_DAILY_LIMIT` | `900` | **Local protective cap**, below the provider's 1,000 daily requests |
| `SEOUL_API_SCHEME` | `http` | Explicit upstream transport; see the security note |

The connector fetches each page until it has the full provider-reported line. Every page
uses one request from the persisted daily budget, and an incomplete fetch is shown as an
error rather than a new complete snapshot. One page every 120 seconds uses up to 720
requests per day while the page is active; pagination can use more and may reach the
900-request cap earlier. Nineteen lines at 120-second polling need **at least 13,680
requests per day**, before pagination, so the standard 1,000-call key and this 900-call
protective cap cannot keep them all fresh. Setting `SEOUL_LIVE_LINES=all` under that cap
will exhaust it; it does not make all 24 mapped routes live. The Seoul Open Data Plaza
[explains how to request removal of the subway-key limit](https://data.seoul.go.kr/together/notice/faqList.do)
after registering a working service in its gallery; its FAQ says a local URL is not
eligible for review. This step belongs to the later publication session. Do not raise `SEOUL_DAILY_LIMIT`
beyond the quota actually approved for your key. Reports older than 90 seconds are
marked stale even during a healthy 120-second polling interval. The **local** counter
resets at midnight in Seoul; the provider's reset time has not been verified.

The local server shares a per-line cache, locks and a three-worker request pool across
tabs. Hidden lines and hidden browser tabs do not start further polls; requests already
in progress can finish. Error retries back off to at least 60 seconds. Invalid-key
responses latch until restart. The realtimePosition specification does not define
`ERROR-337` or `ERROR-338`; after either code, this connector pauses calls through the
current local KST day as a precaution, without claiming the provider's cause or reset
time. The local request counter is persisted in `.runtime/api-usage.json`; restarting
does not reset it. Usage by other clients of the same key is not included. Keep one
server instance per project/runtime directory.

Three-second polling of all 19 supported routes would require at least **547,200
requests/day** before pagination. The connector accepts that interval for a key with
explicitly approved capacity, but the current 900-call cap would be reached after roughly
142 seconds if all 19 routes were continuously polled. There is no documented bulk
position request for multiple lines, and the app does not silently substitute station
arrival data for train positions.

## Troubleshooting

**API KEY REQUIRED:** `.env` is missing, named incorrectly, still contains the placeholder,
or the server was not restarted. Opening `index.html` directly is not the live server.

**SERVER REQUIRED:** use `start-windows.bat` or `python server.py --open`. A generic
`python -m http.server`, VS Code Live Server, or a static file host cannot supply the
`/api/live/*` endpoints or protect the upstream key.

**FEED UNAVAILABLE:** click the badge and check the per-line code. Verify key approval,
internet access, the configured transport and quota. Upstream error details are sanitized;
full URLs or raw provider error bodies are intentionally not returned to the browser.

**NO FRESH REPORTS:** check the individual feed state and observation ages. A successful
HTTP response is not proof of current observations. Train names may also fail to map to
this geometry snapshot. No fake trains are inserted to make an empty view look active.

**Local request cap reached:** review `.env` against your actual approved allowance,
reduce the enabled lines or increase the interval. Do not repeatedly delete the ledger
to bypass provider limits.

## Single-file preview versus source project

`dist/seoul-subway-3d-live.html` bundles the full visual atlas. It can be opened locally to
inspect the new theme, search, 3D view and navigation. **A single offline HTML file cannot
obtain live reports on its own.** It intentionally shows SERVER REQUIRED and no synthetic
trains. For live tracking, run the source project's server as described above.

Rebuild the preview with the standard library:

```sh
python tools/build.py dist/seoul-subway-3d-live.html
python tools/validate_data.py
```

`tools/prepare_data.py` is an optional geometry-generation utility, not a runtime dependency;
it additionally requires `shapely` and `text_unidecode`. Original source data are included.

## Architecture and tests

`server/feed.py` handles the fixed TOPIS endpoint, normalization, timestamps, pagination,
cache, quota and sanitized failures. `server.py` handles same-origin HTTP and asset
whitelisting. `src/live.js` handles station matching, persistent train identity, freshness,
bounded visual motion, polling and connection UI. `src/trains.js` supplies the
original triangle meshes, instanced WebGL rendering and software fallback. `src/app.js`
contains map projection, navigation and scene interaction; `src/styles.css` contains the
Metro-inspired palette and responsive layout.

```sh
python tests/test_live_server.py
# Optional Node.js for pure client-model tests (not required by the website):
node tests/test_live_model.cjs
# Optional developer tools only: pip install playwright; install a Chromium browser.
python tests/test_live_browser.py dist/seoul-subway-3d-live.html --chromium /path/to/chromium
```

The server tests cover JSON/XML errors, redaction, timestamp handling across midnight,
zero-valued fields, duplicate reports, missing keys, shared cache, stale retention,
persistent quota, authentication backoff and HTTP asset/origin restrictions. Browser
tests use explicitly **synthetic normalized observations** to verify real rendering,
train identity, station anchoring, short transitions, stale expiration, route colors,
cursor zoom, pan/rotation controls and touch gestures. Fixture screenshots are marked
**TEST FIXTURE — NOT LIVE DATA**. These tests do not prove authorized upstream access.

Application code: MIT. Static data: ODbL / CC0 / SGIS KOGL Type 1 as applicable.
Live source: Seoul Metropolitan Government / TOPIS, KOGL Type 1. See `LICENSE-DATA.md`.

For the later blog release, run `node scripts/stage-subway.mjs --out dist` from the
blog repository root **after** its normal build. This copies the approved map assets
into that build output. The normal build does not call this release-only command.

## Theme regression checks

```sh
python -m unittest discover -s tests -p 'test_theme_assets.py'
python tests/test_theme_browser.py
```

The browser suite requires optional Playwright and Chromium development tooling, not
needed to run the website. It exercises system preference, manual overrides, restoring
a saved choice through a Storage-shaped fixture, blocked storage, cross-tab events,
keyboard/touch controls, all three map projections, train-inspector preservation, and
mobile header layout. See `tests/results/VALIDATION-DARK-MODE.md` for test scope and limits.
