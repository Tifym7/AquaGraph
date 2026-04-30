"""
Extract European river data with pollution indices from enhanced EU-Hydro GeoJSON files.
Outputs:
  - data/rivers_europe_pollution.json   (geometries + metadata + pollution indices + risk)
  - data/river_graph_pollution.json     (tributary/connectivity graph)
"""

import json
import os
import glob as glob_mod
from collections import defaultdict

import numpy as np
import geopandas as gpd
from shapely.geometry import MultiLineString, LineString
from shapely.ops import linemerge

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "dataset", "ehanced_eu_hydro")
OUT_DIR   = os.path.join(os.path.dirname(__file__), "data")

INDEX_FIELDS = ["NDVI", "MNDWI", "NDTI", "NDCI", "BSI", "TURBIDITY"]
RISK_FIELDS  = ["risk_score", "risk_level", "water_risk", "land_risk", "is_water"]


def extract_indices(row):
    """Extract pollution index values from a feature's properties.
    Only includes fields that have actual values; missing indices are omitted entirely.
    """
    indices = {}
    for field in INDEX_FIELDS:
        val = row.get(field)
        if val is not None and not (isinstance(val, float) and np.isnan(val)):
            indices[field] = float(val)
    return indices


def extract_risk(row):
    """Extract risk values from a feature's properties.
    Numeric fields are converted to float; string fields (like risk_level) are kept as-is.
    """
    result = {}
    for f in RISK_FIELDS:
        val = row.get(f, 0)
        if val is None:
            result[f] = 0
        elif isinstance(val, str):
            result[f] = val
        elif isinstance(val, (int, float)):
            result[f] = float(val)
        else:
            result[f] = 0
    return result


def coords_to_list(geom):
    """Convert a geometry to a list of [lat, lng] coordinate arrays."""
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [[[round(c[1], 5), round(c[0], 5)] for c in geom.coords]]
    if isinstance(geom, MultiLineString):
        return [[[round(c[1], 5), round(c[0], 5)] for c in line.coords] for line in geom.geoms]
    return []


def clean_river_name(name):
    """Normalize river names (same logic as extract_rivers.py)."""
    if not name or not isinstance(name, str):
        return ""
    name = name.strip()
    upper = name.upper()
    if upper.startswith("DUNARE") or upper.startswith("DUNĂRE") or upper == "BRAT DUNAREA VECHE":
        return "Dunărea"
    for major in ["MURES", "OLT", "SIRET", "PRUT", "SOMES"]:
        if upper.startswith(major + ",") or upper.startswith(major + " -") or upper.startswith(major + " ("):
            if upper in ("SOMESUL MIC", "SOMESUL MARE"):
                continue
            return name.split(",")[0].split(" -")[0].split(" (")[0].strip()
    return name


# ------
# 1.  Load all GeoJSON partitions into a flat list of (row_dict, geometry) records
# ------
print("[1/6] Loading all GeoJSON partitions")

# Collect all rows into a list of dicts with geometry attached
all_rows = []
geojson_files = sorted(glob_mod.glob(os.path.join(DATA_PATH, "rivers_part_*.geojson")))
print(f"       Found {len(geojson_files)} files")

for fpath in geojson_files:
    gdf_part = gpd.read_file(fpath)
    gdf_part = gdf_part.to_crs(epsg=4326)
    for _, row in gdf_part.iterrows():
        all_rows.append((row.to_dict(), gpd.GeoSeries([row.geometry])[0]))
    print(f"       {os.path.basename(fpath)}: {len(gdf_part)} segments")

print(f"       Total segments loaded: {len(all_rows)}")

# ------
# 2.  Simplify coordinates and clean
# ------
print("[2/6] Simplifying geometries")
cleaned = []
for row_dict, geom in all_rows:
    simplified = geom.simplify(0.0005, preserve_topology=True)
    if simplified.is_empty or simplified is None:
        continue
    cleaned.append((row_dict, simplified))
all_rows = [(d, g) for d, g in cleaned]
del cleaned
print(f"       Segments after cleanup: {len(all_rows)}")

# ------
# 3.  Classify named vs unnamed rivers
# ------
print("[3/6] Cleaning river names")
unnamed_mask = []
row_dicts = []
geoms = []
for row_dict, geom in all_rows:
    name = clean_river_name(row_dict.get("nameText", ""))
    row_dict["display_name"] = name if name.strip() else f"Unnamed-{row_dict['OBJECT_ID']}"
    unnamed_mask.append(name.strip() == "")
    row_dicts.append(row_dict)
    geoms.append(geom)

unnamed_set = {i for i, m in enumerate(unnamed_mask) if m}
named_set = {i for i, m in enumerate(unnamed_mask) if not m}
print(f"       Named rivers: {len(named_set)}")
print(f"       Unnamed segments: {len(unnamed_set)}")

# ------
# 4.  Build river groups with pollution indices and risk data
# ------
print("[4/6] Grouping segments by river name with pollution indices")

rivers_out = []
river_id_counter = 0
segment_to_river = {}
river_id_to_segments = {}

# Helper: collect all rows for a given river id via groupby keys
# We'll group by display_name manually since we're not using GeoDataFrame
named_by_name = defaultdict(list)  # display_name -> list of index
for i in named_set:
    named_by_name[row_dicts[i]["display_name"]].append(i)

# --- Named rivers: merge segments ---
print("       Processing named rivers...")
for name, indices in named_by_name.items():
    river_id_counter += 1
    rid = f"river_{river_id_counter}"

    lines = []
    max_strahler = 0
    total_length = 0
    river_indices_agg = {field: [] for field in INDEX_FIELDS}
    river_risk_agg = {field: [] for field in RISK_FIELDS}

    for i in indices:
        row_dict = row_dicts[i]
        geom = geoms[i]
        segment_to_river[row_dict["OBJECT_ID"]] = rid

        if isinstance(geom, LineString):
            lines.append(geom)
        elif isinstance(geom, MultiLineString):
            lines.extend(geom.geoms)

        strahler = row_dict.get("STRAHLER", 1)
        if strahler and not np.isnan(strahler):
            max_strahler = max(max_strahler, int(strahler))
        seg_len = row_dict.get("LENGTH", 0)
        if seg_len and not np.isnan(seg_len):
            total_length += float(seg_len)

        seg_indices = extract_indices(row_dict)
        seg_risk = extract_risk(row_dict)

        river_id_to_segments.setdefault(rid, []).append({
            "object_id": str(row_dict["OBJECT_ID"]),
            "coordinates": coords_to_list(geom),
            "indices": seg_indices,
            "risk": seg_risk,
        })

        for f in INDEX_FIELDS:
            v = seg_indices.get(f)
            if v is not None:
                river_indices_agg[f].append(v)
        for f in RISK_FIELDS:
            river_risk_agg[f].append(seg_risk.get(f, 0))

    avg_indices = {f: round(np.mean(vals), 4) if vals else None for f, vals in river_indices_agg.items()}
    avg_risk = {
        f: round(np.mean(vals), 4) if vals and isinstance(vals[0], (int, float)) else (vals[0] if vals else 0)
        for f, vals in river_risk_agg.items()
    }

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
        "segment_count": len(indices),
        "coordinates": coords,
        "segments": river_id_to_segments[rid],
        "avg_indices": avg_indices,
        "avg_risk": avg_risk,
    })

# --- Unnamed segments: only include Strahler >= 3 ---
print("       Processing unnamed tributaries (Strahler >= 3)...")
for i in unnamed_set:
    row_dict = row_dicts[i]
    geom = geoms[i]
    strahler = row_dict.get("STRAHLER", 1)
    if strahler and not np.isnan(strahler) and int(strahler) >= 3:
        river_id_counter += 1
        rid = f"river_{river_id_counter}"
        segment_to_river[row_dict["OBJECT_ID"]] = rid
        seg_indices = extract_indices(row_dict)
        seg_risk = extract_risk(row_dict)
        coords = coords_to_list(geom)
        if not coords:
            continue
        rivers_out.append({
            "id": rid,
            "name": f"Tributary ({row_dict['OBJECT_ID']})",
            "strahler": int(strahler),
            "length_m": round(float(row_dict.get("LENGTH", 0) or 0), 1),
            "segment_count": 1,
            "coordinates": coords,
            "segments": [{"object_id": str(row_dict["OBJECT_ID"]), "coordinates": coords, "indices": seg_indices, "risk": seg_risk}],
            "avg_indices": seg_indices,
            "avg_risk": seg_risk,
        })
    else:
        segment_to_river[row_dict["OBJECT_ID"]] = None

del row_dicts, geoms, named_by_name, unnamed_set, named_set
print(f"       Rivers/tributaries for rendering: {len(rivers_out)}")

# ------
# 5.  Build river connectivity graph
# ------
print("[5/6] Building connectivity graph")

seg_downstream = {}
for row_dict, geom in all_rows:
    oid = row_dict["OBJECT_ID"]
    down = row_dict.get("NEXTDOWNID")
    if down and isinstance(down, str) and down.strip():
        seg_downstream[oid] = down

river_tributaries = defaultdict(set)
river_flows_into = {}

for seg_id, down_seg_id in seg_downstream.items():
    src_river = segment_to_river.get(seg_id)
    dst_river = segment_to_river.get(down_seg_id)
    if src_river and dst_river and src_river != dst_river:
        river_tributaries[dst_river].add(src_river)
        river_flows_into[src_river] = dst_river

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
        "flows_into": {"id": flows, "name": river_id_to_name.get(flows, "Unknown")} if flows and flows in river_id_to_name else None,
    }

print(f"       Rivers with tributaries: {sum(1 for v in graph_out.values() if v['tributaries'])}")
print(f"       Rivers that flow into another: {sum(1 for v in graph_out.values() if v['flows_into'])}")

# ------
# 6.  Write output
# ------
print("[6/6] Writing output files")
os.makedirs(OUT_DIR, exist_ok=True)

rivers_path = os.path.join(OUT_DIR, "rivers_europe_pollution.json")
with open(rivers_path, "w") as f:
    json.dump(rivers_out, f)
print(f"       → {rivers_path}  ({os.path.getsize(rivers_path) / 1024 / 1024:.1f} MB)")

graph_path = os.path.join(OUT_DIR, "river_graph_pollution.json")
with open(graph_path, "w") as f:
    json.dump(graph_out, f, indent=2)
print(f"       → {graph_path}  ({os.path.getsize(graph_path) / 1024:.0f} KB)")

print("\nDone!")
