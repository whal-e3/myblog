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

## South Korea land layer

The full country shape in `data/korea.js` uses the South Korea (`KOR`) polygons
from **Natural Earth 1:10m Admin-0 Countries**:
https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/

The source GeoJSON is pinned to `nvkelso/natural-earth-vector` commit
`ca96624a56bd078437bca8184e78163e5039ad19`:
https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_countries.geojson

`tools/prepare_korea.py` verifies the pinned source SHA-256, extracts all 53
South Korea polygons (including Jeju, Ulleungdo and smaller islands), projects
them into the network's x/z kilometre coordinates, and simplifies the outlines
by at most 1 km while retaining small-island detail. It pre-triangulates the
concave polygons for the 3D renderer. The shape is a geographic backdrop, not
terrain height or a precise administrative survey. Natural Earth data is
**public domain**: https://www.naturalearthdata.com/about/terms-of-use/

## Additional South Korea rail layer

`data/national-rail.json`, `data/national-rail.js`, and the corresponding
standalone map layer are derived from © OpenStreetMap contributors and offered
under the **Open Data Commons ODbL 1.0**. Source: the dated Geofabrik South Korea
extract `south-korea-261013.osm.pbf` (2026-10-13), MD5
`08b0d3fd8b2fe3ee8e18be02522c88e6`:
https://download.geofabrik.de/asia/south-korea-261013.osm.pbf

`tools/prepare_national_rail.py` rebuilds this derivative from the dated
extract using PyOsmium 4.3.1. The source PBF is not committed because it is about
289 MB. The derivative keeps only active tagged track ways associated with
selected route relations, joins ways at shared OSM nodes, simplifies geometry
by up to 35 m for urban services or 110 m for national corridors, collapses
parallel mapped tracks onto a representative trace where they substantially
overlap, then rounds projected coordinates to 10 m. It uses the same local x/z kilometre projection
as `network.js`. Urban station labels come from relation stop nodes; intercity
station labels are OSM train-station nodes within 1 km of a selected corridor.
Dedicated high-speed tracks also use a curated station-name allowlist to avoid
mislabeling nearby metro stations. These are approximate map associations, not
proof of a particular service stopping there.

The layer covers the operating Busan, Daegu, Daejeon, and Gwangju urban
systems and selected named national passenger corridors, including dedicated
high-speed infrastructure. Operator maps and announcements were checked only
to establish that lines are operating; their map artwork is not copied:

* Busan Transportation Corporation: https://www2.humetro.busan.kr/homepage/cyberstation/mapeng.do
* Daejeon Transportation Corporation: https://www.djtc.kr/kor/page.do?menuIdx=39
* Gwangju Transportation Corporation: https://www.grtc.co.kr/cybereng/simple
* Daegu Metropolitan Government metro information: https://car.daegu.go.kr/metro/subway
* KORAIL rail map: https://info.korail.com/info/contents.do?key=857
* KORAIL announcement for Mokpo–Boseong passenger trains: https://info.korail.com/info/selectBbsNttView.do?bbsNo=199&integrDeptCode=&key=911&nttNo=25499
* KORAIL announcement for Gyooe Line passenger service: https://info.korail.com/info/selectBbsNttView.do?bbsNo=199&integrDeptCode=&key=911&nttNo=24027
* KORAIL announcement for resumed Jeongseon tourist trains: https://info.korail.com/info/selectBbsNttView.do?bbsNo=199&integrDeptCode=&key=911&nttNo=26733

This is **not an exhaustive service map** or a timetable. Named intercity
lines indicate physical rail corridors, not individual KTX, SRT, ITX or
Mugunghwa routings. The Seoul metropolitan network is kept in `network.js`;
freight-only spurs, depots, and most short connecting tracks are omitted.
The Gwangju Line, Samcheok Line, and Jinhae Line are omitted pending clear
passenger-service verification for their mapped sections. Unfinished or planned
lines, including Bujeon–Masan, Yangsan, Daegu 4, Daejeon 2, and Gwangju 2,
are not shown. OSM geometry and station tagging can be incomplete or stale.
No position API or live train coverage is implied for these additional routes.

To reproduce the generated files, install `osmium==4.3.1`, download the dated
PBF above, and run `python3 tools/prepare_national_rail.py --pbf <PBF path>`
from this project directory. The script verifies Geofabrik's PBF checksum
before writing the JSON and JavaScript files.

## Station metadata

The upstream source also credits Wikidata, CC0.
https://www.wikidata.org/
https://creativecommons.org/publicdomain/zero/1.0/

Opening dates in the original network are not displayed as current service claims.

## Seoul K-pop landmark markers

`data/kpop.js` is an editorial selection of public-facing Seoul locations,
checked 2026-10-14 against the official company, Seoul Tourism Organization,
Gangnam tourism, or Korea Tourism Organization pages linked on each record.
Markers are approximate POI/building centers, not surveyed building footprints.
Their coordinates are from © OpenStreetMap contributors and remain subject to
the ODbL attribution and reuse terms above; each record links its OSM feature.
The procedural 3D representations are schematic original art, without venue
logos or licensed building models. Office buildings are identified for exterior
viewing only, and program access is not implied.

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
