# Data sources, license, and transformation notes

## Source snapshot

Network compilation: **wantaekchoi/seoul-subway**
https://github.com/wantaekchoi/seoul-subway

Pinned commit: `498fbc62e01479905e22c0577d60e8b875e86ace`
Dataset-generated date: **2026-08-24**.

The original network and basemap are bundled as `data/upstream-network.json`
and `data/upstream-basemap.topo.json`. All 24 source lines, 659 station records,
and 843 source segments are retained in the visualization database.

## Geographic rail and water database

© OpenStreetMap contributors.
https://www.openstreetmap.org/copyright

Available under the Open Data Commons Open Database License (ODbL) 1.0:
https://opendatacommons.org/licenses/odbl/1-0/

The rail and water portions of `data/network.json`, `data/network.js`, and
the embedded standalone HTML database are derivative databases offered under
the ODbL. A machine-readable copy of the complete derivative database is
provided in this project and through the website's “Export network JSON” action.
Keep appropriate attribution when displaying or redistributing the data or
produced maps, and comply with ODbL obligations when modifying the database.

## Administrative boundaries

Statistics Korea SGIS, 2018 administrative geography.
Korea Open Government License (KOGL) Type 1: attribution required.
https://sgis.kostat.go.kr/
https://www.kogl.or.kr/info/license.do

Boundary layers remain separately licensed and are not relicensed under MIT.
The original upstream basemap includes the source attribution metadata.

## Korean Peninsula locator

The small geographic locator in `index.html` uses the North Korea (`PRK`) and
South Korea (`KOR`) polygons from **Natural Earth 1:10m Admin-0 Countries**:
https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/

The source GeoJSON was taken from `nvkelso/natural-earth-vector`, pinned to
commit `ca96624a56bd078437bca8184e78163e5039ad19`:
https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_countries.geojson

The inset retains polygons of at least 0.006 square degrees, including Jeju
and Ulleungdo, simplifies their outer rings with a 0.025-degree tolerance,
and projects them into the inline SVG. The Seoul dot is placed at the map's
existing approximate geographic origin (37.53° N, 126.98° E); it is not a
surveyed boundary of the subway network. Natural Earth data is public domain:
https://www.naturalearthdata.com/about/terms-of-use/

## Station metadata

The upstream source also credits Wikidata, CC0.
https://www.wikidata.org/
https://creativecommons.org/publicdomain/zero/1.0/

Opening dates in the original network are not displayed as current service claims.

## Transformations

* Longitude/latitude projected to local equirectangular x/z coordinates, in km,
  using origin latitude 37.53° N, longitude 126.98° E.
* Source segment shapes oriented to source endpoints and snapped at the two
  ends to source station-center positions. Interior geometry retained.
* One Suin–Bundang segment without source path geometry is represented by a
  straight station-to-station line, marked `approximate: true` in the database.
* Duplicate adjacent path vertices removed; all source segment records retained.
* Water and boundary polygons clipped and simplified; water triangulated for WebGL.
* Display route colors now use the source palette unchanged; also retained as `originalColor`.
* Common English station aliases added; other names automatically transliterated.
  `transliterated: true` identifies those labels. Korean source names retained.
* Vertical line positions are entirely synthetic visualization offsets. They are
  not engineering, tunnel-depth, track-elevation, or station-floor measurements.

Original application code is separately MIT-licensed. The upstream compiler's
MIT notice is preserved in `licenses/upstream-MIT.txt` for reference; its web
application code has not been incorporated into this renderer.

## Procedural rolling stock

The train meshes in `src/trains.js` are original application geometry, covered by
the application MIT license. They do not include downloaded commercial assets,
textures, branding, font files, or fleet-specific engineering models. Train dimensions and orientation are illustrative; live position anchors come from TOPIS station observations. The geographic source licensing is unchanged.

## Live train position reports

Provider and copyright holder: **Seoul Metropolitan Government / TOPIS**.
Dataset: **서울시 지하철 실시간 열차 위치정보** (realtime train positions).
https://data.seoul.go.kr/dataList/OA-12601/A/1/datasetView.do
Official metadata checked 2026-10-13: Korea Open Government License Type 1, attribution.

The default source ZIP contains no captured live reports and no credentials. At runtime,
provider fields are normalized and matched by line and station name to the geographic
station database. Report time is preserved. Four-car model positions are station-level
anchors, not continuous geographic telemetry. Optional brief transitions are generated
visualization, not additional observations. Unmatched station names and unknown times
are excluded from live display.

API availability, approval, traffic limits and operational coverage remain subject to the
provider. A 24-line static map does not imply live coverage of all 24 lines. The network
snapshot is not continuously updated when a live API key is configured. No affiliation
with or endorsement by Seoul Metro is asserted.
