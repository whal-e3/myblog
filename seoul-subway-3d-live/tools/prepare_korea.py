#!/usr/bin/env python3
"""Build the South Korea land layer from a pinned Natural Earth snapshot.

This is an optional data-preparation step, not a runtime dependency. It needs
Shapely 2.1+ for topology-preserving simplification and constrained triangles.
The generated layer uses the same local x/z kilometre projection as network.js.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.request import urlopen

from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon


ROOT = Path(__file__).resolve().parent.parent
SOURCE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    f"{SOURCE_COMMIT}/geojson/ne_10m_admin_0_countries.geojson"
)
SOURCE_SHA256 = "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255"
LAT0, LON0 = 37.53, 126.98
SCALE_X = 111.32 * math.cos(math.radians(LAT0))


def project(point):
    lon, lat = point
    return ((lon - LON0) * SCALE_X, (LAT0 - lat) * 111.32)


def rounded(point):
    return [round(point[0], 3), round(point[1], 3)]


def build(source_bytes):
    digest = hashlib.sha256(source_bytes).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError(f"Unexpected Natural Earth source checksum: {digest}")
    features = json.loads(source_bytes)["features"]
    country = next(f for f in features if f["properties"].get("ADM0_A3") == "KOR")
    if country["geometry"]["type"] != "MultiPolygon":
        raise ValueError("Unexpected South Korea geometry")

    rings, triangles = [], []
    min_x = min_z = float("inf")
    max_x = max_z = float("-inf")
    total_area = total_triangle_area = 0.0
    for source_polygon in country["geometry"]["coordinates"]:
        # The pinned source has one exterior ring per polygon and no holes.
        if len(source_polygon) != 1:
            raise ValueError("South Korea source gained a polygon hole")
        original = Polygon([project(point) for point in source_polygon[0]])
        if not original.is_valid or original.is_empty:
            raise ValueError("Invalid Natural Earth country polygon")
        bounds = original.bounds
        island_width = min(bounds[2] - bounds[0], bounds[3] - bounds[1])
        # One kilometre is below a pixel in the country view; preserve small
        # islands by limiting their tolerance to a tenth of their short side.
        polygon = original.simplify(min(1.0, island_width * .1), preserve_topology=True)
        ring = [rounded(point) for point in list(polygon.exterior.coords)[:-1]]
        if len(ring) < 3:
            raise ValueError("Simplification collapsed an island")
        rings.append(ring)
        for x, z in ring:
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_z, max_z = min(min_z, z), max(max_z, z)

        mesh = constrained_delaunay_triangles(polygon)
        total_area += polygon.area
        total_triangle_area += sum(triangle.area for triangle in mesh.geoms)
        for triangle in mesh.geoms:
            triangles.extend(rounded(point) for point in list(triangle.exterior.coords)[:3])
    if abs(total_area - total_triangle_area) > .0001:
        raise ValueError("Triangulated land does not cover the country polygons")
    return {
        "meta": {
            "country": "South Korea",
            "source": "Natural Earth 1:10m Admin-0 Countries",
            "sourceCommit": SOURCE_COMMIT,
            "sourceSHA256": SOURCE_SHA256,
            "license": "public domain",
            "projection": {"type": "local equirectangular", "lat0": LAT0, "lon0": LON0, "units": "km"},
            "simplification": "Topology-preserving, up to 1 km per polygon, with small-island detail retained",
        },
        "bounds": {"minX": min_x, "maxX": max_x, "minZ": min_z, "maxZ": max_z},
        "rings": rings,
        "triangles": triangles,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Pinned GeoJSON file; fetch when omitted")
    args = parser.parse_args()
    source_bytes = args.source.read_bytes() if args.source else urlopen(SOURCE_URL, timeout=30).read()
    layer = build(source_bytes)
    output = ROOT / "data" / "korea.js"
    output.write_text(
        "/* South Korea geometry: Natural Earth 1:10m Admin-0 Countries, public domain.\n"
        " * Source and transformation details: LICENSE-DATA.md. */\n"
        "window.SEOUL_KOREA = " + json.dumps(layer, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Prepared {len(layer['rings'])} polygons, {len(layer['triangles']) // 3} triangles; {output.stat().st_size:,} bytes")
    print("Projected bounds:", layer["bounds"])


if __name__ == "__main__":
    main()
