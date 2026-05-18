"""
Extract Romanian river data from EU-Hydro GDB.
Outputs:
  - data/rivers_romania.json   (geometries + metadata for the frontend)
  - data/river_graph.json      (tributary/connectivity graph)
"""

import json
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd

from river_graph_acyclic import enforce_acyclic, invert_to_tributaries
import pyogrio
import geopandas as gpd
from shapely.geometry import MultiLineString, LineString
from shapely.ops import linemerge

GDB_PATH = os.path.join(os.path.dirname(__file__), "..", "dataset", "EUHydro", "EU-Hydro.gdb")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "data")

# # Romania bounding box (rough, in EPSG:4326)
# RO_BBOX_WGS84 = (20.2, 43.5, 29.7, 48.3)

# ---------------------------------------------------------------------------
# 1.  Read River_Net_l - only columns we need
# ---------------------------------------------------------------------------
print("[1/6] Reading River_Net_l from GDB")
cols = [
    "OBJECT_ID", "nameText", "STRAHLER", "FNODE", "TNODE",
    "NEXTUPID", "NEXTDOWNID", "REX", "LENGTH", "CUM_LEN",
]
gdf = gpd.read_file(GDB_PATH, layer="River_Net_l", columns=cols)
print(f"       Total segments: {len(gdf)}")

# ---------------------------------------------------------------------------
# 2.  Skip filtering (Load entire dataset)
# ---------------------------------------------------------------------------
print("[2/6] Keeping all segments (Entire Europe/Dataset)")
gdf_all = gdf.copy()

# Drop the full dataset reference to save memory if needed
del gdf

# ---------------------------------------------------------------------------
# 3.  Reproject EPSG:3035 → EPSG:4326 and simplify
# ---------------------------------------------------------------------------
print("[3/6] Reprojecting to WGS84 and simplifying")
gdf_all = gdf_all.to_crs(epsg=4326)

# Douglas-Peucker simplification (tolerance in degrees ≈ 0.0005° ≈ 50m)
gdf_all["geometry"] = gdf_all["geometry"].simplify(0.0005, preserve_topology=True)

# Drop empty/null geometries
gdf_all = gdf_all[~gdf_all.geometry.is_empty & gdf_all.geometry.notna()].copy()
print(f"       Segments after cleanup: {len(gdf_all)}")

# ---------------------------------------------------------------------------
# 4.  Build named-river groups and per-segment data
# ---------------------------------------------------------------------------
print("[4/6] Grouping segments by river name")

# Assign a display name - unnamed segments get "Tributary-{OBJECT_ID}"
def clean_river_name(name):
    if not name or not isinstance(name, str):
        return ""
    name = name.strip()
    upper = name.upper()
    # Normalize Danube (Dunarea) branches to a single river
    if upper.startswith("DUNARE") or upper.startswith("DUNĂRE") or upper == "BRAT DUNAREA VECHE":
        return "Dunărea"
    
    # Clean up other major rivers that are split by sectors (e.g., "MURES, CONF. CERNA - CONF. DOBRA")
    for major in ["MURES", "OLT", "SIRET", "PRUT", "SOMES"]:
        if upper.startswith(major + ",") or upper.startswith(major + " -") or upper.startswith(major + " ("):
            if upper == "SOMESUL MIC" or upper == "SOMESUL MARE": continue # edge case
            return name.split(",")[0].split(" -")[0].split(" (")[0].strip()
            
    return name

gdf_all["display_name"] = gdf_all["nameText"].apply(clean_river_name)
unnamed_mask = gdf_all["display_name"].str.strip() == ""
gdf_all.loc[unnamed_mask, "display_name"] = "Unnamed-" + gdf_all.loc[unnamed_mask, "OBJECT_ID"].astype(str)

# For named rivers, group segments together and merge geometries
named = gdf_all[~unnamed_mask].copy()
unnamed = gdf_all[unnamed_mask].copy()

rivers_out = []
river_id_counter = 0
segment_to_river = {}   # OBJECT_ID -> river_id  (for graph building)
river_name_to_id = {}   # display_name -> river_id


def coords_to_list(geom):
    """Convert a geometry to a list of [lat, lng] coordinate arrays."""
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

# --- Named rivers: merge segments ---
for name, group in named.groupby("display_name"):
    river_id_counter += 1
    rid = f"river_{river_id_counter}"
    river_name_to_id[name] = rid

    # Merge all line segments for this river
    lines = []
    max_strahler = 0
    total_length = 0
    for _, row in group.iterrows():
        segment_to_river[row["OBJECT_ID"]] = rid
        geom = row.geometry
        if isinstance(geom, LineString):
            lines.append(geom)
        elif isinstance(geom, MultiLineString):
            lines.extend(geom.geoms)
        strahler = row.get("STRAHLER", 1)
        if strahler and not np.isnan(strahler):
            max_strahler = max(max_strahler, int(strahler))
        seg_len = row.get("LENGTH", 0)
        if seg_len and not np.isnan(seg_len):
            total_length += float(seg_len)

    try:
        merged = linemerge(lines)
    except Exception:
        merged = MultiLineString(lines)

    coords = coords_to_list(merged)
    if not coords:
        continue

    rivers_out.append({
        "id": rid,
        "name": name,
        "strahler": max_strahler,
        "length_m": round(total_length, 1),
        "segment_count": len(group),
        "coordinates": coords,
    })

# --- Unnamed segments: only include Strahler >= 3 ---
for _, row in unnamed.iterrows():
    strahler = row.get("STRAHLER", 1)
    if strahler and not np.isnan(strahler) and int(strahler) >= 3:
        river_id_counter += 1
        rid = f"river_{river_id_counter}"
        segment_to_river[row["OBJECT_ID"]] = rid

        coords = coords_to_list(row.geometry)
        if not coords:
            continue

        rivers_out.append({
            "id": rid,
            "name": f"Tributary ({row['OBJECT_ID']})",
            "strahler": int(strahler),
            "length_m": round(float(row.get("LENGTH", 0) or 0), 1),
            "segment_count": 1,
            "coordinates": coords,
        })
    else:
        # Still track for graph building even if we don't render
        segment_to_river[row["OBJECT_ID"]] = None

print(f"       Rivers/tributaries for rendering: {len(rivers_out)}")

# ---------------------------------------------------------------------------
# 5.  Build river connectivity graph
# ---------------------------------------------------------------------------
print("[5/6] Building connectivity graph")

# Build segment-level adjacency from NEXTDOWNID
# segment A's NEXTDOWNID = segment B  ⟹  A flows into B
seg_downstream = {}
seg_upstream = defaultdict(list)

for _, row in gdf_all.iterrows():
    oid = row["OBJECT_ID"]
    down = row.get("NEXTDOWNID")
    if down and isinstance(down, str) and down.strip():
        seg_downstream[oid] = down
        seg_upstream[down].append(oid)

# Lift to river-level: if segment A (in river X) flows into segment B (in river Y),
# then river X is a tributary of river Y.
river_tributaries = defaultdict(set)   # river_id -> set of tributary river_ids
river_flows_into = {}                  # river_id -> downstream river_id

for seg_id, down_seg_id in seg_downstream.items():
    src_river = segment_to_river.get(seg_id)
    dst_river = segment_to_river.get(down_seg_id)
    if src_river and dst_river and src_river != dst_river:
        river_flows_into[src_river] = dst_river

# The per-segment lift above is single-valued and order-dependent, so when
# EU-Hydro splits one channel into a "named" + "Tributary (RL…)" reach whose
# segments cross back and forth, it produces X→Y and Y→X cycles. Break them
# deterministically (drop the basin outlet's out-edge) and rebuild
# tributaries as the exact inverse so both relations stay consistent and the
# tributary graph is itself acyclic.
_strahler = {r["id"]: r.get("strahler", 1) for r in rivers_out}
_length = {r["id"]: r.get("length_m", 0) for r in rivers_out}
river_flows_into, _broken = enforce_acyclic(
    river_flows_into,
    priority=lambda rid: (_strahler.get(rid, 1), _length.get(rid, 0), rid),
)
river_tributaries = invert_to_tributaries(river_flows_into)
print(f"       Cycles broken in connectivity graph: {len(_broken)}")

# Build the graph JSON
river_id_to_name = {r["id"]: r["name"] for r in rivers_out}
graph_out = {}
for r in rivers_out:
    rid = r["id"]
    tribs = [
        {"id": t, "name": river_id_to_name.get(t, "Unknown")}
        for t in river_tributaries.get(rid, set())
        if t in river_id_to_name
    ]
    flows = river_flows_into.get(rid)
    graph_out[rid] = {
        "tributaries": sorted(tribs, key=lambda x: x["name"]),
        "flows_into": {
            "id": flows,
            "name": river_id_to_name.get(flows, "Unknown"),
        } if flows and flows in river_id_to_name else None,
    }

print(f"       Rivers with tributaries: {sum(1 for v in graph_out.values() if v['tributaries'])}")
print(f"       Rivers that flow into another: {sum(1 for v in graph_out.values() if v['flows_into'])}")

# ---------------------------------------------------------------------------
# 6.  Write output
# ---------------------------------------------------------------------------
print("[6/6] Writing output files")
os.makedirs(OUT_DIR, exist_ok=True)

rivers_path = os.path.join(OUT_DIR, "rivers_romania.json")
with open(rivers_path, "w") as f:
    json.dump(rivers_out, f)
print(f"       → {rivers_path}  ({os.path.getsize(rivers_path) / 1024 / 1024:.1f} MB)")

graph_path = os.path.join(OUT_DIR, "river_graph.json")
with open(graph_path, "w") as f:
    json.dump(graph_out, f, indent=2)
print(f"       → {graph_path}  ({os.path.getsize(graph_path) / 1024:.0f} KB)")

print("\nDone!")
