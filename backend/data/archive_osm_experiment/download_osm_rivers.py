"""
Download OSM river data for Romania using the Overpass API.
Only downloads waterway features (not the full country PBF), so RAM usage stays low.

Outputs:
  - data/osm_rivers.json          (river centerlines)
  - data/osm_water_polygons.json  (wide river polygon areas)
"""

import json
import os
import sys
import time
import requests

import geopandas as gpd
import numpy as np
from shapely.geometry import (
    LineString, MultiLineString, Polygon, MultiPolygon,
    shape, mapping
)
from shapely.ops import linemerge

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OUT_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUT_DIR, exist_ok=True)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Douglas-Peucker simplification tolerance (~50m in degrees)
SIMPLIFY_TOLERANCE = 0.0005


def coords_from_line(geom):
    """Convert a LineString/MultiLineString to list of [[lat, lng], ...] segments."""
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [[[round(c[1], 5), round(c[0], 5)] for c in geom.coords]]
    elif isinstance(geom, MultiLineString):
        result = []
        for line in geom.geoms:
            result.append([[round(c[1], 5), round(c[0], 5)] for c in line.coords])
        return result
    return []


def coords_from_polygon(geom):
    """Convert a Polygon/MultiPolygon to list of [[lat, lng], ...] rings."""
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [[[round(c[1], 5), round(c[0], 5)] for c in geom.exterior.coords]]
    elif isinstance(geom, MultiPolygon):
        result = []
        for poly in geom.geoms:
            result.append([[round(c[1], 5), round(c[0], 5)] for c in poly.exterior.coords])
        return result
    return []


def overpass_query(query, label=""):
    """Run an Overpass API query and return the JSON response."""
    print(f"       Querying Overpass API ({label})...")
    t0 = time.time()
    headers = {
        "User-Agent": "AquaGraph/1.0 (Water Pollution Monitor)",
        "Accept": "*/*"
    }
    resp = requests.post(OVERPASS_URL, data={"data": query}, headers=headers, timeout=600)
    resp.raise_for_status()
    data = resp.json()
    elapsed = time.time() - t0
    n_elements = len(data.get("elements", []))
    print(f"       Got {n_elements} elements in {elapsed:.1f}s")
    return data


def elements_to_lines(elements):
    """Convert Overpass JSON elements with 'geometry' to Shapely LineStrings."""
    lines = []
    for el in elements:
        if "geometry" not in el:
            continue
        coords = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
        if len(coords) >= 2:
            line = LineString(coords)
            name = el.get("tags", {}).get("name", "")
            ww_type = el.get("tags", {}).get("waterway", "river")
            lines.append({
                "osm_id": el.get("id", 0),
                "name": name,
                "waterway_type": ww_type,
                "geometry": line,
            })
    return lines


def elements_to_polygons(elements):
    """Convert Overpass JSON relation/way elements to Shapely Polygons."""
    polys = []
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name", "")
        water_type = tags.get("water", "unknown")

        if el["type"] == "way" and "geometry" in el:
            coords = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
            if len(coords) >= 4:
                try:
                    poly = Polygon(coords)
                    if poly.is_valid and poly.area > 0:
                        polys.append({
                            "osm_id": el.get("id", 0),
                            "name": name,
                            "water_type": water_type,
                            "geometry": poly,
                        })
                except Exception:
                    pass

        elif el["type"] == "relation" and "members" in el:
            # Relations: collect outer ways and merge them into closed rings
            outer_lines = []
            for member in el["members"]:
                if member.get("role") == "outer" and "geometry" in member:
                    coords = [(pt["lon"], pt["lat"]) for pt in member["geometry"]]
                    if len(coords) >= 2:
                        outer_lines.append(LineString(coords))

            if outer_lines:
                try:
                    merged = linemerge(outer_lines)
                    rings = merged.geoms if isinstance(merged, MultiLineString) else [merged]
                    for ring in rings:
                        if ring.is_closed and len(ring.coords) >= 4:
                            poly = Polygon(ring)
                            if poly.is_valid and poly.area > 0:
                                polys.append({
                                    "osm_id": el.get("id", 0),
                                    "name": name,
                                    "water_type": water_type,
                                    "geometry": poly,
                                })
                except Exception:
                    pass

    return polys


# ---------------------------------------------------------------------------
# 1.  Download river LINES from Overpass (waterway=river)
# ---------------------------------------------------------------------------
print("[1/4] Downloading river centerlines from Overpass API...")

river_query = """
[out:json][timeout:300];
area["ISO3166-1"="RO"][admin_level=2]->.ro;
(
  way["waterway"="river"](area.ro);
  way["waterway"="stream"](area.ro);
  way["waterway"="canal"](area.ro);
);
out geom;
"""

river_data = overpass_query(river_query, "river lines")
river_elements = elements_to_lines(river_data.get("elements", []))
print(f"       Parsed {len(river_elements)} river line features")


# ---------------------------------------------------------------------------
# 2.  Group by name and merge segments
# ---------------------------------------------------------------------------
print("[2/4] Grouping and merging river segments...")

rivers_out = []
osm_id_counter = 0

# Separate named vs unnamed
named_rivers = {}
unnamed_rivers = []

for feat in river_elements:
    name = feat["name"].strip()
    if name:
        named_rivers.setdefault(name, []).append(feat)
    else:
        unnamed_rivers.append(feat)

# Named rivers: merge segments
for name, feats in named_rivers.items():
    osm_id_counter += 1
    lines = [f["geometry"] for f in feats]
    ww_type = feats[0]["waterway_type"]

    try:
        merged = linemerge(lines)
    except Exception:
        merged = MultiLineString(lines)

    # Simplify
    merged = merged.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

    coords = coords_from_line(merged)
    if not coords:
        continue

    try:
        centroid = merged.centroid
        clat, clon = round(centroid.y, 5), round(centroid.x, 5)
    except Exception:
        clat, clon = 0, 0

    rivers_out.append({
        "osm_id": f"osm_{osm_id_counter}",
        "name": name,
        "waterway_type": ww_type,
        "segment_count": len(feats),
        "coordinates": coords,
        "centroid": [clat, clon],
    })

# Unnamed rivers: keep individually
for feat in unnamed_rivers:
    if feat["waterway_type"] not in ("river", "stream", "canal"):
        continue
    osm_id_counter += 1
    geom = feat["geometry"].simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
    coords = coords_from_line(geom)
    if not coords:
        continue

    try:
        centroid = geom.centroid
        clat, clon = round(centroid.y, 5), round(centroid.x, 5)
    except Exception:
        clat, clon = 0, 0

    rivers_out.append({
        "osm_id": f"osm_{osm_id_counter}",
        "name": "",
        "waterway_type": "river",
        "segment_count": 1,
        "coordinates": coords,
        "centroid": [clat, clon],
    })

print(f"       Total OSM rivers: {len(rivers_out)} ({sum(1 for r in rivers_out if r['name'])} named)")


# ---------------------------------------------------------------------------
# 3.  Download water POLYGONS from Overpass (natural=water, water=river/riverbank)
# ---------------------------------------------------------------------------
print("[3/4] Downloading water polygons from Overpass API...")

polygon_query = """
[out:json][timeout:300];
area["ISO3166-1"="RO"][admin_level=2]->.ro;
(
  way["natural"="water"]["water"="river"](area.ro);
  relation["natural"="water"]["water"="river"](area.ro);
  way["natural"="water"]["water"="riverbank"](area.ro);
  relation["natural"="water"]["water"="riverbank"](area.ro);
  way["natural"="water"]["water"="oxbow"](area.ro);
  relation["natural"="water"]["water"="oxbow"](area.ro);
  way["natural"="water"]["water"="canal"](area.ro);
  relation["natural"="water"]["water"="canal"](area.ro);
  way["natural"="water"]["water"="stream"](area.ro);
  relation["natural"="water"]["water"="stream"](area.ro);
);
out geom;
"""

poly_data = overpass_query(polygon_query, "water polygons")
poly_elements = elements_to_polygons(poly_data.get("elements", []))
print(f"       Parsed {len(poly_elements)} polygon features")

polygons_out = []
for feat in poly_elements:
    geom = feat["geometry"]
    geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

    if geom.is_empty:
        continue

    coords = coords_from_polygon(geom)
    if not coords:
        continue

    try:
        centroid = geom.centroid
        clat, clon = round(centroid.y, 5), round(centroid.x, 5)
    except Exception:
        clat, clon = 0, 0

    # Approximate area in m^2
    try:
        area_m2 = geom.area * (111320 ** 2) * np.cos(np.radians(clat))
    except Exception:
        area_m2 = 0

    polygons_out.append({
        "poly_id": f"wpoly_{feat['osm_id']}",
        "name": feat["name"],
        "water_type": feat["water_type"],
        "area_m2": round(area_m2, 0),
        "coordinates": coords,
        "centroid": [clat, clon],
    })

print(f"       Total water polygons: {len(polygons_out)} ({sum(1 for p in polygons_out if p['name'])} named)")


# ---------------------------------------------------------------------------
# 4.  Write output
# ---------------------------------------------------------------------------
print("[4/4] Writing output files...")

rivers_path = os.path.join(OUT_DIR, "osm_rivers.json")
with open(rivers_path, "w") as f:
    json.dump(rivers_out, f)
sz = os.path.getsize(rivers_path) / 1024 / 1024
print(f"       -> {rivers_path}  ({sz:.1f} MB)")

polys_path = os.path.join(OUT_DIR, "osm_water_polygons.json")
with open(polys_path, "w") as f:
    json.dump(polygons_out, f)
sz = os.path.getsize(polys_path) / 1024 / 1024
print(f"       -> {polys_path}  ({sz:.1f} MB)")

print(f"\nDone! {len(rivers_out)} river lines + {len(polygons_out)} water polygons")
