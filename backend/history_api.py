"""River evolution history + PDF report endpoints.

Read-only. Queries the `satellite_observation` table populated by the
ingestion pipeline (backend/ingest). Registered as a blueprint in app.py so
the existing map-serving code is untouched.

Endpoints:
  GET /api/river/<river_id>/history?metric=NDTI&sensor=S2&from=&to=
  GET /api/segment/<object_id>/history?metric=NDTI&sensor=S2&from=&to=
  GET /api/river/<river_id>/report.pdf?metrics=NDTI,NDCI&from=&to=
"""

import io
import math
import os
from datetime import date

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Blueprint, current_app, jsonify, request, send_file

history_bp = Blueprint("history", __name__)

# Metrics present in satellite_observation.metrics, by sensor.
#   S2 (Sentinel-2): spectral water-quality indices
#   S1 (Sentinel-1): SAR oil-slick detection bands
# Computed pollution/risk fields live in the `risk` JSONB column (set by
# sensor.add_risk in EE), not `metrics`. Map the selectable name -> risk key
# so they're chartable / PDF-able exactly like the raw indices.
RISK_KEYS = {
    "POLLUTION": "risk_score", "RISK": "risk_score",
    "RISK_SCORE": "risk_score", "WATER_RISK": "water_risk",
    "LAND_RISK": "land_risk",
}

KNOWN_METRICS = {
    "NDWI", "MNDWI", "NDVI", "NDTI", "NDCI", "BSI", "TURBIDITY",   # S2 metrics
    "OIL_PROBABILITY", "VV_DARKENING_DB", "VH_DARKENING_DB",        # S1 metrics
    "VV_EVENT", "VH_EVENT", "DARK_PIXEL", "WATER_PIXEL",            # S1 metrics
    *RISK_KEYS,                                                     # risk col
}
DEFAULT_REPORT_METRICS = ["POLLUTION", "NDTI", "NDCI", "TURBIDITY"]


def _resolve(metric: str):
    """(jsonb_column, json_key) for a selectable metric — `risk` column for
    pollution/risk fields, `metrics` column for raw indices/bands."""
    m = metric.upper()
    if m in RISK_KEYS:
        return "risk", RISK_KEYS[m]
    return "metrics", metric


def _conn():
    conn = psycopg2.connect(
        os.getenv("DB_URL", "postgresql://localhost:5432/aquagraph"),
        user=os.getenv("DB_USER") or None,
        password=os.getenv("DB_PASSWORD") or None,
        connect_timeout=10,
    )
    # Self-heal: prod's Postgres volume predates these tables and the initdb
    # hook never re-runs. Idempotent + one-time per process.
    from ingest.schema import ensure_schema
    ensure_schema(conn)
    return conn


def _river_name(river_id: str) -> str:
    river = (current_app.config.get("RIVERS_BY_ID") or {}).get(river_id)
    return river.get("name", river_id) if river else river_id


def _date_filters(args):
    """Return (where_sql_fragment, params) for optional from/to query args."""
    clauses, params = [], []
    if args.get("from"):
        clauses.append("acquired_at >= %s")
        params.append(args["from"])
    if args.get("to"):
        clauses.append("acquired_at <= %s")
        params.append(args["to"])
    return clauses, params


def _series(scope_col: str, scope_val: str, metric: str, sensor: str, args):
    """Time series of a metric, aggregated over the matching segments.
    Reads the `metrics` JSONB for raw indices, or the `risk` JSONB for
    pollution/risk fields (see _resolve)."""
    col, key = _resolve(metric)              # col is a literal ('metrics'|'risk')
    clauses = [f"{scope_col} = %s", "sensor = %s", f"jsonb_exists({col}, %s)"]
    params = [scope_val, sensor, key]
    dc, dp = _date_filters(args)
    clauses += dc
    params += dp
    sql = f"""
        SELECT acquired_at,
               round(avg(({col}->>%s)::numeric), 5) AS avg,
               round(min(({col}->>%s)::numeric), 5) AS min,
               round(max(({col}->>%s)::numeric), 5) AS max,
               count(*)                              AS segment_count
        FROM satellite_observation
        WHERE {' AND '.join(clauses)}
        GROUP BY acquired_at
        ORDER BY acquired_at
    """
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, [key, key, key, *params])
        rows = cur.fetchall()
    return [
        {
            "date": r["acquired_at"].isoformat(),
            "avg": float(r["avg"]) if r["avg"] is not None else None,
            "min": float(r["min"]) if r["min"] is not None else None,
            "max": float(r["max"]) if r["max"] is not None else None,
            "segment_count": r["segment_count"],
        }
        for r in rows
    ]


@history_bp.route("/api/river/<river_id>/history", methods=["GET"])
def river_history(river_id):
    metric = request.args.get("metric", "NDTI").upper()
    sensor = request.args.get("sensor", "S2").upper()
    if metric not in KNOWN_METRICS:
        return jsonify({"error": f"unknown metric {metric}"}), 400
    try:
        data = _series("river_id", river_id, metric, sensor, request.args)
    except psycopg2.Error as e:
        return jsonify({"error": "history unavailable", "detail": str(e)}), 503
    return jsonify({
        "river_id": river_id, "river_name": _river_name(river_id),
        "metric": metric, "sensor": sensor, "points": data,
    })


@history_bp.route("/api/segment/<object_id>/history", methods=["GET"])
def segment_history(object_id):
    metric = request.args.get("metric", "NDTI").upper()
    sensor = request.args.get("sensor", "S2").upper()
    if metric not in KNOWN_METRICS:
        return jsonify({"error": f"unknown metric {metric}"}), 400
    try:
        data = _series("object_id", object_id, metric, sensor, request.args)
    except psycopg2.Error as e:
        return jsonify({"error": "history unavailable", "detail": str(e)}), 503
    return jsonify({
        "object_id": object_id, "metric": metric,
        "sensor": sensor, "points": data,
    })


# Map metrics the timeline can scrub (mirrors the frontend metric switcher).
# 'discharge' is excluded - it is not satellite-derived, so it has no history.
_TIMELINE_METRICS = {"pollution", "risk", "water", "land",
                     "NDVI", "MNDWI", "NDCI", "TURBIDITY", "BSI"}


@history_bp.route("/api/river/<river_id>/segments-history", methods=["GET"])
def river_segments_history(river_id):
    """Per-segment value per acquisition date for one river, so the map can
    recolor that river's polylines as the user scrubs a timeline.

    Returns the *raw* value per (segment, date) using the exact same
    derivation as the live map (metrics.get_raw_value); the frontend
    normalises + colours it with the active metric's gradient, so a scrubbed
    date looks identical to the live layer.
    """
    metric = request.args.get("metric", "pollution")
    if metric not in _TIMELINE_METRICS:
        return jsonify({"error": f"metric {metric!r} has no timeline"}), 400
    # Oil ("land") history comes from Sentinel-1; everything else from S2.
    sensor = request.args.get(
        "sensor", "S1" if metric == "land" else "S2").upper()

    from metrics import get_raw_value

    clauses = ["river_id = %s", "sensor = %s"]
    params = [river_id, sensor]
    dc, dp = _date_filters(request.args)
    clauses += dc
    params += dp
    sql = (
        "SELECT object_id, acquired_at, metrics, risk "
        "FROM satellite_observation "
        f"WHERE {' AND '.join(clauses)} ORDER BY acquired_at, object_id"
    )
    try:
        with _conn() as c, c.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    except psycopg2.Error as e:
        return jsonify({"error": "history unavailable", "detail": str(e)}), 503

    dates = sorted({r[1].isoformat() for r in rows})
    date_idx = {d: i for i, d in enumerate(dates)}
    values = {}
    for object_id, acq, metrics, risk in rows:
        if metric == "land":
            # S1 oil probability drives the existing "Oil leackage" metric.
            oil = (metrics or {}).get("OIL_PROBABILITY")
            seg = {"indices": {}, "risk": {"land_risk": oil}}
        else:
            seg = {"indices": metrics or {}, "risk": risk or {}}
        raw = get_raw_value(seg, metric)
        arr = values.setdefault(str(object_id), [None] * len(dates))
        arr[date_idx[acq.isoformat()]] = (
            round(float(raw), 5) if isinstance(raw, (int, float)) else None
        )

    return jsonify({
        "river_id": river_id, "river_name": _river_name(river_id),
        "metric": metric, "sensor": sensor,
        "dates": dates, "values": values,
    })


# ---- Executive PDF report (reportlab only - no matplotlib, light on 1 GB VM) ----

_BRAND = "#6d28d9"
_BRAND_DEEP = "#5a189a"
_BORDER = "#ddd6fe"
_ASSETS = os.path.join(os.path.dirname(__file__), "assets")
_LOGO = os.path.join(_ASSETS, "aquagraph_logo.jpeg")
_FONTS = None


def _fonts():
    """Register a Unicode TTF so Romanian river names (ă â î ș ț) render.
    Bundled in backend/assets so it works in the slim prod image too;
    falls back to system DejaVu, then Helvetica (diacritics may box)."""
    global _FONTS
    if _FONTS:
        return _FONTS
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    for reg, bold in (
        (os.path.join(_ASSETS, "DejaVuSans.ttf"),
         os.path.join(_ASSETS, "DejaVuSans-Bold.ttf")),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ):
        if os.path.exists(reg) and os.path.exists(bold):
            try:
                pdfmetrics.registerFont(TTFont("AG", reg))
                pdfmetrics.registerFont(TTFont("AG-Bold", bold))
                _FONTS = ("AG", "AG-Bold")
                return _FONTS
            except Exception:
                pass
    _FONTS = ("Helvetica", "Helvetica-Bold")
    return _FONTS
# Which metric the spatial figure is colored by, per sensor.
_FIG_METRIC = {"S1": "land", "S2": "pollution"}


def _seg_colors(river_id, sensor, fig_metric):
    """River geometry colored by the latest per-segment DB observation, using
    the exact same palette as the live map (metrics.color_for_segment).
    Returns (list[(rings,(r,g,b))], bbox|None)."""
    from metrics import color_for_segment

    river = (current_app.config.get("RIVERS_BY_ID") or {}).get(river_id) or {}
    segs = river.get("segments", [])
    latest = {}
    try:
        with _conn() as cn, cn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT ON (object_id) object_id, metrics, risk "
                "FROM satellite_observation WHERE river_id=%s AND sensor=%s "
                "ORDER BY object_id, acquired_at DESC", (river_id, sensor))
            for oid, m, r in cur.fetchall():
                latest[str(oid)] = (m or {}, r or {})
    except psycopg2.Error:
        latest = {}

    out = []
    mnlat = mnlng = 1e9
    mxlat = mxlng = -1e9
    for s in segs:
        oid = str(s.get("object_id"))
        rings = s.get("coordinates") or []
        if oid in latest:
            m, r = latest[oid]
            pseudo = ({"indices": {}, "risk": {"land_risk": m.get("OIL_PROBABILITY")}}
                      if fig_metric == "land" else {"indices": m, "risk": r})
            try:
                rgb = color_for_segment(pseudo, fig_metric)
            except Exception:
                rgb = (160, 160, 160)
        else:
            rgb = (200, 200, 200)  # no observation yet
        for ring in rings:
            for lat, lng in ring:
                mnlat, mxlat = min(mnlat, lat), max(mxlat, lat)
                mnlng, mxlng = min(mnlng, lng), max(mxlng, lng)
        out.append((rings, rgb))
    if mnlat > mxlat:
        return [], None
    return out, (mnlat, mnlng, mxlat, mxlng)


_TILE_URL = "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
_TILE_CACHE = "/tmp/aqg_tiles"


def _merc(lat, lng, z):
    """lat/lng -> fractional XYZ tile coords (Web Mercator), matching Leaflet."""
    n = 2.0 ** z
    x = (lng + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def _get_tile(z, x, y):
    """Fetch one CARTO light tile (file-cached, stdlib only). None on failure."""
    import urllib.request
    os.makedirs(_TILE_CACHE, exist_ok=True)
    cf = os.path.join(_TILE_CACHE, f"{z}_{x}_{y}.png")
    if os.path.exists(cf):
        return cf
    url = _TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": "AquaGraph/1.0"})
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                data = r.read()
            if data:
                with open(cf, "wb") as fh:
                    fh.write(data)
                return cf
        except Exception:
            continue
    return None


def _basemap_river_png(seg_data, bbox, max_px=1400):
    """Stitch CARTO light tiles for the river bbox and draw the colored
    segments on top - the report figure on the *actual app basemap*. Returns
    PNG bytes, or None to fall back to the plain card (offline / error)."""
    if not bbox:
        return None
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None

    mnlat, mnlng, mxlat, mxlng = bbox
    if mxlat - mnlat < 1e-4:
        mnlat -= 0.01
        mxlat += 0.01
    if mxlng - mnlng < 1e-4:
        mnlng -= 0.01
        mxlng += 0.01
    pad_lat = (mxlat - mnlat) * 0.08
    pad_lng = (mxlng - mnlng) * 0.08
    mnlat, mxlat = mnlat - pad_lat, mxlat + pad_lat
    mnlng, mxlng = mnlng - pad_lng, mxlng + pad_lng

    # Expand the *geographic* window to the page panel's aspect ratio so the
    # figure always fills the full page width with real surrounding map
    # (the river keeps its true shape - we add map context, never stretch).
    # Content width ≈ A4 − 2·1.6cm ≈ 504pt; panel height clamped 150–360pt.
    def _fx(lng):
        return (lng + 180.0) / 360.0

    def _fy(lat):
        return (1.0 - math.asinh(math.tan(math.radians(
            max(-84.0, min(84.0, lat))))) / math.pi) / 2.0

    cx0, cx1 = _fx(mnlng), _fx(mxlng)
    cyN, cyS = _fy(mxlat), _fy(mnlat)          # fy grows southward
    dfx, dfy = (cx1 - cx0), (cyS - cyN)
    if dfx > 1e-12 and dfy > 1e-12:
        cxm, cym = (cx0 + cx1) / 2, (cyN + cyS) / 2
        r0 = dfx / dfy
        tgt = max(504.0 / 360.0, min(504.0 / 150.0, r0))
        if tgt > r0:                            # widen longitude (fill width)
            half = tgt * dfy / 2.0
            mnlng, mxlng = (cxm - half) * 360.0 - 180.0, \
                           (cxm + half) * 360.0 - 180.0
        elif tgt < r0:                          # heighten latitude
            half = (dfx / tgt) / 2.0

            def _inv_fy(y):
                return math.degrees(math.atan(
                    math.sinh(math.pi * (1.0 - 2.0 * y))))
            mxlat, mnlat = _inv_fy(cym - half), _inv_fy(cym + half)
        mnlng = max(-179.9, mnlng)
        mxlng = min(179.9, mxlng)
        mnlat = max(-84.0, mnlat)
        mxlat = min(84.0, mxlat)

    chosen = None
    for z in range(13, 3, -1):
        xmin, _ = _merc(mxlat, mnlng, z)
        xmax, _ = _merc(mnlat, mxlng, z)
        _, ytop = _merc(mxlat, mnlng, z)
        _, ybot = _merc(mnlat, mxlng, z)
        spx, spy = (xmax - xmin) * 256, (ybot - ytop) * 256
        tx0, tx1 = math.floor(xmin), math.floor(xmax)
        ty0, ty1 = math.floor(ytop), math.floor(ybot)
        ntiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
        if max(spx, spy) <= max_px and ntiles <= 40:
            chosen = (z, tx0, tx1, ty0, ty1)
            break
    if not chosen:
        return None
    z, tx0, tx1, ty0, ty1 = chosen

    cols, rows = tx1 - tx0 + 1, ty1 - ty0 + 1
    canvas = Image.new("RGB", (cols * 256, rows * 256), (245, 245, 248))
    misses = 0
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            cf = _get_tile(z, tx, ty)
            if not cf:
                misses += 1
                continue
            try:
                with Image.open(cf) as tile:
                    canvas.paste(tile.convert("RGB"),
                                 ((tx - tx0) * 256, (ty - ty0) * 256))
            except Exception:
                misses += 1
    if misses > cols * rows * 0.4:
        return None  # too patchy - fall back

    def px(lat, lng):
        fx, fy = _merc(lat, lng, z)
        return ((fx - tx0) * 256, (fy - ty0) * 256)

    draw = ImageDraw.Draw(canvas)
    for rings, rgb in seg_data:
        for ring in rings:
            if len(ring) < 2:
                continue
            pts = [px(lat, lng) for lat, lng in ring]
            draw.line(pts, fill=(255, 255, 255), width=5, joint="curve")
            draw.line(pts, fill=tuple(rgb), width=3, joint="curve")

    x0, y0 = _merc(mxlat, mnlng, z)
    x1, y1 = _merc(mnlat, mxlng, z)
    left = max(0, int((x0 - tx0) * 256))
    top = max(0, int((y0 - ty0) * 256))
    right = min(canvas.width, int((x1 - tx0) * 256))
    bottom = min(canvas.height, int((y1 - ty0) * 256))
    if right - left > 10 and bottom - top > 10:
        canvas = canvas.crop((left, top, right, bottom))
    if canvas.width > max_px:
        h = int(canvas.height * max_px / canvas.width)
        canvas = canvas.resize((max_px, h), Image.LANCZOS)

    buf = io.BytesIO()
    canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _legend_colors(metric, n=30):
    """Sample the metric's palette across its range for the legend bar."""
    from metrics import color_for_segment, METRIC_RANGES
    lo, hi = METRIC_RANGES.get(metric, (0, 1))
    sw = []
    for i in range(n):
        raw = lo + (hi - lo) * i / (n - 1)
        if metric in ("pollution", "risk"):
            seg = {"risk": {"risk_score": raw}}
        elif metric == "water":
            seg = {"risk": {"water_risk": raw}}
        elif metric == "land":
            seg = {"risk": {"land_risk": raw}}
        else:
            seg = {"indices": {metric: raw}}
        try:
            sw.append(color_for_segment(seg, metric))
        except Exception:
            sw.append((160, 160, 160))
    return sw


def _decorate(canvas, doc):
    """Branded header (logo + wordmark + rule) and footer (disclaimer + page)."""
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    F, FB = _fonts()
    w, h = doc.pagesize
    canvas.saveState()
    if os.path.exists(_LOGO):
        canvas.drawImage(_LOGO, 1.6 * cm, h - 2.55 * cm, width=1.55 * cm,
                         height=1.55 * cm, mask="auto",
                         preserveAspectRatio=True)
    canvas.setFillColor(colors.HexColor(_BRAND_DEEP))
    canvas.setFont(FB, 17)
    canvas.drawString(3.55 * cm, h - 1.85 * cm, "AquaGraph")
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.setFont(F, 9.5)
    canvas.drawString(3.55 * cm, h - 2.35 * cm,
                      "River Water-Quality Report")
    canvas.setStrokeColor(colors.HexColor(_BRAND))
    canvas.setLineWidth(2)
    canvas.line(1.6 * cm, h - 2.9 * cm, w - 1.6 * cm, h - 2.9 * cm)

    canvas.setStrokeColor(colors.HexColor(_BORDER))
    canvas.setLineWidth(0.5)
    canvas.line(1.6 * cm, 1.55 * cm, w - 1.6 * cm, 1.55 * cm)
    canvas.setFillColor(colors.HexColor("#999999"))
    canvas.setFont(F, 7.5)
    canvas.drawString(1.6 * cm, 1.05 * cm,
                      "Satellite-derived indices (Sentinel via Google Earth "
                      "Engine). Indicative, not regulatory.")
    canvas.drawRightString(w - 1.6 * cm, 1.05 * cm,
                           f"AquaGraph · {date.today().isoformat()} · "
                           f"page {doc.page}")
    canvas.restoreState()


@history_bp.route("/api/river/<river_id>/report.pdf", methods=["GET"])
def river_report(river_id):
    sensor = request.args.get("sensor", "S2").upper()
    metrics = [m.strip().upper() for m in
               request.args.get("metrics", "").split(",") if m.strip()]
    metrics = [m for m in metrics if m in KNOWN_METRICS] or DEFAULT_REPORT_METRICS
    fig_metric = request.args.get("map_metric",
                                  _FIG_METRIC.get(sensor, "pollution"))

    series_by_metric = {}
    try:
        for m in metrics:
            series_by_metric[m] = _series("river_id", river_id, m, sensor,
                                          request.args)
        seg_data, bbox = _seg_colors(river_id, sensor, fig_metric)
    except psycopg2.Error as e:
        return jsonify({"error": "history unavailable", "detail": str(e)}), 503

    # Real CARTO-light basemap behind the river (None -> plain-card fallback).
    use_basemap = request.args.get("basemap", "1") != "0"
    basemap_png = _basemap_river_png(seg_data, bbox) if use_basemap else None

    pdf = _build_pdf(river_id, _river_name(river_id), sensor, series_by_metric,
                     request.args.get("from"), request.args.get("to"),
                     seg_data, bbox, fig_metric, basemap_png)
    return send_file(
        io.BytesIO(pdf),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"aquagraph_{river_id}_{date.today().isoformat()}.pdf",
    )


def _build_pdf(river_id, river_name, sensor, series_by_metric, frm, to,
               seg_data, bbox, fig_metric, basemap_png=None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                    Table, TableStyle, Flowable)
    from reportlab.graphics.shapes import (Drawing, Polygon, PolyLine,
                                           Line, String)

    F, FB = _fonts()
    BRAND = colors.HexColor(_BRAND)
    BRAND_DEEP = colors.HexColor(_BRAND_DEEP)
    BORDER = colors.HexColor(_BORDER)

    H1 = ParagraphStyle("H1", fontName=FB, fontSize=13,
                        textColor=BRAND_DEEP, spaceBefore=14, spaceAfter=6)
    BODY = ParagraphStyle("BODY", fontName=F, fontSize=9.5,
                          textColor=colors.HexColor("#444444"), leading=13)

    # --- spatial figure: river over the real CARTO-light basemap (same as
    #     the app); falls back to a plain colored-vector card if offline ---
    class RiverMap(Flowable):
        def __init__(self, seg, box, metric, png):
            super().__init__()
            self.seg, self.box, self.metric = seg, box, metric
            self._w = 0
            self._img = None
            self._iw = self._ih = 0
            if png:
                try:
                    self._img = ImageReader(io.BytesIO(png))
                    self._iw, self._ih = self._img.getSize()
                except Exception:
                    self._img = None

        def wrap(self, aw, ah):
            self._w = aw
            if self._img:
                # The basemap window was pre-shaped to the page aspect, so
                # fill the full width; height follows the image aspect (no
                # stretch). Clamp + recenter only as a safety net.
                dw = aw
                dh = aw * self._ih / float(self._iw)
                if dh > 360.0:
                    dh = 360.0
                    dw = dh * self._iw / float(self._ih)
                elif dh < 150.0:
                    dh = 150.0
                    dw = min(aw, dh * self._iw / float(self._ih))
                self._dw, self._dh = dw, dh
                self._dx = (aw - dw) / 2.0
                self._h = dh + 30
                return aw, self._h
            if not self.box:
                self._h = 26
                return aw, self._h
            mnlat, mnlng, mxlat, mxlng = self.box
            latm = math.radians((mnlat + mxlat) / 2)
            gx = max(1e-9, (mxlng - mnlng) * math.cos(latm))
            gy = max(1e-9, (mxlat - mnlat))
            self._h = max(150, min(330, aw * gy / gx)) + 30
            return aw, self._h

        def _overlay(self, c, img_x, img_w, box_h, full_w):
            # North arrow rides the (possibly narrow, centered) image...
            c.setStrokeColor(BRAND_DEEP)
            c.setFillColor(BRAND_DEEP)
            c.setLineWidth(1.2)
            nx, ny = img_x + img_w - 16, 26 + box_h - 26
            c.line(nx, ny, nx, ny + 12)
            c.setFont(FB, 8)
            c.drawCentredString(nx, ny + 14, "N")
            # ...but the legend + caption span the full content width below,
            # so they never collide with a narrow figure.
            sw = _legend_colors(self.metric)
            lw = min(150, full_w * 0.32)
            seg_w = lw / len(sw)
            ly = 11
            for i, rgb in enumerate(sw):
                c.setFillColorRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
                c.rect(i * seg_w, ly, seg_w + 0.6, 7, stroke=0, fill=1)
            c.setFont(F, 7)
            c.setFillColor(colors.HexColor("#777777"))
            c.drawString(0, ly - 8, "Low")
            c.drawRightString(lw, ly - 8, "High")
            c.setFont(F, 7.5)
            src = ("Basemap © OpenStreetMap, © CARTO" if self._img
                   else "latest observation")
            c.drawRightString(full_w, ly + 1,
                              f"colored by {self.metric} · {src} "
                              f"· as on the AquaGraph map")

        def draw(self):
            c = self.canv
            W = self._w
            if self._img:
                dx, dw, dh = self._dx, self._dw, self._dh
                c.drawImage(self._img, dx, 26, width=dw, height=dh,
                            mask="auto", preserveAspectRatio=True)
                c.setStrokeColor(BORDER)
                c.setLineWidth(1)
                c.roundRect(dx, 26, dw, dh, 8, stroke=1, fill=0)
                self._overlay(c, dx, dw, dh, W)
                return
            if not self.box:
                c.setFont(F, 9)
                c.setFillColor(colors.HexColor("#999999"))
                c.drawString(0, 8, "Geometry unavailable for this river.")
                return
            box_h = self._h - 30
            c.setFillColor(colors.HexColor("#fbfaff"))
            c.setStrokeColor(BORDER)
            c.roundRect(0, 26, W, box_h, 8, stroke=1, fill=1)
            pad = 12
            mnlat, mnlng, mxlat, mxlng = self.box
            latm = math.radians((mnlat + mxlat) / 2)
            spx = max(1e-9, mxlng - mnlng)
            spy = max(1e-9, mxlat - mnlat)
            iw, ih = W - 2 * pad, box_h - 2 * pad
            sc = min(iw / (spx * math.cos(latm)), ih / spy)
            dw, dh = spx * math.cos(latm) * sc, spy * sc
            ox = pad + (iw - dw) / 2
            oy = 26 + pad + (ih - dh) / 2

            def proj(lat, lng):
                return (ox + (lng - mnlng) * math.cos(latm) * sc,
                        oy + (lat - mnlat) * sc)

            c.setLineCap(1)
            c.setLineJoin(1)
            for rings, rgb in self.seg:
                c.setStrokeColorRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
                c.setLineWidth(1.8)
                for ring in rings:
                    if len(ring) < 2:
                        continue
                    p = c.beginPath()
                    x, y = proj(*ring[0])
                    p.moveTo(x, y)
                    for lat, lng in ring[1:]:
                        x, y = proj(lat, lng)
                        p.lineTo(x, y)
                    c.drawPath(p)
            self._overlay(c, 0, W, box_h, W)

    # --- document ---
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.6 * cm, rightMargin=1.6 * cm,
        topMargin=3.4 * cm, bottomMargin=2.0 * cm,
        title=f"AquaGraph Report - {river_name}", author="AquaGraph",
    )
    story = []

    # Exact observed range: first datapoint date → last datapoint date.
    all_dates = sorted({p["date"] for pts in series_by_metric.values()
                        for p in pts if p.get("date")})
    if all_dates:
        period = (f"{all_dates[0]}  →  {all_dates[-1]}"
                  f"  ({len(all_dates)} observation date"
                  f"{'' if len(all_dates) == 1 else 's'})")
    else:
        period = "no observations available"
    info = [
        ["River", f"{river_name}  ({river_id})"],
        ["Sensor", "Sentinel-2 (spectral indices)" if sensor == "S2"
         else "Sentinel-1 (SAR oil detection)" if sensor == "S1" else sensor],
        ["Data range", period],
        ["Generated", date.today().isoformat()],
        ["Spatial layer", fig_metric],
    ]
    t = Table(info, colWidths=[3.2 * cm, None])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), FB, 9.5),
        ("FONT", (1, 0), (1, -1), F, 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), BRAND_DEEP),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#333333")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
    ]))
    story += [t, Spacer(1, 10)]

    story += [Paragraph("River - spatial overview", H1)]
    story += [RiverMap(seg_data, bbox, fig_metric, basemap_png),
              Spacer(1, 14)]

    story += [Paragraph("Latest observed values", H1)]
    rows = [["Metric", "Latest avg", "On", "Min", "Max", "Segments", "Obs."]]
    for m, pts in series_by_metric.items():
        if pts:
            last = pts[-1]
            rows.append([m, f"{last['avg']}", last["date"],
                         f"{last['min']}", f"{last['max']}",
                         str(last["segment_count"]), str(len(pts))])
        else:
            rows.append([m, "no data", "-", "-", "-", "-", "0"])
    st = Table(rows, repeatRows=1)
    st.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONT", (0, 0), (-1, 0), FB, 9),
        ("FONT", (0, 1), (-1, -1), F, 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f5f3ff")]),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [st, Spacer(1, 6)]

    story += [Paragraph("Evolution over time", H1)]
    story += [Paragraph(
        "The solid purple line is the river-wide <b>average</b> of the metric "
        "on each date. The shaded band is the <b>min–max range</b> across the "
        "river's segments that date: a wide band means the metric varies "
        "strongly along the river (some stretches much cleaner or more "
        "polluted than others); a narrow band means the river is fairly "
        "uniform.", BODY), Spacer(1, 6)]

    GREY = colors.HexColor("#777777")
    AXIS = colors.HexColor("#cccccc")
    BAND = colors.HexColor("#ede9fe")  # faint brand tint = the UI's band

    def _trend(pts):
        """Custom drawing: min–max band + average line + dated axes,
        matching the in-app evolution chart."""
        val = [(i, p["avg"],
                p["min"] if p["min"] is not None else p["avg"],
                p["max"] if p["max"] is not None else p["avg"])
               for i, p in enumerate(pts) if p["avg"] is not None]
        W, H = doc.width, 160
        Lp, Rp, Tp, Bp = 46, 8, 12, 22
        pw, ph = W - Lp - Rp, H - Tp - Bp
        xs = [v[0] for v in val]
        xmn, xmx = min(xs), max(xs)
        lo = min(v[2] for v in val)
        hi = max(v[3] for v in val)
        if hi == lo:
            hi += 1
            lo -= 1

        def X(i):
            return Lp + (0 if xmx == xmn else (i - xmn) / (xmx - xmn)) * pw

        def Y(v):
            return Bp + (v - lo) / (hi - lo) * ph

        d = Drawing(W, H)
        d.add(Line(Lp, Bp, Lp, Bp + ph, strokeColor=AXIS, strokeWidth=0.5))
        d.add(Line(Lp, Bp, Lp + pw, Bp, strokeColor=AXIS, strokeWidth=0.5))
        band = []
        for v in val:
            band += [X(v[0]), Y(v[3])]
        for v in reversed(val):
            band += [X(v[0]), Y(v[2])]
        d.add(Polygon(points=band, fillColor=BAND, strokeColor=None,
                      strokeWidth=0))
        line = []
        for v in val:
            line += [X(v[0]), Y(v[1])]
        d.add(PolyLine(points=line, strokeColor=BRAND, strokeWidth=2))
        d.add(String(Lp - 4, Bp + ph - 3, f"{hi:.4g}", fontName=F,
                     fontSize=7, fillColor=GREY, textAnchor="end"))
        d.add(String(Lp - 4, Bp - 1, f"{lo:.4g}", fontName=F, fontSize=7,
                     fillColor=GREY, textAnchor="end"))
        d.add(String(Lp, Bp - 13, pts[xmn]["date"], fontName=F, fontSize=7,
                     fillColor=GREY, textAnchor="start"))
        d.add(String(Lp + pw, Bp - 13, pts[xmx]["date"], fontName=F,
                     fontSize=7, fillColor=GREY, textAnchor="end"))
        return d

    any_chart = False
    for m, pts in series_by_metric.items():
        valued = [p for p in pts if p["avg"] is not None]
        if len(valued) < 2:
            continue
        any_chart = True
        story += [Paragraph(
            f"<b>{m}</b> - {pts[0]['date']} → {pts[-1]['date']} "
            f"({len(valued)} observations)", BODY)]
        story += [_trend(pts), Spacer(1, 12)]
    if not any_chart:
        story += [Paragraph(
            "Trend charts appear once a metric has at least two observation "
            "dates. History is still accumulating from incoming satellite "
            "passes.", BODY)]

    doc.build(story, onFirstPage=_decorate, onLaterPages=_decorate)
    return buf.getvalue()
