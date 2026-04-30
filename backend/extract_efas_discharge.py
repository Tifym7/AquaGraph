"""
Extract EFAS (European Flood Awareness System) v5.0 discharge data
and map it to EU-Hydro river segments to compute tributary contribution rates.

Outputs:
  - data/efas_discharge_mapped.json    (per-river discharge + tributary contributions)
  - data/romania_discharge_grid.json   (compressed grid for frontend visualization)
"""

import json
import os
import sys

import time

import numpy as np
import xarray as xr

# ---------- paths ----------
GRIB_PATH   = os.path.join(os.path.dirname(__file__), "..", "dataset", "data.grib")
RIVERS_PATH = os.path.join(os.path.dirname(__file__), "data", "rivers_romania.json")
GRAPH_PATH  = os.path.join(os.path.dirname(__file__), "data", "river_graph.json")
DATA_DIR    = os.path.join(os.path.dirname(__file__), "data")

OUT_MAPPED   = os.path.join(DATA_DIR, "efas_discharge_mapped.json")
OUT_GRID     = os.path.join(DATA_DIR, "romania_discharge_grid.json")

# Romania bounding box
RO_LAT_MIN, RO_LAT_MAX = 43.6, 48.3
RO_LON_MIN, RO_LON_MAX = 20.2, 29.7

# ---------- 1. Load EFAS GRIB ----------
print("[1/7] Loading EFAS GRIB (discharge in last 6 hours)...")
ds = xr.open_dataset(GRIB_PATH, engine="cfgrib")

raw_dis06 = ds["dis06"].isel(time=0).values  # shape: (2970, 4530), unit: m3/s
lat_vals  = ds["latitude"].values             # DECREASING: 72 -> 22
lon_vals  = ds["longitude"].values            # INCREASING: -25 -> 50

print(f"       Grid: {len(lat_vals)} lat x {len(lon_vals)} lon = {len(lat_vals)*len(lon_vals):,} cells")
print(f"       Lat range: {lat_vals.min():.4f} - {lat_vals.max():.4f}")
print(f"       Lon range: {lon_vals.min():.4f} - {lon_vals.max():.4f}")

# ---------- 2. Prepare fast grid lookup ----------
# Romania lat/lon masks (lat_vals is DECREASING)
LAT_MASK = (lat_vals >= RO_LAT_MIN) & (lat_vals <= RO_LAT_MAX)
LON_MASK = (lon_vals >= RO_LON_MIN) & (lon_vals <= RO_LON_MAX)
_rom_lats = np.where(LAT_MASK)[0]   # row indices in Romania
_rom_lons = np.where(LON_MASK)[0]   # col indices in Romania

# Create precomputed flat arrays for fast access: (lat, lon) -> (row_idx, col_idx)
# We'll use a simple nearest-gridpoint lookup via argmin
print(f"       Romania: {len(_rom_lats)} lat x {_rom_lons.shape[0]} lon = {len(_rom_lats)*len(_rom_lons):,} cells")

def sample_discharge(lat, lon):
    """Sample EFAS discharge (m3/s) from the nearest grid point."""
    ri = np.argmin(np.abs(lat_vals - lat))
    ci = np.argmin(np.abs(lon_vals - lon))
    v = float(raw_dis06[ri, ci])
    return v if v > 0 else 0.0

# ---------- 3. Load EU-Hydro rivers and graph ----------
print("[2/7] Loading EU-Hydro rivers and graph...")
with open(RIVERS_PATH) as f:
    rivers = json.load(f)
with open(GRAPH_PATH) as f:
    river_graph = json.load(f)
print(f"       {len(rivers)} rivers loaded")

river_name_by_id = {r["id"]: r["name"] for r in rivers}

# ---------- 4. Map discharge to each river ----------
print("[3/7] Mapping EFAS discharge to river segments.")

river_discharge = {}
discharge_count = 0
t0 = time.time()

for i, river in enumerate(rivers):
    rid = river["id"]
    dis_samples = []

    for segment in river["coordinates"]:
        for pt in segment:
            lat, lon = pt[0], pt[1]
            # Quick bounds check
            if not (RO_LAT_MIN <= lat <= RO_LAT_MAX and RO_LON_MIN <= lon <= RO_LON_MAX):
                continue
            v = sample_discharge(lat, lon)
            if v > 0:
                dis_samples.append(v)

    if dis_samples:
        discharge_count += 1
        river_discharge[rid] = {
            "name": river["name"],
            "median_discharge_m3s": round(float(np.median(dis_samples)), 3),
            "max_discharge_m3s":    round(float(np.max(dis_samples)), 3),
            "mean_discharge_m3s":   round(float(np.mean(dis_samples)), 3),
            "sample_points":        len(dis_samples),
        }

    if i % 500 == 0 and i > 0:
        print(f"       Progress: {i}/{len(rivers)} rivers ({discharge_count} with discharge, {time.time()-t0:.1f}s)")

elapsed = time.time() - t0
print(f"       {discharge_count} rivers with non-zero discharge ({elapsed:.1f}s)")

# ---------- 5. Compute tributary contribution rates ----------
print("[4/7] Computing tributary contribution rates. . .")

river_contributions = {}
for river in rivers:
    rid = river["id"]
    if rid not in river_graph:
        continue

    graph_node = river_graph[rid]
    trib_ids = [t["id"] for t in graph_node.get("tributaries", [])]

    tributary_total = 0.0
    tributary_details = {}

    for tid in trib_ids:
        if tid in river_discharge:
            t_dis = river_discharge[tid]["median_discharge_m3s"]
            tributary_details[tid] = t_dis
            tributary_total += t_dis

    own_dis = river_discharge.get(rid,  {}).get("median_discharge_m3s", 0.0)
    total_downstream = own_dis

    contributions = []
    for tid, t_dis in tributary_details.items():
        pct = round((t_dis / total_downstream) * 100, 2) if total_downstream > 0 else 0.0
        contributions.append({
            "tributary_id": tid,
            "tributary_name": river_name_by_id.get(tid, ""),
            "discharge_m3s": round(t_dis, 3),
            "contribution_pct": pct,
        })

    river_contributions[rid] = {
        "total_tributary_discharge_m3s": round(tributary_total, 3),
        "own_median_discharge_m3s": round(own_dis, 3),
        "downstream_total_m3s": round(total_downstream, 3),
        "tributaries": sorted(contributions, key=lambda x: x["contribution_pct"], reverse=True),
    }

print(f"       Computed contributions for {len(river_contributions)} rivers")

# ---------- 6. Create compressed discharge grid for frontend ----------
print("[5/7] Creating compressed discharge grid. ..")

# Subsample to ~50x100 grid (~14km x ~14km per cell)
compress_lat = max(1, len(_rom_lats) // 50)
compress_lon = max(1, len(_rom_lons) // 100)

sampled_lats = [lat_vals[j] for j in _rom_lats[::compress_lat]]
sampled_lons = [lon_vals[j] for j in _rom_lons[::compress_lon]]

# Extract values from ROM (Romania) subset of raw_dis06
ro_subset = raw_dis06[np.ix_(_rom_lats, _rom_lons)]
subsampled_vals = ro_subset[::compress_lat, ::compress_lon].flatten()

# Replace any actual 0 values (dry land) with masked NaN later
grid_payload = {
    "lats": sampled_lats,
    "lons": sampled_lons,
    "discharge": subsampled_vals.tolist(),
    "units": "m3/s",
    "timestamp": str(ds["valid_time"].isel(time=0).values.astype(str)),
    "source": "EFAS v5.0 (ECMWF)",
}

nz_count = (subsampled_vals > 0).sum()
print(f"       Compressed grid: {len(sampled_lats)} x {len(sampled_lons)} = {len(grid_payload['discharge'])} cells")
print(f"       Non-zero cells: {nz_count:,}" if nz_count > 0 else "       Grid has no discharge values")

# ---------- 7. Write outputs ----------
print("[6/7] Writing output files...")
os.makedirs(DATA_DIR, exist_ok=True)

mapped_output = {}
for river in rivers:
    rid = river["id"]
    dis  = river_discharge.get(rid,  {})
    contrib = river_contributions.get(rid, {})
    mapped_output[rid] = {
        "name":                 river["name"],
        "strahler":             river.get("strahler", 1),
        "discharge":            dis,
        "tributary_contributions": contrib,
    }

with open(OUT_MAPPED, "w") as f:
    json.dump(mapped_output, f, indent=2)
print(f"       -> {OUT_MAPPED} ({os.path.getsize(OUT_MAPPED) / 1024:.1f} KB)")

with open(OUT_GRID, "w") as f:
    json.dump(grid_payload, f)
print(f"       -> {OUT_GRID} ({os.path.getsize(OUT_GRID) / 1024:.1f} KB)")

# Summary
print("[7/7] SUMMARY")
print()

rwd = len([v for v in river_discharge.values() if v.get("median_discharge_m3s", 0) > 0])
rwT = len([v for v in river_contributions.values() if v.get("total_tributary_discharge_m3s", 0) > 0])

print(f"  Rivers processed:          {len(rivers)}")
print(f"  Rivers with discharge:     {rwd}")
print(f"  Rivers with tributaries:   {rwT}")
print()

if rwd > 0:
    all_dis = [v["median_discharge_m3s"] for v in river_discharge.values() if v.get("median_discharge_m3s", 0) > 0]
    print(f"  Discharge stats (m3/s):")
    print(f"    Min:    {min(all_dis):>12.3f}")
    print(f"    Max:    {max(all_dis):>12.3f}")
    print(f"    Mean:   {np.mean(all_dis):>12.3f}")
    print(f"    Median: {np.median(all_dis):>12.3f}")

top_rivers = sorted(river_discharge.items(), key=lambda x: x[1].get("median_discharge_m3s", 0), reverse=True)[:5]
print(f"\n  Top 5 rivers by median discharge:")
for rid, dis in top_rivers:
    n_tribs = len(river_contributions.get(rid,  {}).get("tributaries", []))
    print(f"    {dis['name']:30s} {dis['median_discharge_m3s']:>12.2f} m3/s  ({n_tribs} tributaries)")

print("\nDone!")
