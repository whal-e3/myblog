# Seoul Subsurface

An interactive 3D map of 24 Seoul-area rail routes, with a South Korea land
backdrop, static national passenger-rail context, and a curated K-pop place layer.
The four-car train models move on mapped rails, but **every displayed train is
simulated and not live**. Its identity, count, position, direction, timing, and
endpoint are invented for the visualization. Do not use the animation for travel
decisions or arrival predictions.

The simulation does not call the position API. It works without an API key, a
backend connection, or internet access. It uses one counts-only sample of 19
official station-report feeds from 2026-10-14 at 16:31 KST as a rough scale.
That single afternoon sample cannot establish how trains *usually* run across
the day. The time-of-day factors, simulated movement speeds and station pauses,
and densities on five routes without a confirmed reusable feed are modelling
assumptions. They are explicitly labeled in the interface and source. National
rail corridors remain static.

## Preview

From this directory:

```sh
python3 server.py --port 8787 --open
```

Open `http://127.0.0.1:8787/`. Python 3.10+ is required; there are no runtime
Python packages or third-party browser scripts. The server binds to localhost
and serves an explicit list of assets. The existing `.env` may remain in place,
but the map does not connect the live adapter or spend provider requests.

For an offline single-file preview:

```sh
python3 tools/build.py dist/seoul-subway-3d-live.html
```

Open that HTML file directly in a browser. It includes the same simulated
trains and needs no server. The map normally opens over South Korea, then zooms
and tilts into Seoul. Use the scope buttons to switch between South Korea,
Network, and central Seoul. Drag or use the arrow controls to pan; scroll to
zoom; use right-drag, Shift-drag, or the rotate buttons to turn the view.
Ctrl+scroll pans vertically and Shift+scroll pans horizontally. The train
inspector can follow a simulated model. Space pauses its motion. Reduced-motion
settings pause train motion and skip the opening camera animation.

The `Around Korea` sidebar section toggles static regional metro/light rail,
intercity passenger-rail corridors, and Seoul K-pop places. Those national
corridors are physical track alignments, not a complete service timetable or
moving train layer. The K-pop buildings are original, approximate exterior
sketches; see [model references](MODEL-REFERENCES.md).

## Aggregate count profile

[`data/train-density-profile.json`](data/train-density-profile.json) records only
route counts and KST sample times. It does not contain train identifiers,
station-level records, credentials, or a full timetable. The browser loads a
counts-only copy from `data/train-density-profile.js` so the preview also works
from `file://`. Both files currently describe **one** 19-route sample, not an
empirically established typical daily pattern. The animation can continue to
run if the profile is absent, using the labeled illustrative defaults in
`src/simulation.js`.

The optional collector makes **one** manual sweep through the local Python
backend and never schedules itself:

```sh
python3 tools/collect_train_profile.py --collect --server http://127.0.0.1:8787
```

Run it only when the backend has all 19 confirmed feeds explicitly enabled,
enough room under the configured local daily cap, and an approved credential.
It checks the backend status and budget before requesting positions. The
backend owns upstream pagination, shared caching, and its KST quota ledger.
Each uncached route needs at least one provider request; a complete sweep may
need more because of pagination. Repeated samples across different days and
hours would be needed before claiming any usual service pattern. After a
successful sample the collector updates the aggregate JSON and its browser JS
copy. It does not store individual reports. The existing `.env` and request
ledger remain ignored by Git. No new provider sweep is required to run or
test the simulation.

The older `src/live.js`, `server/feed.py`, and `/api/live/*` routes remain for
local feed diagnostics and tests. The visitor-facing page does not call them.
The normal blog build also does not stage this map; release staging remains a
separate later step.

## Data, limits, and verification

The Seoul network is a 2026-08-24 snapshot of 24 source lines, 659 station
records, and 843 source segments. One Suin–Bundang link lacking source geometry
is drawn as a straight connector. Some English names are transliterations.
Routes are separated vertically for clarity, not to show real tunnel depth.
The generic four-car model is not a measured rolling-stock replica.

Geometry attribution and limitations are in [LICENSE-DATA.md](LICENSE-DATA.md).
The aggregate count reference is the [Seoul Metropolitan Government / TOPIS
realtimePosition dataset](https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do).
Its records are station reports, not GPS coordinates. The map does not present
those historical records as current positions. Source code is MIT licensed;
static data retain their separate licenses.

Useful local checks:

```sh
python3 tools/validate_data.py
python3 tools/test_collect_train_profile.py
python3 tests/test_live_server.py
python3 tools/build.py dist/seoul-subway-3d-live.html
python3 tests/test_simulation_browser.py dist/seoul-subway-3d-live.html
```

The browser check requires Playwright and Chromium as optional development
tools. No test in this list needs a live provider request. The older live
adapter tests use synthetic fixtures only. The normal blog build keeps map
assets outside `dist` until the separate, manual release-staging script is
used in a later publication session.
