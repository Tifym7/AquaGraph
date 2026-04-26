"""
Precompute raster tile pyramid + per-LOD click-overlay JSON files.

Run manually whenever the underlying river/metric data is refreshed
(currently every ~3 days):

    cd backend && python precompute_tiles.py

Output:
  data/tiles/<metric>/<z>/<x>/<y>.png      (only non-empty tiles)
  data/segments_lod_<tier>.json            (5 files, lightweight click layer)

The tile colors mirror exactly what the live `/api/rivers` endpoint would
have rendered, since both paths pull from `metrics.py`.
"""

import json
import math
import os
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))

from metrics import (  # noqa: E402
    LOD_TIERS,
    METRICS_FOR_TILES,
    avg_normalized,
    color_for_segment,
)

DATA_DIR = Path(__file__).parent / "data"
TILES_DIR = DATA_DIR / "tiles"

# Romania coverage (matches frontend ROMANIA_BOUNDS in MapView.jsx).
LAT_MIN, LAT_MAX = 43.5, 48.3
LON_MIN, LON_MAX = 20.2, 30.0

ZOOM_MIN, ZOOM_MAX = 5, 11
TILE_SIZE = 256

# Render at 2x then downscale for cheap antialiasing.
SUPERSAMPLE = 2

WATER_FILL = (33, 113, 181, 90)        # soft blue, semi-transparent
WATER_STROKE = (33, 113, 181, 160)


# ---------- slippy-map projection ----------
def lonlat_to_pixel(lon, lat, z):
    """Web-mercator → world pixel at zoom z, in (256-px tile units)."""
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n * TILE_SIZE
    lat_rad = math.radians(lat)
    y = (1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n * TILE_SIZE
    return x, y


def tile_bounds_lonlat(x, y, z):
    """Return (lon_min, lat_min, lon_max, lat_max) covered by tile (z, x, y)."""
    n = 2 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_min, lat_min, lon_max, lat_max


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y


def covering_tiles(z):
    """Yield (x, y) tile coords whose bbox intersects Romania at zoom z."""
    x0, y0 = lonlat_to_tile(LON_MIN, LAT_MAX, z)
    x1, y1 = lonlat_to_tile(LON_MAX, LAT_MIN, z)
    for x in range(min(x0, x1), max(x0, x1) + 1):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            yield x, y


# ---------- bbox helpers ----------
def boxes_intersect(b1, b2):
    return not (b1["max_lon"] < b2["min_lon"] or b1["min_lon"] > b2["max_lon"] or
                b1["max_lat"] < b2["min_lat"] or b1["min_lat"] > b2["max_lat"])


def line_bbox(line):
    lats = [p[0] for p in line]
    lons = [p[1] for p in line]
    return {"min_lat": min(lats), "max_lat": max(lats), "min_lon": min(lons), "max_lon": max(lons)}


def simplify_geom(coords_list, stride):
    if stride <= 1:
        return coords_list
    out = []
    for seg in coords_list:
        if len(seg) <= 2:
            out.append(seg)
            continue
        s = seg[::stride]
        if s[-1] != seg[-1]:
            s.append(seg[-1])
        out.append(s)
    return out


# ---------- tile rendering ----------
def project_line(line, z, tile_x, tile_y, scale):
    """Return [(px, py), ...] inside the (super-sampled) tile canvas."""
    origin_x = tile_x * TILE_SIZE
    origin_y = tile_y * TILE_SIZE
    pts = []
    for lat, lon in line:
        wx, wy = lonlat_to_pixel(lon, lat, z)
        pts.append(((wx - origin_x) * scale, (wy - origin_y) * scale))
    return pts


def stroke_width_for_zoom(z, strahler):
    """Pixel width of a polyline at this zoom level (pre-supersample)."""
    base = {5: 0.8, 6: 1.0, 7: 1.2, 8: 1.4, 9: 1.8, 10: 2.2, 11: 2.6}.get(z, 2.0)
    bonus = 0.0
    if strahler >= 6:
        bonus = 1.6
    elif strahler >= 5:
        bonus = 1.2
    elif strahler >= 4:
        bonus = 0.8
    elif strahler >= 3:
        bonus = 0.4
    return max(1.0, base + bonus)


def build_tile_drawlist(z, tile_x, tile_y, rivers, polygons_by_river_id):
    """Project everything intersecting this tile *once* — the same draw list
    is reusable for every metric (only the line colors differ). Returns
    None if the tile has nothing to render."""
    tile_bbox = tile_bounds_lonlat(tile_x, tile_y, z)
    tb = {"min_lon": tile_bbox[0], "min_lat": tile_bbox[1],
          "max_lon": tile_bbox[2], "max_lat": tile_bbox[3]}

    canvas_size = TILE_SIZE * SUPERSAMPLE

    polygon_pts = []   # list of [(px, py), ...]
    line_entries = []  # list of (segment_obj, [(px, py), ...], width_px)

    has_anything = False

    for river in rivers:
        if not boxes_intersect(river["bbox"], tb):
            continue
        # Polygons (lakes / wide rivers).
        polys = polygons_by_river_id.get(river["id"])
        if polys:
            for ring_groups in polys:
                for ring in ring_groups:
                    if len(ring) < 3:
                        continue
                    pts = project_line(ring, z, tile_x, tile_y, SUPERSAMPLE)
                    if not _segment_in_canvas(pts, canvas_size):
                        continue
                    polygon_pts.append(pts)
                    has_anything = True
        # Polylines.
        strahler = river.get("strahler", 1)
        width = int(round(stroke_width_for_zoom(z, strahler) * SUPERSAMPLE))
        for seg in river["segments"]:
            for line in seg["coordinates"]:
                if len(line) < 2:
                    continue
                pts = project_line(line, z, tile_x, tile_y, SUPERSAMPLE)
                if not _segment_in_canvas(pts, canvas_size):
                    continue
                line_entries.append((seg, pts, width))
                has_anything = True

    if not has_anything:
        return None
    return {"canvas_size": canvas_size, "polygons": polygon_pts, "lines": line_entries}


def render_drawlist(drawlist, metric):
    """Rasterize a pre-built draw list for a specific metric."""
    canvas_size = drawlist["canvas_size"]
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    # Layer 1: water polygons.
    for pts in drawlist["polygons"]:
        draw.polygon(pts, fill=WATER_FILL, outline=WATER_STROKE)

    # Layer 2: colored polylines.
    for seg, pts, width in drawlist["lines"]:
        color = color_for_segment(seg, metric)
        draw.line(pts, fill=(color[0], color[1], color[2], 235), width=width, joint="curve")

    if SUPERSAMPLE != 1:
        img = img.resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)
    return img


def _segment_in_canvas(pts, size):
    """True if the polyline's pixel bbox overlaps the tile canvas. The previous
    'any vertex inside' check dropped long segments whose endpoints both fell
    outside the tile but whose line crossed *through* it — producing visible
    gaps at tile boundaries."""
    if not pts:
        return False
    margin = 32
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return not (max(xs) < -margin or min(xs) > size + margin or
                max(ys) < -margin or min(ys) > size + margin)


# ---------- main ----------
def load_data():
    print("Loading source data...")
    with open(DATA_DIR / "rivers_romania.json") as f:
        raw_rivers = json.load(f)
    poly_match = {}
    if (DATA_DIR / "euhydro_poly_match.json").exists():
        with open(DATA_DIR / "euhydro_poly_match.json") as f:
            poly_match = json.load(f)
    polys_by_id = {}
    if (DATA_DIR / "euhydro_water_polygons.json").exists():
        with open(DATA_DIR / "euhydro_water_polygons.json") as f:
            for p in json.load(f):
                polys_by_id[p["poly_id"]] = p
    discharge_by_rid = {}
    if (DATA_DIR / "efas_discharge_mapped.json").exists():
        with open(DATA_DIR / "efas_discharge_mapped.json") as f:
            for rid, entry in json.load(f).items():
                discharge_by_rid[rid] = entry.get("discharge", {})
    # Attach discharge to each segment in-place so the LOD builder picks it up
    # without further plumbing.
    if discharge_by_rid:
        for r in raw_rivers:
            d = discharge_by_rid.get(r["id"])
            if not d:
                continue
            for seg in r.get("segments", []):
                seg["discharge"] = d
    print(f"  rivers: {len(raw_rivers)}, poly_match: {len(poly_match)}, polys: {len(polys_by_id)}, discharge: {len(discharge_by_rid)}")
    return raw_rivers, poly_match, polys_by_id


def index_rivers(raw_rivers):
    """Build the same (id, name, strahler, bbox, segments) view used at runtime."""
    out = []
    for r in raw_rivers:
        rid = r["id"]
        lats, lons = [], []
        for seg in r.get("segments", []):
            for line in seg.get("coordinates", []):
                for pt in line:
                    lats.append(pt[0])
                    lons.append(pt[1])
        if not lats:
            continue
        out.append({
            "id": rid,
            "name": r.get("name", ""),
            "strahler": r.get("strahler", 1),
            "length_m": r.get("length_m", 0),
            "segments": r.get("segments", []),
            "bbox": {"min_lat": min(lats), "max_lat": max(lats),
                     "min_lon": min(lons), "max_lon": max(lons)},
        })
    return out


def build_lod_views(rivers, poly_match, polys_by_id):
    """Return {tier_index: {rivers: [...], polys_by_rid: {...}}} pre-simplified.

    NOTE: every LOD includes *every* river — only the geometry is simplified
    (stride) per tier. Strahler/length filtering was used previously, but
    that hid small tributaries from low-zoom tiles even though they reappeared
    in the high-zoom vector layer (visually inconsistent). We rely on the
    stroke-width ramp + smaller streams being thin to keep low zooms readable.
    Water polygons are likewise rendered at every LOD."""
    views = {}
    for tier_idx, _lo, _hi, _min_strahler, stride, _min_length, _show_poly in LOD_TIERS:
        kept = []
        polys_by_rid = {}
        for r in rivers:
            simplified_segments = []
            for seg in r["segments"]:
                simplified_segments.append({
                    "object_id": seg.get("object_id"),
                    "coordinates": simplify_geom(seg.get("coordinates", []), stride),
                    "indices": seg.get("indices", {}),
                    "risk": seg.get("risk", {}),
                    "discharge": seg.get("discharge"),
                })
            kept.append({**r, "segments": simplified_segments})
            match = poly_match.get(r["id"], {})
            if match.get("polygon_ids"):
                polys = []
                for pid in match["polygon_ids"]:
                    pd = polys_by_id.get(pid)
                    if pd:
                        polys.append(simplify_geom(pd["coordinates"], stride))
                if polys:
                    polys_by_rid[r["id"]] = polys
        views[tier_idx] = {"rivers": kept, "polys_by_rid": polys_by_rid,
                           "stride": stride, "min_strahler": 1,
                           "min_length": 0, "show_poly": True}
        print(f"  LOD {tier_idx}: {len(kept)} rivers, {len(polys_by_rid)} polygons (stride={stride}, "
              f"all rivers + polygons)")
    return views


def lod_for_zoom_index(zoom):
    for tier in LOD_TIERS:
        idx, lo, hi, *_ = tier
        if lo <= zoom < hi:
            return idx
    return LOD_TIERS[-1][0]


def precompute_tiles(views, metrics):
    """Per (z, x, y) tile, project geometry once, then rasterize once per
    metric. The projection step dominates wall time, so reusing it cuts
    total runtime by close to (#metrics)x."""
    print(f"\nRendering raster tiles for {len(metrics)} metrics...")
    overall_start = time.time()
    total_written = 0
    counts_by_metric = {m: 0 for m in metrics}

    for z in range(ZOOM_MIN, ZOOM_MAX + 1):
        z_start = time.time()
        tier_idx = lod_for_zoom_index(z)
        view = views[tier_idx]
        rivers = view["rivers"]
        polys_by_rid = view["polys_by_rid"]
        z_count = 0
        for x, y in covering_tiles(z):
            drawlist = build_tile_drawlist(z, x, y, rivers, polys_by_rid)
            if drawlist is None:
                continue
            for metric in metrics:
                img = render_drawlist(drawlist, metric)
                out_dir = TILES_DIR / metric / str(z) / str(x)
                out_dir.mkdir(parents=True, exist_ok=True)
                img.save(out_dir / f"{y}.png", optimize=True)
                counts_by_metric[metric] += 1
            z_count += 1
            total_written += len(metrics)
        elapsed = time.time() - z_start
        print(f"  z={z} ({tier_idx}): {z_count} unique tiles × {len(metrics)} metrics in {elapsed:.1f}s")

    print(f"Total tiles written: {total_written} in {time.time()-overall_start:.1f}s")


def write_segment_lods(views):
    print("\nWriting segment LOD JSON files...")
    for tier_idx, view in views.items():
        # LOD 5 is the close-up vector tier — frontend renders these as
        # visible polylines instead of relying on (blurry) upscaled tiles,
        # so it needs the per-segment indices + risk to compute colors.
        include_metric_data = tier_idx == 5
        out_segments = []
        for r in view["rivers"]:
            for seg in r["segments"]:
                lats = []
                lons = []
                for line in seg.get("coordinates", []):
                    for pt in line:
                        lats.append(pt[0])
                        lons.append(pt[1])
                if not lats:
                    continue
                row = {
                    "river_id": r["id"],
                    "river_name": r["name"],
                    "strahler": r["strahler"],
                    "object_id": seg["object_id"],
                    "coordinates": seg["coordinates"],
                    "bbox": {"min_lat": min(lats), "max_lat": max(lats),
                             "min_lon": min(lons), "max_lon": max(lons)},
                }
                if include_metric_data:
                    row["indices"] = seg.get("indices", {})
                    row["risk"] = seg.get("risk", {})
                    row["discharge"] = seg.get("discharge")
                out_segments.append(row)
        path = DATA_DIR / f"segments_lod_{tier_idx}.json"
        with open(path, "w") as f:
            json.dump({
                "lod": tier_idx,
                "stride": view["stride"],
                "min_strahler": view["min_strahler"],
                "min_length": view["min_length"],
                "segments": out_segments,
            }, f)
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"  LOD {tier_idx}: {len(out_segments)} segments → {path.name} ({size_mb:.1f} MB)")


def main():
    raw_rivers, poly_match, polys_by_id = load_data()
    rivers = index_rivers(raw_rivers)
    print(f"Indexed {len(rivers)} rivers")

    views = build_lod_views(rivers, poly_match, polys_by_id)
    write_segment_lods(views)
    precompute_tiles(views, METRICS_FOR_TILES)


if __name__ == "__main__":
    main()
