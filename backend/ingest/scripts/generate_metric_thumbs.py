"""Generate per-(river, metric) thumbnail PNGs for the Pipeline page.

For each example river (default: Danube Delta, Mureș, Olt) renders:
  - TRUE_COLOR  - Sentinel-2 RGB reference (so the reader sees the actual landscape)
  - NDWI / MNDWI / NDVI / NDCI / NDTI / TURBIDITY / BSI - Sentinel-2 indices
  - OIL_PROBABILITY - Sentinel-1 SAR oil-probability composite

PNGs land under `frontend/src/assets/metric_thumbs/<river>/<metric>.png`.
Vite bundles them, so the live Pipeline page makes zero EE calls.

Usage:
    python -m backend.ingest.scripts.generate_metric_thumbs                # missing only
    python -m backend.ingest.scripts.generate_metric_thumbs --force        # all
    python -m backend.ingest.scripts.generate_metric_thumbs --river danube # one river
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import ee

if __package__ is None or __package__ == "":  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ingest.gee_auth import init_ee
from backend.ingest.sensors.sentinel1 import Sentinel1
from backend.ingest.sensors.sentinel2 import Sentinel2, _mask_s2_clouds


# --- example rivers ---------------------------------------------------------
# Each entry: bbox = [lon_min, lat_min, lon_max, lat_max], S2/S1 windows.
# Bboxes are sized at roughly 1.5:1 - 2:1 to match the 480x270 thumbnail.

RIVERS = {
    "danube": {
        "label":   "Danube Delta",
        "bbox":    [28.60, 44.85, 29.85, 45.45],
        "date_s2": ("2024-07-01", "2024-08-31"),
        "date_s1": ("2024-07-01", "2024-08-31"),
    },
    "mures": {
        "label":   "Mureș (Ocna Mureș meanders)",
        # Tight (~27 x 22 km) on the Mureș meanders downstream of Ocna
        # Mureș, so the river itself is clearly visible at 480x270.
        "bbox":    [23.70, 46.28, 24.05, 46.48],
        "date_s2": ("2024-07-01", "2024-08-31"),
        "date_s1": ("2024-07-01", "2024-08-31"),
    },
    "olt": {
        "label":   "Olt (Sibiu - Cozia gorge)",
        "bbox":    [24.20, 45.20, 24.95, 45.65],
        "date_s2": ("2024-07-01", "2024-08-31"),
        "date_s1": ("2024-07-01", "2024-08-31"),
    },
}

THUMB_W, THUMB_H = 480, 270

DEFAULT_OUT = (Path(__file__).resolve().parents[3]
               / "frontend" / "src" / "assets" / "metric_thumbs")
OUT_DIR = Path(os.getenv("METRIC_THUMBS_OUT", str(DEFAULT_OUT)))

# --- per-metric visualization params ---------------------------------------

VIS_S2 = {
    "NDWI": {
        "min": -0.4, "max": 0.7,
        "palette": ["8c510a", "bf812d", "dfc27d",
                    "c7eae5", "5ab4ac", "01665e", "08306b"],
    },
    "MNDWI": {
        "min": -0.4, "max": 0.7,
        "palette": ["1e293b", "374151", "60a5fa", "1d4ed8", "0c4a6e"],
    },
    "NDVI": {
        "min": -0.2, "max": 0.85,
        "palette": ["7c2d12", "a16207", "facc15",
                    "86efac", "22c55e", "166534", "052e16"],
    },
    "NDCI": {
        "min": -0.10, "max": 0.30,
        "palette": ["155e75", "0e7490", "67e8f9",
                    "facc15", "f59e0b", "b91c1c"],
    },
    "NDTI": {
        "min": -0.20, "max": 0.40,
        "palette": ["1e3a8a", "60a5fa", "e0e7ff",
                    "fde68a", "d97706", "92400e", "451a03"],
    },
    "TURBIDITY": {
        "min": 0, "max": 2200,
        "palette": ["1e3a8a", "60a5fa", "fde68a",
                    "d97706", "92400e", "451a03"],
    },
    "BSI": {
        "min": -0.30, "max": 0.30,
        "palette": ["166534", "22c55e", "fef3c7",
                    "f59e0b", "ea580c", "b91c1c", "7f1d1d"],
    },
}

VIS_POLLUTION = {
    "min": 0, "max": 7,
    # green (low) -> amber (medium) -> red (high). Eight stops so each
    # discrete integer 0-7 maps to its own colour band.
    "palette": ["166534", "16a34a", "65a30d",
                "eab308", "f59e0b",
                "ea580c", "dc2626", "7f1d1d"],
}

VIS_S1 = {
    "OIL_PROBABILITY": {
        "min": 0.0, "max": 1.0,
        "palette": ["0b1220", "1e293b", "312e81",
                    "6b21a8", "a855f7", "e879f9", "fbbf24"],
    },
}

# Natural-colour S2 reference - B4 red, B3 green, B2 blue. The stretch
# (min/max) handles both the bright sediment-laden delta and the darker
# inland forested rivers in one pass.
VIS_TRUE_COLOR = {"bands": ["B4", "B3", "B2"], "min": 200, "max": 2800,
                  "gamma": 1.1}


def _retry_url(url: str, dest: Path, tries: int = 4) -> None:
    delay = 2.0
    for k in range(1, tries + 1):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                data = r.read()
            dest.write_bytes(data)
            return
        except Exception as exc:
            if k == tries:
                raise
            print(f"     retry {k}/{tries - 1} ({exc!r})", flush=True)
            time.sleep(delay)
            delay *= 2


def _thumb(image: ee.Image, region: ee.Geometry, vis: dict) -> str:
    visualised = image.visualize(**vis)
    return visualised.getThumbURL({
        "dimensions": f"{THUMB_W}x{THUMB_H}",
        "region": region,
        "format": "png",
    })


def _generate(name: str, image: ee.Image, region: ee.Geometry, vis: dict,
              out: Path, force: bool) -> None:
    if out.exists() and not force:
        print(f"     {name}: skip (use --force)")
        return
    print(f"     {name}: requesting ...", flush=True)
    t0 = time.time()
    _retry_url(_thumb(image, region, vis), out)
    print(f"     {name}: {out.name} "
          f"({out.stat().st_size // 1024} KB, {time.time() - t0:.1f}s)")


def _true_color_image(start: str, end: str, region: ee.Geometry) -> ee.Image:
    """Cloud-masked S2 RGB median. Reuses the same cloud mask the indices
    pipeline uses, so the natural-colour reference matches the imagery
    the metric thumbnails are computed from."""
    return (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate(start, end)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 25))
            .map(_mask_s2_clouds)
            .median()
            .clip(region)
            .select(["B4", "B3", "B2"]))


def _bbox_sensors(region: ee.Geometry):
    """Return (S2, S1) sensor instances whose `country()` is the bbox.

    The production pipeline clips every composite to Romania (so we never
    process pixels we don't care about), but for the Pipeline-page
    thumbnails we want the *entire bbox* rendered - even when it crosses
    into Moldova, Ukraine or the Black Sea (as the Danube Delta bbox
    does). Monkey-patching `country` on the instance bypasses the
    in-country clip without changing production code."""
    s2 = Sentinel2()
    s1 = Sentinel1()
    s2.country = lambda r=region: r
    s1.country = lambda r=region: r
    return s2, s1


def process_river(key: str, force: bool) -> None:
    spec = RIVERS[key]
    out_dir = OUT_DIR / key
    out_dir.mkdir(parents=True, exist_ok=True)
    region = ee.Geometry.Rectangle(spec["bbox"])

    print(f"\n[{key}] {spec['label']}  bbox={spec['bbox']}  "
          f"S2={spec['date_s2'][0]}->{spec['date_s2'][1]}  "
          f"S1={spec['date_s1'][0]}->{spec['date_s1'][1]}")

    s2, s1 = _bbox_sensors(region)

    # 1) natural-colour reference (no in-country clip - filterBounds(region)
    # alone is enough to fetch the right S2 scenes, including those that
    # cross the border).
    print(f"   Sentinel-2 (true colour):")
    tc = _true_color_image(*spec["date_s2"], region=region)
    _generate("TRUE_COLOR", tc, region, VIS_TRUE_COLOR,
              out_dir / "TRUE_COLOR.png", force)

    # 2) Sentinel-2 indices (clipped to bbox via the monkey-patched country)
    print(f"   Sentinel-2 (indices):")
    s2_img = s2.indices_image(*spec["date_s2"]).clip(region)
    for metric, vis in VIS_S2.items():
        _generate(metric, s2_img.select(metric), region, vis,
                  out_dir / f"{metric}.png", force)

    # 2b) Per-pixel POLLUTION composite (same formula as add_risk, but
    # applied pixel-wise so we get a visualisable raster).
    print(f"   Sentinel-2 (composite POLLUTION):")
    pollution = s2.pollution_image(*spec["date_s2"]).clip(region)
    _generate("POLLUTION", pollution, region, VIS_POLLUTION,
              out_dir / "POLLUTION.png", force)

    # 3) Sentinel-1 SAR
    print(f"   Sentinel-1 (SAR):")
    s1_img = s1.indices_image(*spec["date_s1"]).clip(region)
    for metric, vis in VIS_S1.items():
        _generate(metric, s1_img.select(metric), region, vis,
                  out_dir / f"{metric}.png", force)


def export_romania_outline(force: bool) -> None:
    """Export the simplified Romania boundary from FAO/GAUL as a flat list
    of polygon rings so the Pipeline-page locator map can render an
    accurate silhouette - replaces the hand-traced 21-point polygon that
    read 'sketch' before. ~300 m simplification preserves every
    meaningful contour (Carpathian arc, Danube border, Moldovan/Ukrainian
    borders, Black Sea coast) without bloating the bundle.

    GAUL returns a GeometryCollection with mixed Polygons and stray
    LineStrings (simplification artifacts). We flatten to a plain list of
    `{outer, holes}` rings, which the React locator stitches into a
    single SVG path."""
    out = Path(os.getenv("ROMANIA_OUTLINE_OUT",
                          str(OUT_DIR.parent / "romania_outline.json")))
    if out.exists() and not force:
        print(f"\nRomania outline: {out.name} already exists -> skipped")
        return
    print(f"\nRomania outline: requesting FAO/GAUL ...", flush=True)
    geo = (ee.FeatureCollection("FAO/GAUL/2015/level0")
           .filter(ee.Filter.eq("ADM0_NAME", "Romania"))
           .geometry()
           .simplify(maxError=300))
    info = geo.getInfo()

    polygons: list[dict] = []
    def _consume(g):
        t = g.get("type")
        if t == "Polygon":
            rings = g["coordinates"]
            polygons.append({"outer": rings[0], "holes": rings[1:]})
        elif t == "MultiPolygon":
            for rings in g["coordinates"]:
                polygons.append({"outer": rings[0], "holes": rings[1:]})
        elif t == "GeometryCollection":
            for sub in g.get("geometries", []):
                _consume(sub)
        # ignore LineString / Point: simplification artifacts at borders.
    _consume(info)

    # Sort by ring length (longest first) so the main land mass ranks 1st.
    polygons.sort(key=lambda p: -len(p["outer"]))
    n_pts = sum(len(p["outer"]) for p in polygons)
    out.write_text(json.dumps({
        "polygons":        polygons,
        "source":          "FAO/GAUL/2015/level0",
        "simplify_max_m":  300,
        "n_polygons":      len(polygons),
        "n_points":        n_pts,
    }, separators=(",", ":")))
    print(f"Romania outline: {out.name} "
          f"({out.stat().st_size // 1024} KB, "
          f"{len(polygons)} polygons, {n_pts} points)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--force", action="store_true",
                    help="regenerate even if the PNG already exists")
    ap.add_argument("--river", choices=list(RIVERS) + ["all"], default="all",
                    help="which river to generate (default: all)")
    args = ap.parse_args(argv)

    identity = init_ee()
    print(f"EE:        {identity}")
    print(f"Rivers:    {', '.join(RIVERS) if args.river == 'all' else args.river}")
    print(f"Output:    {OUT_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    keys = list(RIVERS) if args.river == "all" else [args.river]
    for k in keys:
        process_river(k, args.force)

    # One country outline, shared by all rivers in the locator map.
    export_romania_outline(args.force)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
