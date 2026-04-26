"""
Shared metric computation + color logic.

Used by both the live Flask endpoints in `app.py` and the offline tile
precomputation in `precompute_tiles.py`. Keeping a single source of truth here
guarantees the colors painted into raster tiles match the colors the frontend
would have rendered live.
"""

import math

METRIC_KEYS = ["NDVI", "MNDWI", "NDCI", "BSI", "TURBIDITY", "water", "land", "risk", "discharge"]
METRICS_FOR_TILES = ["pollution", "risk", "NDVI", "MNDWI", "NDCI", "BSI", "TURBIDITY", "water", "land", "discharge"]

METRIC_RANGES = {
    "NDVI": (-1, 1), "MNDWI": (-1, 1), "NDCI": (-1, 1),
    "BSI": (-0.5, 0.3), "TURBIDITY": (0, 2000),
    "water": (0, 2), "land": (0, 1), "risk": (0, 5),
    "pollution": (0, 5),
    # discharge is normalized in log10 space (1 m³/s → 10⁴ m³/s) so the
    # Danube doesn't crush every smaller river to the same low color.
    "discharge": (0, 4),
}

METRIC_LABELS = dict(METRIC_RANGES)
METRIC_LABELS["pollution"] = "Pollution (synthetic composite)"


def normalize(raw, metric="pollution"):
    if raw is None:
        return 0.0
    try:
        if math.isnan(raw):
            return 0.0
    except TypeError:
        return 0.0
    lo, hi = METRIC_RANGES.get(metric, (0, 1))
    if hi == lo:
        return 0.5
    return max(0.0, min(1.0, (raw - lo) / (hi - lo)))


def get_raw_value(seg, metric):
    """Get raw metric value from a segment."""
    risk = seg.get("risk", {})
    if metric == "pollution":
        return float(risk.get("risk_score", 0))
    if metric == "risk":
        return float(risk.get("risk_score", 0))
    if metric == "water":
        return float(risk.get("water_risk", 0))
    if metric == "land":
        return float(risk.get("land_risk", 0))
    if metric == "discharge":
        # Discharge lives at the river level (m³/s, EFAS median over 6h)
        # but is attached to each segment for uniform per-segment lookup.
        # Log-transform here so 0..4 in log10 space maps Danube ~9200 →
        # top of gradient and tiny streams ~0..5 → bottom.
        d = seg.get("discharge")
        if not d:
            return None
        v = d.get("median_discharge_m3s") if isinstance(d, dict) else d
        if v is None:
            return None
        try:
            return math.log10(max(1.0, float(v)))
        except (TypeError, ValueError):
            return None
    indices = seg.get("indices", {})
    if indices:
        for k in indices:
            if k.upper() == metric.upper():
                return indices[k]
    return None


def polygon_color(v):
    """Green → Yellow → Red gradient for pollution/risk in 0..1 space."""
    t = max(0, min(1, v))
    if t < 0.5:
        p = t / 0.5
        r = int(16 + p * (230 - 16))
        g = int(185 + p * (230 - 185))
        b = int(129 - p * 129)
    else:
        p = (t - 0.5) / 0.5
        r = int(230 + p * (239 - 230))
        g = int(230 - p * (230 - 68))
        b = int(0 + p * (68 - 0))
    return (r, g, b)


def spectral_color(raw_val, metric):
    """Color tuple for a given raw metric value."""
    if raw_val is None or (isinstance(raw_val, float) and math.isnan(raw_val)):
        return (153, 153, 153)
    if metric in ("NDVI", "MNDWI"):
        t = normalize(raw_val, metric)
        if t < 0.33:
            r, g, b = int(239 + (1 - t) * 80), int(68 + (1 - t) * 120), int(68 + (1 - t) * 60)
        elif t < 0.66:
            p = (t - 0.33) / 0.33
            r = int(239 - (p * 220))
            g = int(68 + p * 160)
            b = 68
        else:
            p = (t - 0.66) / 0.34
            r = int(19 - p * 19)
            g = int(228 + p * -100)
            b = int(68 + p * 60)
    elif metric == "NDCI":
        t = normalize(raw_val, metric)
        r = int(16 + t * (239 - 16))
        g = int(185 + t * (68 - 185))
        b = int(129 + t * (68 - 129))
    elif metric == "BSI":
        t = normalize(raw_val, metric)
        r = int(167 + t * (66 - 167))
        g = int(167 + t * (157 - 167))
        b = int(200 + t * (112 - 200))
    elif metric == "TURBIDITY":
        t = normalize(raw_val, metric)
        r = int(33 + t * (239 - 33))
        g = int(150 + t * (204 - 150))
        b = int(167 + t * (68 - 167))
    elif metric == "water":
        t = normalize(raw_val, metric)
        r = 26
        g = int(135 + t * (60 - 135))
        b = int(244 + t * (68 - 244))
    elif metric == "land":
        t = normalize(raw_val, metric)
        r = int(255 - t * (255 - 220))
        g = int(204 - t * (204 - 180))
        b = int(153 - t * (153 - 100))
    elif metric == "discharge":
        # Trickle → torrent palette, mirrors frontend METRIC_GRADIENTS.discharge
        # (#e0f7fa → #4dd0e1 → #00838f → #1565c0 → #311b92).
        t = normalize(raw_val, metric)
        stops = [
            (0xe0, 0xf7, 0xfa),
            (0x4d, 0xd0, 0xe1),
            (0x00, 0x83, 0x8f),
            (0x15, 0x65, 0xc0),
            (0x31, 0x1b, 0x92),
        ]
        n = len(stops) - 1
        idx = min(int(t * n), n - 1)
        local = (t * n) - idx
        c1, c2 = stops[idx], stops[idx + 1]
        r = int(c1[0] + (c2[0] - c1[0]) * local)
        g = int(c1[1] + (c2[1] - c1[1]) * local)
        b = int(c1[2] + (c2[2] - c1[2]) * local)
    elif metric == "risk":
        t = raw_val / 5.0
        if t < 0.2:
            r, g, b = 76, 175, 80
        elif t < 0.4:
            r, g, b = 255, 235, 59
        elif t < 0.6:
            r, g, b = 255, 152, 0
        elif t < 0.8:
            r, g, b = 244, 67, 54
        else:
            r, g, b = 156, 39, 176
    else:
        t = normalize(raw_val, metric)
        r = int(16 + t * (239 - 16))
        g = int(185 + t * (68 - 185))
        b = int(129 + t * (68 - 129))
    return (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))


def color_for_segment(seg, metric):
    """Final color the visual layer should paint for a segment."""
    raw = get_raw_value(seg, metric)
    if metric in ("pollution", "risk"):
        return polygon_color(normalize(raw, metric))
    return spectral_color(raw, metric)


def color_rgb_string(rgb):
    return f"rgb({rgb[0]}, {rgb[1]}, {rgb[2]})"


def avg_normalized(segments, metric):
    total, n = 0.0, 0
    for seg in segments:
        raw = get_raw_value(seg, metric)
        if raw is None:
            continue
        try:
            if math.isnan(raw):
                continue
        except TypeError:
            continue
        total += normalize(raw, metric)
        n += 1
    return total / n if n else 0.0


# ---------- LOD ladder ----------
# Mirrors the runtime logic in app.py:get_rivers so the precomputed visuals
# match what the live request path would have produced.
LOD_TIERS = [
    # (tier_index, min_zoom, max_zoom, min_strahler, stride, min_length, show_poly)
    (1, 0, 6, 5, 12, 5000, False),
    (2, 6, 8, 4, 8, 2000, False),
    (3, 8, 10, 3, 4, 500, False),
    (4, 10, 12, 2, 2, 100, True),
    (5, 12, 99, 1, 1, 0, True),
]


def lod_for_zoom(zoom):
    for tier in LOD_TIERS:
        idx, lo, hi, *_ = tier
        if lo <= zoom < hi:
            return tier
    return LOD_TIERS[-1]
