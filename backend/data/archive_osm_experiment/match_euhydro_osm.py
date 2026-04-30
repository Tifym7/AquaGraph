"""
Match EU-Hydro river segments to OSM river geometries.

For each EU-Hydro river, find the spatially closest OSM river using
a Shapely STRtree spatial index. This links EU-Hydro's pollution/graph
data to OSM's visually accurate geometry.

Also matches EU-Hydro rivers to OSM water polygons (wide river areas).

Outputs:
  - data/euhydro_osm_match.json
    {
      "<euhydro_river_id>": {
        "osm_river_id": "osm_123",
        "osm_river_name": "Dunarea",
        "distance_deg": 0.002,
        "osm_polygon_ids": ["wpoly_456", ...]
      }
    }
"""

import json
import os
import sys
import time
from collections import defaultdict

import numpy as np
from shapely.geometry import LineString, MultiLineString, Polygon, MultiPolygon
from shapely.strtree import STRtree

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# Max distance (in degrees, ~0.01 deg ~ 1km) to consider a match valid
MAX_MATCH_DISTANCE = 0.02  # ~2km


def rebuild_geometry_from_coords(coords_list, geom_type="line"):
    """Rebuild Shapely geometry from our [[lat,lng], ...] coordinate format."""
    if geom_type == "line":
        lines = []
        for segment in coords_list:
            # Our format is [lat, lng] but Shapely wants (lng, lat)
            points = [(c[1], c[0]) for c in segment]
            if len(points) >= 2:
                lines.append(LineString(points))
        if not lines:
            return None
        if len(lines) == 1:
            return lines[0]
        return MultiLineString(lines)
    elif geom_type == "polygon":
        polys = []
        for ring in coords_list:
            points = [(c[1], c[0]) for c in ring]
            if len(points) >= 4:
                try:
                    p = Polygon(points)
                    if p.is_valid:
                        polys.append(p)
                except Exception:
                    pass
        if not polys:
            return None
        if len(polys) == 1:
            return polys[0]
        return MultiPolygon(polys)
    return None


# ---------------------------------------------------------------------------
# 1.  Load data
# ---------------------------------------------------------------------------
print("[1/4] Loading datasets...")
t0 = time.time()

with open(os.path.join(DATA_DIR, "rivers_romania.json")) as f:
    euhydro_rivers = json.load(f)
print(f"       EU-Hydro rivers: {len(euhydro_rivers)}")

with open(os.path.join(DATA_DIR, "osm_rivers.json")) as f:
    osm_rivers = json.load(f)
print(f"       OSM rivers: {len(osm_rivers)}")

with open(os.path.join(DATA_DIR, "osm_water_polygons.json")) as f:
    osm_polygons = json.load(f)
print(f"       OSM water polygons: {len(osm_polygons)}")

print(f"       Loaded in {time.time() - t0:.1f}s")


# ---------------------------------------------------------------------------
# 2.  Build spatial index from OSM rivers
# ---------------------------------------------------------------------------
print("[2/4] Building spatial index for OSM rivers...")
t0 = time.time()

osm_geoms = []
osm_index_map = []  # parallel list: index -> osm river dict

for river in osm_rivers:
    geom = rebuild_geometry_from_coords(river["coordinates"], "line")
    if geom is not None and not geom.is_empty:
        osm_geoms.append(geom)
        osm_index_map.append(river)

print(f"       Valid OSM geometries: {len(osm_geoms)}")
tree = STRtree(osm_geoms)
print(f"       STRtree built in {time.time() - t0:.1f}s")

# Also build index for polygons
osm_poly_geoms = []
osm_poly_index_map = []

for poly in osm_polygons:
    geom = rebuild_geometry_from_coords(poly["coordinates"], "polygon")
    if geom is not None and not geom.is_empty:
        osm_poly_geoms.append(geom)
        osm_poly_index_map.append(poly)

print(f"       Valid OSM polygon geometries: {len(osm_poly_geoms)}")
if osm_poly_geoms:
    poly_tree = STRtree(osm_poly_geoms)
else:
    poly_tree = None


# ---------------------------------------------------------------------------
# 3.  Match each EU-Hydro river to nearest OSM river
# ---------------------------------------------------------------------------
print("[3/4] Matching EU-Hydro rivers to OSM rivers...")
t0 = time.time()

match_results = {}
matched_count = 0
name_matched_count = 0
spatial_matched_count = 0
unmatched_count = 0

for i, eh_river in enumerate(euhydro_rivers):
    if (i + 1) % 500 == 0:
        print(f"       Processing {i+1}/{len(euhydro_rivers)}...")

    eh_geom = rebuild_geometry_from_coords(eh_river["coordinates"], "line")
    if eh_geom is None or eh_geom.is_empty:
        unmatched_count += 1
        continue

    eh_name = eh_river["name"].strip().upper()
    rid = eh_river["id"]

    # Strategy 1: Name-based match (fast, high confidence)
    best_match = None
    best_distance = float("inf")

    if eh_name and not eh_name.startswith("TRIBUTARY") and not eh_name.startswith("UNNAMED"):
        for j, osm_r in enumerate(osm_index_map):
            osm_name = osm_r["name"].strip().upper()
            if not osm_name:
                continue
            # Check if names match (exact or one contains the other)
            if osm_name == eh_name or eh_name in osm_name or osm_name in eh_name:
                dist = eh_geom.distance(osm_geoms[j])
                if dist < best_distance:
                    best_distance = dist
                    best_match = j

    # If name match found within reasonable distance, use it
    if best_match is not None and best_distance < MAX_MATCH_DISTANCE * 5:
        name_matched_count += 1
    else:
        # Strategy 2: Nearest geometry (spatial index)
        nearest_idx = tree.nearest(eh_geom)
        nearest_geom = osm_geoms[nearest_idx]
        dist = eh_geom.distance(nearest_geom)
        if dist < MAX_MATCH_DISTANCE:
            best_match = nearest_idx
            best_distance = dist
            spatial_matched_count += 1

    # Find matching polygons (any polygon within threshold distance)
    matched_poly_ids = []
    if poly_tree is not None:
        # Query polygons near this river
        buffered = eh_geom.buffer(MAX_MATCH_DISTANCE)
        candidate_idxs = poly_tree.query(buffered)
        for pidx in candidate_idxs:
            poly_geom = osm_poly_geoms[pidx]
            if eh_geom.distance(poly_geom) < MAX_MATCH_DISTANCE:
                matched_poly_ids.append(osm_poly_index_map[pidx]["poly_id"])

    if best_match is not None:
        matched_count += 1
        osm_r = osm_index_map[best_match]
        match_results[rid] = {
            "osm_river_id": osm_r["osm_id"],
            "osm_river_name": osm_r["name"],
            "osm_coordinates": osm_r["coordinates"],
            "distance_deg": round(best_distance, 6),
            "osm_polygon_ids": matched_poly_ids,
        }
    else:
        unmatched_count += 1
        # Still record polygon matches even without a line match
        if matched_poly_ids:
            match_results[rid] = {
                "osm_river_id": None,
                "osm_river_name": None,
                "osm_coordinates": None,
                "distance_deg": None,
                "osm_polygon_ids": matched_poly_ids,
            }

elapsed = time.time() - t0
print(f"       Matching completed in {elapsed:.1f}s")
print(f"       Matched: {matched_count}/{len(euhydro_rivers)} ({100*matched_count/len(euhydro_rivers):.1f}%)")
print(f"         - By name: {name_matched_count}")
print(f"         - By spatial proximity: {spatial_matched_count}")
print(f"       Unmatched: {unmatched_count}")
print(f"       Rivers with polygon data: {sum(1 for v in match_results.values() if v['osm_polygon_ids'])}")


# ---------------------------------------------------------------------------
# 4.  Write output
# ---------------------------------------------------------------------------
print("[4/4] Writing match results...")

out_path = os.path.join(DATA_DIR, "euhydro_osm_match.json")
with open(out_path, "w") as f:
    json.dump(match_results, f)
sz = os.path.getsize(out_path) / 1024 / 1024
print(f"       -> {out_path}  ({sz:.1f} MB)")

print("\nDone!")
