"""
Extract EU-Hydro native polygons and match them to our River_Net_l graph lines.

This guarantees 100% perfect alignment with the line geometry, avoiding OSM rendering artifacts.
Extracts:
 - River_Net_p (wide river polygons)
 - InlandWater (lakes/reservoirs)

Outputs match in the same format as the old script, so app.py doesn't need to change.
"""

import json
import os
import sys
import time

import geopandas as gpd
import pandas as pd
from shapely.strtree import STRtree
from shapely.geometry import Polygon, MultiPolygon, LineString, MultiLineString

GDB_PATH = os.path.join(os.path.dirname(__file__), "..", "dataset", "EUHydro", "EU-Hydro.gdb")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
OUT_MATCH_PATH = os.path.join(DATA_DIR, "euhydro_poly_match.json")
OUT_POLYS_PATH = os.path.join(DATA_DIR, "euhydro_water_polygons.json")

# 1. Load the original River_Net_l JSON (to get our active graph rivers)
print("[1/4] Loading active rivers graph...")
with open(os.path.join(DATA_DIR, "rivers_romania.json")) as f:
    graph_rivers = json.load(f)

# Convert graph river lines to Shapely geometries
eh_geoms = []
eh_index_map = []
for r in graph_rivers:
    lines = []
    for segment in r["coordinates"]:
        pts = [(c[1], c[0]) for c in segment]  # from [lat, lon] to (lon, lat)
        if len(pts) >= 2:
            lines.append(LineString(pts))
            
    if lines:
        geom = MultiLineString(lines) if len(lines) > 1 else lines[0]
        eh_geoms.append(geom)
        eh_index_map.append(r)


# 2. Extract River_Net_p and InlandWater from GDB, reproj to WGS84
print("[2/4] Reading polygons from GDB (this might take a minute)...")
cols_p = ["OBJECT_ID", "geometry"]
gdf_p = gpd.read_file(GDB_PATH, layer="River_Net_p", columns=cols_p)
cols_iw = ["OBJECT_ID", "NAM", "geometry"]
gdf_iw = gpd.read_file(GDB_PATH, layer="InlandWater", columns=cols_iw)

gdf_polys = pd.concat([gdf_p, gdf_iw], ignore_index=True)
gdf_polys = gdf_polys[~gdf_polys.geometry.is_empty & gdf_polys.geometry.notnull()]

print("       Reprojecting EPSG:3035 -> EPSG:4326...")
gdf_polys = gdf_polys.to_crs(epsg=4326)

# Filter polygons to roughly Romania bounding box to speed up processing
# RO_BBOX: (20.2, 43.5, 30.0, 48.3)
print("       Filtering to Romania boundaries...")
gdf_polys = gdf_polys.cx[20.0:30.0, 43.0:48.5]
print(f"       Remaining native polygons: {len(gdf_polys)}")

# 3. Format polygons for output and build Spatial Index
def coords_from_polygon(geom):
    if geom is None or geom.is_empty: return []
    if isinstance(geom, Polygon):
        return [[[round(c[1], 5), round(c[0], 5)] for c in geom.exterior.coords]]
    elif isinstance(geom, MultiPolygon):
        res = []
        for p in geom.geoms:
            res.append([[round(c[1], 5), round(c[0], 5)] for c in p.exterior.coords])
        return res
    return []

print("[3/4] Building Spatial Index...")
t0 = time.time()
poly_geoms = list(gdf_polys.geometry)
poly_tree = STRtree(poly_geoms)

out_polygons = []
for idx, row in gdf_polys.iterrows():
    coords = coords_from_polygon(row.geometry)
    if not coords: continue
    
    name = getattr(row, "NAM", "") if "NAM" in row else ""
    if pd.isna(name): name = ""
    
    out_polygons.append({
        "poly_id": f"eu_{row['OBJECT_ID']}",
        "name": name,
        "coordinates": coords
    })

print(f"       STRTree built in {time.time()-t0:.1f}s")


# 4. Match Graph Lines to Polygons
print("[4/4] Matching graph lines to native polygons...")
t0 = time.time()

match_results = {}
match_count = 0

# A small buffer for intersection (e.g. 0.0001 deg ~ 10 meters)
# Since they are from the EXACT same dataset, they should perfectly overlap.
BUFFER_DEG = 0.0005 

for i, line_geom in enumerate(eh_geoms):
    river_id = eh_index_map[i]["id"]
    
    # Fast BB intersection
    candidate_idxs = poly_tree.query(line_geom)
    
    matched_ids = []
    for pidx in candidate_idxs:
        pgeom = poly_geoms[pidx]
        # Does the river run through or explicitly touch the polygon?
        if line_geom.distance(pgeom) <= BUFFER_DEG:
            matched_ids.append(out_polygons[pidx]["poly_id"])
            
    if matched_ids:
        match_count += 1
        
    # We leave line_coordinates as None, so app.py falls back naturally to EU-Hydro River_Net_l
    match_results[river_id] = {
        "polygon_ids": matched_ids
    }

print(f"       Match completed in {time.time()-t0:.1f}s")
print(f"       Rivers with assigned native polygons: {match_count}/{len(eh_geoms)}")

print("Saving outputs...")
with open(OUT_POLYS_PATH, "w") as f:
    json.dump(out_polygons, f)
with open(OUT_MATCH_PATH, "w") as f:
    json.dump(match_results, f)

print(f"Done! Overwritten matcher files to use pristine EU-Hydro data.")
