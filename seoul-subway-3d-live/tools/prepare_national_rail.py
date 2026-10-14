#!/usr/bin/env python3
"""Rebuild the static rail layer outside the existing Seoul metropolitan network.

Install ``osmium>=4`` and download the dated Geofabrik South Korea extract given
in ``SOURCE_URL``. The source file is deliberately not committed (it is ~290 MB).
Run ``python tools/prepare_national_rail.py --pbf /path/to/extract.osm.pbf``.
The output is a small, separately licensed ODbL derivative database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import osmium


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://download.geofabrik.de/asia/south-korea-261013.osm.pbf"
SOURCE_DATE = "2026-10-13"
SOURCE_MD5 = "08b0d3fd8b2fe3ee8e18be02522c88e6"
X_FACTOR = 111.32 * math.cos(math.radians(37.53))
Z_FACTOR = 111.32

# A route relation identifies the geography, not a live feed or a timetable.
# Urban relations are a single service direction: the reverse direction shares
# the same corridor. National route=tracks relations are physical rail lines.
# The list excludes lines already in network.js and lines still under construction.
LINE_SPECS = [
    # id, English, Korean, badge, color, group, city, mode, relation
    ("busan-1", "Busan 1", "부산 도시철도 1호선", "B1", "#F06A00", "Urban", "Busan", "subway", 2201600),
    ("busan-2", "Busan 2", "부산 도시철도 2호선", "B2", "#81BF48", "Urban", "Busan", "subway", 2194999),
    ("busan-3", "Busan 3", "부산 도시철도 3호선", "B3", "#B99B43", "Urban", "Busan", "subway", 2195014),
    ("busan-4", "Busan 4", "부산 도시철도 4호선", "B4", "#0066B3", "Urban", "Busan", "light_rail", 2205952),
    ("busan-gimhae", "Busan–Gimhae Light Rail", "부산김해경전철", "BG", "#8652A0", "Urban", "Busan", "light_rail", 7705729),
    ("donghae-commuter", "Donghae Commuter", "동해선 광역전철", "DH", "#0054A6", "Urban", "Busan", "commuter", 6708903),
    ("daegu-1", "Daegu 1", "대구 도시철도 1호선", "D1", "#D93F5C", "Urban", "Daegu", "subway", 7685464),
    ("daegu-2", "Daegu 2", "대구 도시철도 2호선", "D2", "#00A878", "Urban", "Daegu", "subway", 7685783),
    ("daegu-3", "Daegu 3", "대구 도시철도 3호선", "D3", "#F3B900", "Urban", "Daegu", "monorail", 7685727),
    ("daegyeong", "Daegyeong Commuter", "대경선", "DG", "#007DBA", "Urban", "Daegu", "commuter", 18505697),
    ("daejeon-1", "Daejeon 1", "대전 도시철도 1호선", "DJ", "#0074BA", "Urban", "Daejeon", "subway", 7237829),
    ("gwangju-1", "Gwangju 1", "광주 도시철도 1호선", "GJ", "#1592B5", "Urban", "Gwangju", "subway", 13463724),
    ("gyeongbu-hsl", "Gyeongbu High-Speed Railway", "경부고속선", "HS", "#C04375", "Intercity", "National", "high_speed", 6094351),
    ("honam-hsl", "Honam High-Speed Railway", "호남고속선", "HS", "#C04375", "Intercity", "National", "high_speed", 6095809),
    ("suseo-pyeongtaek-hsl", "Suseo–Pyeongtaek High-Speed Railway", "수서평택고속선", "HS", "#C04375", "Intercity", "National", "high_speed", 6096884),
    ("gyeongbu", "Gyeongbu Line", "경부선", "GB", "#717B8D", "Intercity", "National", "rail", 8842494),
    ("honam", "Honam Line", "호남선", "HN", "#717B8D", "Intercity", "National", "rail", 6094787),
    ("jeolla", "Jeolla Line", "전라선", "JL", "#717B8D", "Intercity", "National", "rail", 6096342),
    ("janghang", "Janghang Line", "장항선", "JH", "#717B8D", "Intercity", "National", "rail", 8827255),
    ("chungbuk", "Chungbuk Line", "충북선", "CB", "#717B8D", "Intercity", "National", "rail", 8827759),
    ("gyeongjeon", "Gyeongjeon Line", "경전선", "GJ", "#717B8D", "Intercity", "National", "rail", 8839114),
    ("jungang", "Jungang Line", "중앙선", "JA", "#717B8D", "Intercity", "National", "rail", 8821065),
    ("gyeonggang-east", "Gyeonggang Line (Wonju–Gangneung)", "경강선 (원주–강릉)", "GG", "#717B8D", "Intercity", "National", "rail", 8825878),
    ("jungbunaeryuk", "Jungbunaeryuk Line", "중부내륙선", "JN", "#717B8D", "Intercity", "National", "rail", 12351758),
    ("seohae-west", "Seohae Line (Hongseong–Seohwaseong)", "서해선 (홍성–서화성)", "SH", "#717B8D", "Intercity", "National", "rail", 13675371),
    ("donghae-rail", "Donghae Line", "동해선", "DH", "#717B8D", "Intercity", "National", "rail", 8835676),
    ("yeongdong", "Yeongdong Line", "영동선", "YD", "#717B8D", "Intercity", "National", "rail", 8831457),
    ("taebaek", "Taebaek Line", "태백선", "TB", "#717B8D", "Intercity", "National", "rail", 8831434),
    ("gyeongbuk", "Gyeongbuk Line", "경북선", "GB", "#717B8D", "Intercity", "National", "rail", 8831468),
    ("mokpo-boseong", "Mokpo–Boseong Line", "목포보성선", "MB", "#717B8D", "Intercity", "National", "rail", 13154614),
    ("daegu-rail", "Daegu Line", "대구선", "DG", "#717B8D", "Intercity", "National", "rail", 6105016),
    ("jeongseon", "Jeongseon Line", "정선선", "JS", "#717B8D", "Intercity", "National", "rail", 8794218),
    ("gyooe", "Gyooe Line", "교외선", "GY", "#717B8D", "Intercity", "National", "rail", 8820278),
]

# The Gwangju route relation omits its two operating terminal stop nodes. Both
# station nodes occur in the same pinned OSM extract and on the mapped path.
EXTRA_STOP_NODES = {13463724: {5190977743, 5277694777}}

# A nearby mainline station need not be a stop on the dedicated HSR tracks.
# These names are stations on the respective dedicated high-speed corridors;
# the layer still does not describe any particular KTX/SRT service pattern.
HSR_STATIONS = {
    "gyeongbu-hsl": {"광명", "천안아산", "오송", "대전", "김천(구미)", "동대구", "경주", "울산", "부산"},
    "honam-hsl": {"오송", "공주", "익산", "정읍", "광주송정"},
    "suseo-pyeongtaek-hsl": {"수서", "동탄", "평택지제"},
}


def project(lat: float, lon: float) -> tuple[float, float]:
    return ((lon - 126.98) * X_FACTOR, (37.53 - lat) * Z_FACTOR)


def verify_source(pbf: Path) -> None:
    checksum = hashlib.md5()
    with pbf.open("rb") as source:
        for block in iter(lambda: source.read(2**20), b""):
            checksum.update(block)
    if checksum.hexdigest() != SOURCE_MD5:
        raise ValueError(f"Source MD5 mismatch: expected {SOURCE_MD5}, got {checksum.hexdigest()}")


class RelationInventory(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.items: list[dict] = []

    def relation(self, relation: osmium.osm.Relation) -> None:
        tags = dict(relation.tags)
        route = tags.get("route")
        if route not in {"tracks", "railway", "subway", "light_rail", "train", "monorail"}:
            return
        self.items.append(
            {
                "id": relation.id,
                "route": route,
                "name": tags.get("name", ""),
                "name:en": tags.get("name:en", ""),
                "ref": tags.get("ref", ""),
                "network": tags.get("network", ""),
                "operator": tags.get("operator", ""),
                "members": len(relation.members),
            }
        )


def inspect(pbf: Path) -> None:
    handler = RelationInventory()
    handler.apply_file(str(pbf))
    print("Relations by route type:", dict(Counter(item["route"] for item in handler.items)))
    for item in sorted(handler.items, key=lambda item: (item["route"], item["name"], item["id"])):
        print(json.dumps(item, ensure_ascii=False))


class SelectedRelations(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.relations: dict[int, dict] = {}

    def relation(self, relation: osmium.osm.Relation) -> None:
        if relation.id not in {spec[-1] for spec in LINE_SPECS}:
            return
        tags = dict(relation.tags)
        self.relations[relation.id] = {
            "ways": {member.ref for member in relation.members if member.type == "w" and member.role != "platform"},
            "stops": {member.ref for member in relation.members if member.type == "n" and member.role in {"stop", "station", ""}},
            "route": tags.get("route"),
            "name": tags.get("name"),
        }


class RailGeometry(osmium.SimpleHandler):
    def __init__(self, way_to_lines: dict[int, list[int]], stop_ids: set[int]) -> None:
        super().__init__()
        self.way_to_lines = way_to_lines
        self.stop_ids = stop_ids
        self.ways: dict[int, list[tuple[int, int, list[tuple[float, float]]]]] = defaultdict(list)
        self.stops: dict[int, dict] = {}
        self.stations: list[dict] = []

    def node(self, node: osmium.osm.Node) -> None:
        tags = dict(node.tags)
        stop = node.id in self.stop_ids
        is_station = tags.get("railway") in {"station", "halt"}
        if not stop and not is_station:
            return
        if not node.location.valid():
            return
        lat, lon = node.location.lat, node.location.lon
        if not (33 <= lat <= 39 and 124 <= lon <= 132):
            return
        x, z = project(lat, lon)
        record = {"osm": node.id, "ko": tags.get("name:ko") or tags.get("name") or "", "en": tags.get("name:en") or "", "lat": lat, "lon": lon, "x": x, "z": z, "station_type": tags.get("station", ""), "train": tags.get("train", "")}
        if stop:
            self.stops[node.id] = record
        if is_station and record["ko"] and tags.get("disused") != "yes" and tags.get("abandoned") != "yes":
            self.stations.append(record)

    def way(self, way: osmium.osm.Way) -> None:
        line_indices = self.way_to_lines.get(way.id)
        if not line_indices:
            return
        tags = dict(way.tags)
        if tags.get("railway") not in {"rail", "subway", "light_rail", "monorail", "narrow_gauge"}:
            return
        if tags.get("service") in {"yard", "siding", "spur", "crossover"}:
            return
        if any(tags.get(key) == "yes" for key in ("abandoned", "disused", "proposed", "construction")):
            return
        nodes = [node for node in way.nodes if node.location.valid()]
        if len(nodes) < 2:
            return
        points = [project(node.location.lat, node.location.lon) for node in nodes]
        if all(point == points[0] for point in points):
            return
        for line in line_indices:
            self.ways[line].append((nodes[0].ref, nodes[-1].ref, points))


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas–Peucker in map kilometres; endpoints are always retained."""
    if len(points) < 3:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    limit = tolerance * tolerance
    while stack:
        start, end = stack.pop()
        ax, az = points[start]
        bx, bz = points[end]
        dx, dz = bx - ax, bz - az
        denom = dx * dx + dz * dz
        best_distance, best_index = limit, None
        for i in range(start + 1, end):
            px, pz = points[i]
            t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / denom)) if denom else 0.0
            dist = (px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2
            if dist > best_distance:
                best_distance, best_index = dist, i
        if best_index is not None:
            keep.add(best_index)
            stack.append((start, best_index))
            stack.append((best_index, end))
    return [points[i] for i in sorted(keep)]


def merge_paths(ways: list[tuple[int, int, list[tuple[float, float]]]]) -> list[list[tuple[float, float]]]:
    """Join ways only at shared OSM nodes with no rail junction."""
    adjacency: dict[int, list[int]] = defaultdict(list)
    for i, (a, b, _) in enumerate(ways):
        adjacency[a].append(i)
        adjacency[b].append(i)
    unused = set(range(len(ways)))
    result = []
    while unused:
        start_index = next((i for i in unused if len(adjacency[ways[i][0]]) != 2 or len(adjacency[ways[i][1]]) != 2), min(unused))
        a, b, points = ways[start_index]
        if len(adjacency[b]) != 2 and len(adjacency[a]) == 2:
            a, b, points = b, a, list(reversed(points))
        unused.remove(start_index)
        chain = list(points)
        current = b
        while len(adjacency[current]) == 2:
            candidates = [i for i in adjacency[current] if i in unused]
            if len(candidates) != 1:
                break
            next_index = candidates[0]
            left, right, next_points = ways[next_index]
            if left == current:
                current = right
            else:
                current = left
                next_points = list(reversed(next_points))
            chain.extend(next_points[1:])
            unused.remove(next_index)
        result.append(chain)
    return result


def distance_squared(px: float, pz: float, ax: float, az: float, bx: float, bz: float) -> float:
    dx, dz = bx - ax, bz - az
    denominator = dx * dx + dz * dz
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / denominator)) if denominator else 0.0
    return (px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2


def path_length(path: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(path, path[1:]))


def remove_parallel_paths(paths: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Keep one visual trace when a route relation maps both physical tracks.

    This operates *within one named corridor only*. A shorter chain is removed
    only if at least 90% of its sampled length follows an already kept chain
    within 300 m. Distinct branches stay visible.
    """
    cell_size = 1.0
    grid: dict[tuple[int, int], list[tuple[float, float, float, float]]] = defaultdict(list)
    accepted: list[list[tuple[float, float]]] = []
    for path in sorted(paths, key=path_length, reverse=True):
        samples = []
        for (ax, az), (bx, bz) in zip(path, path[1:]):
            length = math.hypot(bx - ax, bz - az)
            for step in range(max(1, math.ceil(length))):
                t = step / max(1, math.ceil(length))
                samples.append((ax + (bx - ax) * t, az + (bz - az) * t))
        samples.append(path[-1])
        hits = 0
        for x, z in samples:
            candidates = grid.get((math.floor(x / cell_size), math.floor(z / cell_size)), ())
            if candidates and min(distance_squared(x, z, *piece) for piece in candidates) <= 0.3**2:
                hits += 1
        if accepted and samples and hits / len(samples) >= 0.9:
            continue
        accepted.append(path)
        for (ax, az), (bx, bz) in zip(path, path[1:]):
            min_x, max_x = sorted((ax, bx))
            min_z, max_z = sorted((az, bz))
            for cx in range(math.floor((min_x - 0.3) / cell_size), math.floor((max_x + 0.3) / cell_size) + 1):
                for cz in range(math.floor((min_z - 0.3) / cell_size), math.floor((max_z + 0.3) / cell_size) + 1):
                    grid[(cx, cz)].append((ax, az, bx, bz))
    return accepted


def build(pbf: Path) -> dict:
    verify_source(pbf)
    selected = SelectedRelations()
    selected.apply_file(str(pbf))
    missing = [spec[-1] for spec in LINE_SPECS if spec[-1] not in selected.relations]
    if missing:
        raise ValueError(f"Route relations missing from dated source: {missing}")

    way_to_lines: dict[int, list[int]] = defaultdict(list)
    stop_ids: set[int] = set()
    for line_index, spec in enumerate(LINE_SPECS):
        relation = selected.relations[spec[-1]]
        expected = "tracks" if spec[5] == "Intercity" else ("train" if spec[7] == "commuter" else spec[7])
        if spec[7] == "monorail":
            expected = "monorail"
        if spec[7] == "light_rail" and spec[0] == "busan-4":
            expected = "monorail"
        if relation["route"] != expected:
            raise ValueError(f"Unexpected route tag for {spec[0]}: {relation['route']} != {expected}")
        for way in relation["ways"]:
            way_to_lines[way].append(line_index)
        if spec[5] == "Urban":
            stop_ids.update(relation["stops"])
            stop_ids.update(EXTRA_STOP_NODES.get(spec[-1], ()))

    geometry = RailGeometry(way_to_lines, stop_ids)
    # These native filters keep millions of unrelated nodes and ways out of
    # Python while the location cache still resolves selected way geometry.
    processor = (
        osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.KeyFilter("railway", "public_transport").enable_for(osmium.osm.NODE))
        .with_filter(osmium.filter.IdFilter(way_to_lines).enable_for(osmium.osm.WAY))
    )
    for item in processor:
        if item.is_node():
            geometry.node(item)
        else:
            geometry.way(item)

    lines = []
    segments = []
    raw_paths: dict[int, list[list[tuple[float, float]]]] = {}
    for line_index, spec in enumerate(LINE_SPECS):
        line_id, name, ko, badge, color, group, city, mode, relation = spec
        ways = geometry.ways.get(line_index, [])
        if not ways:
            raise ValueError(f"No active mapped track ways for {line_id}")
        tolerance = 0.035 if group == "Urban" else 0.11
        paths = [simplify(path, tolerance) for path in merge_paths(ways)]
        paths = [path for path in paths if len(path) >= 2 and (path[0] != path[-1] or len(path) >= 3)]
        if group == "Intercity":
            paths = remove_parallel_paths(paths)
        raw_paths[line_index] = paths
        for path in paths:
            segments.append({
                "id": len(segments),
                "line": line_index,
                "points": [[round(x, 2), round(z, 2)] for x, z in path],
                "approximate": False,
            })
        lines.append({
            "id": line_id,
            "name": name,
            "ko": ko,
            "badge": badge,
            "color": color,
            "group": group,
            "city": city,
            "mode": mode,
            "sourceRelations": [relation],
            "stations": 0,
            "segments": len(paths),
        })

    # Select station labels only where the OSM station node is close to a
    # physical corridor. This association is for display, not service calls.
    cell_size = 2.0
    index: dict[tuple[int, int, int], list[tuple[float, float, float, float]]] = defaultdict(list)
    for line_index, paths in raw_paths.items():
        if LINE_SPECS[line_index][5] != "Intercity":
            continue
        for path in paths:
            for (ax, az), (bx, bz) in zip(path, path[1:]):
                min_x, max_x = sorted((ax, bx))
                min_z, max_z = sorted((az, bz))
                for cx in range(math.floor((min_x - 1.0) / cell_size), math.floor((max_x + 1.0) / cell_size) + 1):
                    for cz in range(math.floor((min_z - 1.0) / cell_size), math.floor((max_z + 1.0) / cell_size) + 1):
                        index[(line_index, cx, cz)].append((ax, az, bx, bz))

    station_by_name: dict[str, list[dict]] = defaultdict(list)
    stations: list[dict] = []

    def add_station(record: dict, line_index: int) -> None:
        if not record["ko"]:
            return
        # A complex may have separate stop-position and station nodes; one
        # label within 600 m is enough for the same name.
        match = next((item for item in station_by_name[record["ko"]] if (item["x"] - record["x"]) ** 2 + (item["z"] - record["z"]) ** 2 <= 0.6**2), None)
        if match is None:
            match = {
                "id": len(stations),
                "ko": record["ko"],
                "en": record["en"] or record["ko"],
                "lat": round(record["lat"], 6),
                "lon": round(record["lon"], 6),
                "x": round(record["x"], 3),
                "z": round(record["z"], 3),
                "lines": [],
            }
            stations.append(match)
            station_by_name[record["ko"]].append(match)
        if line_index not in match["lines"]:
            match["lines"].append(line_index)

    for line_index, spec in enumerate(LINE_SPECS):
        if spec[5] != "Urban":
            continue
        for node_id in selected.relations[spec[-1]]["stops"] | EXTRA_STOP_NODES.get(spec[-1], set()):
            record = geometry.stops.get(node_id)
            if record:
                add_station(record, line_index)

    for record in geometry.stations:
        if record["train"] != "yes" and record["station_type"] != "train":
            continue
        cx = math.floor(record["x"] / cell_size)
        cz = math.floor(record["z"] / cell_size)
        for line_index, spec in enumerate(LINE_SPECS):
            if spec[5] != "Intercity":
                continue
            if spec[7] == "high_speed" and record["ko"] not in HSR_STATIONS[spec[0]]:
                continue
            nearby = index.get((line_index, cx, cz), ())
            if nearby and min(distance_squared(record["x"], record["z"], *piece) for piece in nearby) <= 1.0:
                add_station(record, line_index)

    for station in stations:
        station["lines"].sort()
        for line_index in station["lines"]:
            lines[line_index]["stations"] += 1
    for line in lines:
        if line["group"] == "Urban" and line["stations"] < 5:
            raise ValueError(f"Too few station labels in {line['id']}: {line['stations']}")

    output = {
        "meta": {
            "title": "South Korea urban and intercity rail geography",
            "snapshot": SOURCE_DATE,
            "built": "2026-10-14",
            "source": "OpenStreetMap contributors via Geofabrik South Korea extract",
            "sourceUrl": SOURCE_URL,
            "sourceMd5": SOURCE_MD5,
            "license": "Open Data Commons Open Database License (ODbL) 1.0",
            "projection": {"type": "local equirectangular", "lat0": 37.53, "lon0": 126.98, "units": "km"},
            "limitations": "Static railway geography, not a timetable, GPS feed, train coverage claim, or engineering survey. Named physical intercity corridors are not individual KTX, SRT, or ITX service patterns. Urban routes outside the Seoul layer have no live train data. Station membership near intercity corridors is approximate. OpenStreetMap coverage may be incomplete.",
        },
        "lines": lines,
        "stations": stations,
        "segments": segments,
    }
    text = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "data" / "national-rail.json").write_text(text + "\n", encoding="utf-8")
    (ROOT / "data" / "national-rail.js").write_text(
        "/* Rail geography: © OpenStreetMap contributors, ODbL 1.0; details in LICENSE-DATA.md */\n"
        + "window.KOREA_RAIL_DATA = " + text + ";\n",
        encoding="utf-8",
    )
    print(json.dumps({"lines": len(lines), "stations": len(stations), "segments": len(segments), "jsBytes": (ROOT / "data" / "national-rail.js").stat().st_size, "urban": {line["id"]: line["stations"] for line in lines if line["group"] == "Urban"}}, ensure_ascii=False))
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, required=True, help=f"dated source: {SOURCE_URL}")
    parser.add_argument("--inspect", action="store_true", help="list candidate route relations")
    args = parser.parse_args()
    if args.inspect:
        inspect(args.pbf)
    else:
        build(args.pbf)


if __name__ == "__main__":
    main()
