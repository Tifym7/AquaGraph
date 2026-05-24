"""Advanced (technical) per-segment PDF report.

A user-triggered, slow-path companion to the existing per-river PDF. The
classic `/api/river/<id>/report.pdf` stays untouched - this one is
opt-in, takes minutes to generate, and is emailed to the user when ready.

What it adds on top of the standard report:

  1. **Real Sentinel imagery for the chosen segment** - the same RGB +
     index thumbnails the Pipeline page shows, but computed live for
     this specific segment's bounding box (plus a small buffer).
  2. **Per-metric evolution charts** at the segment level (existing
     time-series, drawn larger).
  3. **An AI conclusion** synthesised by a multimodal LLM running on our
     Ollama server. The model receives the thumbnails + a textual
     metric summary and emits a short "what stands out, what to watch"
     paragraph plus a flagged-issues list.

Triggered from `POST /api/segment/<object_id>/advanced-report` and
delivered via SMTP using the same env vars the verification email uses.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import smtplib
import threading
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageDraw

logger = logging.getLogger("aquagraph.advanced_report")

# Module-level lazy state. EE init is expensive (one-time auth) and
# Ollama isn't always reachable - both fail soft so the app boots even
# without them, only erroring out when the feature is actually used.
_EE_INIT_LOCK = threading.Lock()
_EE_INIT_DONE = False
_EE_AVAILABLE = False


def _init_ee_lazy() -> bool:
    """One-shot Earth Engine init. Reuses the same auth helper the
    ingest container does, so the GEE service-account key is picked up
    from $GEE_KEY_FILE."""
    global _EE_INIT_DONE, _EE_AVAILABLE
    if _EE_INIT_DONE:
        return _EE_AVAILABLE
    with _EE_INIT_LOCK:
        if _EE_INIT_DONE:
            return _EE_AVAILABLE
        try:
            from ingest.gee_auth import init_ee  # type: ignore
            init_ee()
            _EE_AVAILABLE = True
            logger.info("Earth Engine initialised for advanced reports")
        except Exception as e:
            _EE_AVAILABLE = False
            logger.warning("Earth Engine init failed: %s", e)
        _EE_INIT_DONE = True
    return _EE_AVAILABLE


# ---------------------------------------------------------------------------
# Segment lookup. Segments live as JSON LOD bundles (data/segments_lod_*.json)
# not in the DB, so we read them once and cache an object_id -> segment dict.

_SEG_INDEX_LOCK = threading.Lock()
_SEG_INDEX: Dict[str, dict] = {}


def _segments_path(lod: int = 3) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "data", f"segments_lod_{lod}.json")


def _load_segment_index() -> None:
    """Lazy index of every segment we ever serve. Fastest LOD (3) is
    fine - bbox + name are identical across LODs; only the polyline
    decimation differs."""
    global _SEG_INDEX
    if _SEG_INDEX:
        return
    with _SEG_INDEX_LOCK:
        if _SEG_INDEX:
            return
        path = _segments_path(3)
        if not os.path.exists(path):
            logger.warning("segments file not found at %s", path)
            return
        with open(path, "r") as f:
            data = json.load(f)
        idx: Dict[str, dict] = {}
        for seg in data.get("segments", []):
            oid = seg.get("object_id")
            if oid:
                idx[oid] = seg
        _SEG_INDEX = idx
        logger.info("indexed %d segments for advanced report lookups", len(idx))


def get_segment(object_id: str) -> Optional[dict]:
    _load_segment_index()
    return _SEG_INDEX.get(object_id)


# ---------------------------------------------------------------------------
# EE thumbnail generation per segment.

# Visualisation palettes - identical to backend/ingest/scripts/generate_metric_thumbs.py
# so the report imagery looks like the Pipeline page imagery.
_VIS_S2 = {
    "NDWI":      {"min": -0.4,  "max": 0.7,  "palette": ["8c510a", "bf812d", "dfc27d", "c7eae5", "5ab4ac", "01665e", "08306b"]},
    "MNDWI":     {"min": -0.4,  "max": 0.7,  "palette": ["1e293b", "374151", "60a5fa", "1d4ed8", "0c4a6e"]},
    "NDVI":      {"min": -0.2,  "max": 0.85, "palette": ["7c2d12", "a16207", "facc15", "86efac", "22c55e", "166534", "052e16"]},
    "NDCI":      {"min": -0.10, "max": 0.30, "palette": ["155e75", "0e7490", "67e8f9", "facc15", "f59e0b", "b91c1c"]},
    "NDTI":      {"min": -0.20, "max": 0.40, "palette": ["1e3a8a", "60a5fa", "e0e7ff", "fde68a", "d97706", "92400e", "451a03"]},
    "TURBIDITY": {"min": 0,     "max": 2200, "palette": ["1e3a8a", "60a5fa", "fde68a", "d97706", "92400e", "451a03"]},
    "BSI":       {"min": -0.30, "max": 0.30, "palette": ["166534", "22c55e", "fef3c7", "f59e0b", "ea580c", "b91c1c", "7f1d1d"]},
}
_VIS_POLLUTION = {
    "min": 0, "max": 7,
    "palette": ["166534", "16a34a", "65a30d", "eab308", "f59e0b",
                "ea580c", "dc2626", "7f1d1d"],
}
_VIS_TRUE_COLOR = {"bands": ["B4", "B3", "B2"], "min": 200, "max": 2800, "gamma": 1.1}
_VIS_S1 = {
    "OIL_PROBABILITY": {
        "min": 0.0, "max": 1.0,
        "palette": ["0b1220", "1e293b", "312e81", "6b21a8",
                    "a855f7", "e879f9", "fbbf24"],
    },
}

# Thumbnail size that strikes a balance between EE compute time, PDF
# clarity, and Ollama latency (large images quadratically slow LLMs).
_THUMB_W, _THUMB_H = 480, 270


def _segment_bbox_buffered(seg: dict, buffer_km: float = 1.0) -> List[float]:
    """Return [lon_min, lat_min, lon_max, lat_max] with a small geographic
    buffer so the EE thumb shows the river inside context (banks, nearby
    vegetation) - not a 30m-wide stripe of pixels. Buffer is in km,
    converted to deg using Romania's mean latitude (~46°)."""
    bb = seg.get("bbox") or {}
    lat0 = float(bb.get("min_lat"))
    lat1 = float(bb.get("max_lat"))
    lon0 = float(bb.get("min_lon"))
    lon1 = float(bb.get("max_lon"))
    dlat = buffer_km / 111.0                          # 1 deg lat ~ 111 km
    dlon = buffer_km / (111.0 * 0.7)                  # cos(46°) ~ 0.7
    # Ensure a minimum size for tiny segments (<200 m) so the thumb isn't
    # a single pixel.
    min_span = 0.01     # ~1.1 km lat
    span_lat = max(lat1 - lat0, min_span)
    span_lon = max(lon1 - lon0, min_span / 0.7)
    cx, cy = (lon0 + lon1) / 2, (lat0 + lat1) / 2
    return [cx - span_lon / 2 - dlon, cy - span_lat / 2 - dlat,
            cx + span_lon / 2 + dlon, cy + span_lat / 2 + dlat]


def _download_thumb_png(url: str, timeout: int = 120) -> bytes:
    import urllib.request
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def render_segment_thumbnails(
    seg: dict, sensor: str, date_from: str, date_to: str,
) -> Dict[str, bytes]:
    """Compute live EE thumbnails for the segment's buffered bbox over the
    given date window. Returns a dict {metric: PNG bytes}. Quietly drops
    any individual metric that fails so the report still has something
    to show."""
    if not _init_ee_lazy():
        logger.warning("EE unavailable; skipping thumbnails")
        return {}
    import ee
    from ingest.sensors.sentinel1 import Sentinel1
    from ingest.sensors.sentinel2 import Sentinel2, _mask_s2_clouds

    bbox = _segment_bbox_buffered(seg)
    region = ee.Geometry.Rectangle(bbox)

    # Monkey-patch country() so the EE clip stays inside the bbox - same
    # trick the thumbnail generator uses (see generate_metric_thumbs.py).
    s2, s1 = Sentinel2(), Sentinel1()
    s2.country = lambda r=region: r  # type: ignore
    s1.country = lambda r=region: r  # type: ignore

    out: Dict[str, bytes] = {}

    def _thumb(image: "ee.Image", vis: dict) -> Optional[bytes]:
        try:
            url = image.visualize(**vis).getThumbURL({
                "dimensions": f"{_THUMB_W}x{_THUMB_H}",
                "region": region, "format": "png",
            })
            return _download_thumb_png(url)
        except Exception as e:
            logger.warning("thumb render failed: %s", e)
            return None

    # True-colour reference (always rendered)
    try:
        tc = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
              .filterBounds(region).filterDate(date_from, date_to)
              .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 25))
              .map(_mask_s2_clouds)
              .median().clip(region).select(["B4", "B3", "B2"]))
        png = _thumb(tc, _VIS_S2["NDWI"] if False else _VIS_TRUE_COLOR)
        if png:
            out["TRUE_COLOR"] = png
    except Exception as e:
        logger.warning("TRUE_COLOR failed: %s", e)

    # S2 indices + composite POLLUTION
    try:
        s2_img = s2.indices_image(date_from, date_to).clip(region)
        for m, vis in _VIS_S2.items():
            png = _thumb(s2_img.select(m), vis)
            if png:
                out[m] = png
        # POLLUTION (composite, 0-7)
        pollution = s2.pollution_image(date_from, date_to).clip(region)
        png = _thumb(pollution, _VIS_POLLUTION)
        if png:
            out["POLLUTION"] = png
    except Exception as e:
        logger.warning("S2 thumbs failed: %s", e)

    # SAR (only meaningful if sensor includes S1; render anyway for completeness)
    try:
        s1_img = s1.indices_image(date_from, date_to).clip(region)
        png = _thumb(s1_img.select("OIL_PROBABILITY"), _VIS_S1["OIL_PROBABILITY"])
        if png:
            out["OIL_PROBABILITY"] = png
    except Exception as e:
        logger.warning("S1 thumb failed: %s", e)

    return out


# ---------------------------------------------------------------------------
# Ollama multimodal call.

def _ollama_summarise(
    metrics_summary: str, thumbnails: Dict[str, bytes], river_name: str,
    segment_id: str,
) -> Tuple[str, List[str]]:
    """Ask Ollama for a short technical conclusion + a list of flagged
    issues, given the metric summary and the per-metric thumbnails.

    Uses Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`)
    with the standard multimodal `content` array - this is the path
    that works with Qwen3-vision-style models. Reasoning models (Qwen3
    family, DeepSeek R1, ...) chain-of-thought internally; the OAI
    endpoint splits that into `message.reasoning` (hidden from us) and
    `message.content` (what we put in the PDF), so we get the benefit
    of reasoning without leaking it into the report.

    Returns ('', []) only if the server is unreachable or both the
    multimodal and the text-only fallback attempts return nothing.
    """
    base_url = os.getenv("OLLAMA_BASE_URL", "").strip().rstrip("/")
    model    = os.getenv("OLLAMA_MODEL", "llava").strip()
    if not base_url:
        return "", []
    try:
        import requests
    except Exception:
        logger.warning("requests unavailable; skipping Ollama")
        return "", []

    # Limit which images we send. Multimodal models slow down sharply
    # with each extra attachment, and the LLM doesn't need every band.
    PRIORITY = ["TRUE_COLOR", "POLLUTION", "NDTI", "NDCI",
                "BSI", "OIL_PROBABILITY"]
    image_data_urls: List[str] = []
    for key in PRIORITY:
        if key in thumbnails:
            b64 = base64.b64encode(thumbnails[key]).decode("ascii")
            image_data_urls.append(f"data:image/png;base64,{b64}")
        if len(image_data_urls) >= 4:
            break

    timeout    = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "300"))
    # Reasoning models (Qwen3, DeepSeek R1, ...) routinely spend
    # 1500-2500 tokens analysing the prompt + images before they emit
    # the final answer. The visible report body itself only wants
    # ~300-500 tokens. Setting the ceiling to 3000 leaves room for both
    # phases without blowing the latency budget (~50s on a 35B model
    # at ~60 tok/s).
    max_tokens = int(os.getenv("OLLAMA_MAX_TOKENS", "3000"))
    endpoint   = f"{base_url}/v1/chat/completions"

    def _call(prompt: str, with_images: bool) -> str:
        """One round-trip via the OpenAI-compatible endpoint. Returns
        the assistant `content` (may be empty if the server fails or
        the answer was truncated)."""
        if with_images and image_data_urls:
            content: Any = [{"type": "text", "text": prompt}] + [
                {"type": "image_url", "image_url": {"url": u}}
                for u in image_data_urls
            ]
        else:
            content = prompt
        payload = {
            "model":       model,
            "messages":    [{"role": "user", "content": content}],
            "temperature": 0.2,
            "max_tokens":  max_tokens,
        }
        try:
            r = requests.post(
                endpoint, json=payload, timeout=timeout,
                # Some Ollama OAI installs reject without an auth header.
                # Any non-empty bearer is accepted by default.
                headers={"Authorization": "Bearer ollama"},
            )
            r.raise_for_status()
            data = r.json()
            choice = (data.get("choices") or [{}])[0]
            msg = choice.get("message") or {}
            # `message.reasoning` (chain-of-thought) is deliberately
            # ignored - it stays hidden from the PDF.
            return (msg.get("content") or "").strip()
        except Exception as e:
            logger.warning("Ollama call (images=%s) failed: %s",
                           with_images, e)
            return ""

    prompt_with_images = (
        "You are a remote-sensing analyst reviewing a Romanian river segment. "
        f"Segment: {river_name} (id {segment_id}).\n\n"
        f"Recent satellite indices (mean values per metric over the requested "
        f"window):\n{metrics_summary}\n\n"
        "The attached images are, in order: true-colour Sentinel-2 reference, "
        "POLLUTION composite (0-7, green to red), then the strongest "
        "contributing indices.\n\n"
        "Write a short technical report in two parts:\n"
        "  1. CONCLUSION: 2-4 sentences interpreting the imagery and metrics "
        "     together. Be concrete (e.g. 'turbid mainstem', 'high chlorophyll "
        "     in the lagoon south of the reach').\n"
        "  2. FLAGS: 1-5 bullet points listing potential pollution issues to "
        "     investigate, each starting with the metric/feature that "
        "     triggered it. If everything looks normal, write a single "
        "     bullet 'No anomalies.'\n"
        "Total length under 220 words. Plain text, no markdown."
    )
    prompt_text_only = (
        "You are a remote-sensing analyst reviewing a Romanian river segment. "
        f"Segment: {river_name} (id {segment_id}).\n\n"
        f"Recent satellite indices (mean values per metric over the requested "
        f"window):\n{metrics_summary}\n\n"
        "Write a short technical report in two parts:\n"
        "  1. CONCLUSION: 2-4 sentences interpreting the metrics. Be concrete "
        "     (e.g. 'NDTI elevated mid-window suggests a turbidity event', "
        "     'BSI rising on the banks indicates land-use change').\n"
        "  2. FLAGS: 1-5 bullet points listing potential pollution issues to "
        "     investigate, each starting with the metric that triggered it. "
        "     If everything looks normal, write a single bullet 'No anomalies.'\n"
        "Total length under 220 words. Plain text, no markdown."
    )

    text = ""
    if image_data_urls:
        text = _call(prompt_with_images, with_images=True)
    if not text:
        text = _call(prompt_text_only, with_images=False)
    if not text:
        return "", []

    # Split CONCLUSION / FLAGS - tolerate small formatting variations
    # (the model sometimes drops the "CONCLUSION:" header, sometimes
    # uses asterisks for bullets, etc).
    conclusion = text
    flags: List[str] = []
    upper = text.upper()
    if "FLAGS" in upper:
        idx = upper.find("FLAGS")
        conclusion = text[:idx].strip().lstrip("CONCLUSION:").strip(":").strip()
        flag_block = text[idx:].split(":", 1)[-1] if ":" in text[idx:] else text[idx + 5:]
        for line in flag_block.splitlines():
            line = line.strip().lstrip("-•*").strip()
            if line:
                flags.append(line)
    return conclusion, flags


# ---------------------------------------------------------------------------
# PDF assembly: extended layout that wraps the standard per-river layout
# and inserts the per-segment imagery + AI section.

def build_advanced_pdf(
    seg: dict, sensor: str, metrics: List[str],
    date_from: str, date_to: str,
    history: Dict[str, list], thumbnails: Dict[str, bytes],
    ai_conclusion: str, ai_flags: List[str],
) -> bytes:
    """Assemble the final PDF in-memory. Uses ReportLab so we don't need
    a headless browser. Layout:
      - Cover page: segment id, river name, date window, metrics
      - Page 2: imagery panel (every thumbnail we managed to render)
      - Page 3+: per-metric evolution charts (one or two per page)
      - Last page: AI conclusion (if available) + flagged issues
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units  import cm
    from reportlab.lib        import colors
    from reportlab.pdfgen     import canvas as pdf_canvas
    from reportlab.platypus   import (
        SimpleDocTemplate, Paragraph, Spacer, PageBreak,
        Image as PlatypusImage, Table, TableStyle,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=1.8 * cm, rightMargin=1.8 * cm,
                            topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                            title=f"AquaGraph Advanced Report - {seg.get('object_id')}")
    styles = getSampleStyleSheet()
    H1 = ParagraphStyle("H1", parent=styles["Heading1"],
                        fontName="Helvetica-Bold", fontSize=20,
                        textColor=colors.HexColor("#3c096c"),
                        spaceAfter=0.4 * cm)
    H2 = ParagraphStyle("H2", parent=styles["Heading2"],
                        fontName="Helvetica-Bold", fontSize=14,
                        textColor=colors.HexColor("#5a189a"),
                        spaceBefore=0.4 * cm, spaceAfter=0.2 * cm)
    BODY = ParagraphStyle("body", parent=styles["BodyText"],
                          fontName="Helvetica", fontSize=10,
                          leading=14, textColor=colors.HexColor("#1f1b2e"))
    MUTED = ParagraphStyle("muted", parent=BODY, fontSize=9,
                           textColor=colors.HexColor("#6b7280"))
    KICK = ParagraphStyle("kick", parent=BODY, fontSize=9,
                          fontName="Helvetica-Bold",
                          textColor=colors.HexColor("#5a189a"))

    story: list = []

    river_name = seg.get("river_name") or "Unknown river"
    object_id  = seg.get("object_id") or "?"

    # Cover --------------------------------------------------------------
    story.append(Paragraph("AquaGraph — Advanced Segment Report", H1))
    story.append(Paragraph(
        f"<b>{river_name}</b> · segment <font face='Courier'>{object_id}</font>",
        BODY,
    ))
    story.append(Spacer(1, 0.4 * cm))
    meta_data = [
        ["Date window",  f"{date_from} → {date_to}"],
        ["Sensor focus", sensor],
        ["Metrics",      ", ".join(metrics)],
        ["Strahler",     str(seg.get("strahler", "?"))],
        ["River id",     str(seg.get("river_id", "?"))],
        ["Generated",    date.today().isoformat()],
    ]
    meta_tbl = Table(meta_data, colWidths=[3.4 * cm, 12 * cm])
    meta_tbl.setStyle(TableStyle([
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR",  (0, 0), (0, -1), colors.HexColor("#5a189a")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1),
            [colors.HexColor("#faf5ff"), colors.HexColor("#ffffff")]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4,
            colors.HexColor("#ede9fe")),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(
        "This is the technical (\"x-ray\") version of the AquaGraph "
        "report. It pairs the standard per-segment metric evolution with "
        "real Sentinel imagery for this specific reach and a short AI-"
        "synthesised conclusion. Imagery is recomputed live; nothing is "
        "cached.",
        MUTED,
    ))

    # Imagery panel ------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("Sentinel imagery — this segment", H1))
    story.append(Paragraph(
        f"Buffered bbox around segment {object_id}, "
        f"{date_from} → {date_to}. Each panel shows one metric over the "
        "live Sentinel composite for the window.",
        MUTED,
    ))
    story.append(Spacer(1, 0.3 * cm))

    # Preferred display order so the cover-style RGB and the composite
    # POLLUTION come first.
    THUMB_ORDER = ["TRUE_COLOR", "POLLUTION", "MNDWI", "NDWI",
                    "NDVI", "NDCI", "NDTI", "TURBIDITY", "BSI",
                    "OIL_PROBABILITY"]
    THUMB_LABEL = {
        "TRUE_COLOR":      "Sentinel-2 true colour",
        "POLLUTION":       "POLLUTION composite (0-7)",
        "NDWI":            "NDWI · water mask",
        "MNDWI":           "MNDWI · refined water",
        "NDVI":            "NDVI · vegetation",
        "NDCI":            "NDCI · chlorophyll-a",
        "NDTI":            "NDTI · turbidity",
        "TURBIDITY":       "TURBIDITY · sediment",
        "BSI":             "BSI · bare soil",
        "OIL_PROBABILITY": "OIL_PROBABILITY · SAR",
    }
    cells: List[list] = []
    row: list = []
    for key in THUMB_ORDER:
        if key not in thumbnails:
            continue
        bio = io.BytesIO(thumbnails[key])
        img = PlatypusImage(bio, width=7.8 * cm, height=4.4 * cm)
        cell = [img, Paragraph(THUMB_LABEL.get(key, key), KICK)]
        row.append(cell)
        if len(row) == 2:
            cells.append(row); row = []
    if row:
        row.append([Paragraph(" ", BODY)])
        cells.append(row)

    if cells:
        thumb_tbl = Table(cells, colWidths=[8 * cm, 8 * cm])
        thumb_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(thumb_tbl)
    else:
        story.append(Paragraph(
            "Imagery rendering failed for this window (Earth Engine "
            "unavailable). See evolution charts below.", MUTED,
        ))

    # Per-metric evolution charts ---------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("Per-metric evolution", H1))
    story.append(Paragraph(
        "Time-series of the segment's mean values for each requested "
        "metric, across every available satellite pass in the window.",
        MUTED,
    ))
    story.append(Spacer(1, 0.3 * cm))

    for m in metrics:
        points = history.get(m, [])
        story.append(Paragraph(m, H2))
        if not points:
            story.append(Paragraph("No passes in this window.", MUTED))
            continue
        png = _render_sparkline(points, label=m)
        if png:
            story.append(PlatypusImage(io.BytesIO(png),
                                       width=16 * cm, height=5.5 * cm))
        vals = [p["avg"] for p in points if p.get("avg") is not None]
        if vals:
            story.append(Paragraph(
                f"{len(points)} passes · "
                f"min {_fmt_v(min(vals))} · max {_fmt_v(max(vals))}",
                MUTED,
            ))

    # AI conclusion ------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("AI synthesis", H1))
    if ai_conclusion or ai_flags:
        story.append(Paragraph(
            "Generated by a multimodal model reviewing the imagery and "
            "the recent metric values together. Treat as a starting "
            "point for human review, not a regulatory finding.",
            MUTED,
        ))
        story.append(Spacer(1, 0.3 * cm))
        if ai_conclusion:
            story.append(Paragraph("Conclusion", H2))
            story.append(Paragraph(_escape(ai_conclusion), BODY))
        if ai_flags:
            story.append(Spacer(1, 0.3 * cm))
            story.append(Paragraph("Potential issues", H2))
            for f in ai_flags:
                story.append(Paragraph("• " + _escape(f), BODY))
    else:
        story.append(Paragraph(
            "The AI synthesis service was unavailable when this report "
            "was generated. Charts and imagery above remain authoritative.",
            MUTED,
        ))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def _footer(canvas: "any", doc: "any") -> None:
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#999999"))
    canvas.setFont("Helvetica", 7.5)
    w, _ = canvas._pagesize
    canvas.drawString(1.8 * cm, 1.05 * cm,
                       "Sentinel via Earth Engine. Indicative, not regulatory.")
    canvas.drawRightString(w - 1.8 * cm, 1.05 * cm,
                            f"AquaGraph · {date.today().isoformat()} · "
                            f"page {doc.page}")
    canvas.restoreState()


def _escape(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _fmt_v(v):
    try:
        return f"{float(v):.3f}"
    except Exception:
        return str(v)


def _render_sparkline(points: list, label: str) -> Optional[bytes]:
    """Tiny in-process line chart with PIL - no matplotlib dep needed.
    Returns a PNG showing values over time, with min/max ticks. Each
    point comes from history_api._series() with keys date/avg/min/max -
    we plot the per-pass avg, which equals the value for a single
    segment (one row per pass)."""
    try:
        xs = [p.get("date") for p in points if p.get("avg") is not None]
        ys = [float(p["avg"]) for p in points if p.get("avg") is not None]
        if not ys:
            return None
        w, h = 1100, 380
        pad_l, pad_r, pad_t, pad_b = 60, 24, 24, 40
        img = Image.new("RGB", (w, h), (255, 255, 255))
        d = ImageDraw.Draw(img)
        # grid
        d.rectangle([pad_l, pad_t, w - pad_r, h - pad_b],
                    outline=(229, 231, 235), width=1)
        ymin, ymax = min(ys), max(ys)
        if ymin == ymax:
            ymin -= 0.5; ymax += 0.5
        n = len(ys)
        def _x(i):
            return pad_l + (i / max(n - 1, 1)) * (w - pad_l - pad_r)
        def _y(v):
            return pad_t + (1 - (v - ymin) / (ymax - ymin)) * (h - pad_t - pad_b)
        # horizontal mid-grid
        for frac in (0.25, 0.5, 0.75):
            y = pad_t + frac * (h - pad_t - pad_b)
            d.line([(pad_l, y), (w - pad_r, y)], fill=(237, 233, 254), width=1)
        # line
        pts = [(_x(i), _y(v)) for i, v in enumerate(ys)]
        d.line(pts, fill=(90, 24, 154), width=2)
        # dots
        for x, y in pts:
            d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(123, 44, 191))
        # axis labels
        d.text((pad_l - 50, pad_t - 4), f"{ymax:.3f}",
               fill=(60, 9, 108))
        d.text((pad_l - 50, h - pad_b - 6), f"{ymin:.3f}",
               fill=(60, 9, 108))
        d.text((pad_l, h - pad_b + 14),
               f"{xs[0]} → {xs[-1]} · {n} passes · {label}",
               fill=(107, 114, 128))
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()
    except Exception as e:
        logger.warning("sparkline render failed for %s: %s", label, e)
        return None


# ---------------------------------------------------------------------------
# Email delivery.

def _send_email_with_pdf(
    to_addr: str, subject: str, body_text: str, pdf_bytes: bytes,
    filename: str,
) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USERNAME")
    smtp_pw   = os.getenv("SMTP_PASSWORD")
    sender    = os.getenv("SMTP_FROM_EMAIL", smtp_user)
    use_tls   = os.getenv("SMTP_USE_TLS", "true").lower() != "false"
    if not smtp_host or not sender:
        raise RuntimeError("SMTP configuration is missing")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_addr
    msg.set_content(body_text)
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf",
                        filename=filename)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
        if use_tls:
            smtp.starttls()
        if smtp_user and smtp_pw:
            smtp.login(smtp_user, smtp_pw)
        smtp.send_message(msg)


# ---------------------------------------------------------------------------
# Job handler: glue that the jobs module invokes when a queued
# 'advanced_segment_report' job fires.

def _summarise_history(history: Dict[str, list]) -> str:
    """Compact text summary of the segment's metric history, fed to the
    LLM. One line per metric: 'NDTI mean=0.04, min=-0.02, max=0.18, n=12'."""
    lines: List[str] = []
    for m, points in history.items():
        vals = [float(p["avg"]) for p in points if p.get("avg") is not None]
        if not vals:
            lines.append(f"{m}: no observations in window")
            continue
        mean = sum(vals) / len(vals)
        lines.append(
            f"{m}: mean={mean:.3f}, min={min(vals):.3f}, max={max(vals):.3f}, "
            f"n={len(vals)}"
        )
    return "\n".join(lines)


def handle_advanced_segment_report(
    job_id: int, params: dict, email: str, username: Optional[str],
) -> None:
    import jobs  # late import: avoids any circular path
    from history_api import _series  # reuse the time-series query

    seg_id      = params["object_id"]
    sensor      = params.get("sensor", "S2").upper()
    metrics     = params.get("metrics") or ["POLLUTION", "NDTI", "NDCI",
                                            "NDVI", "BSI", "MNDWI"]
    date_from   = params.get("from") or (
        (date.today() - timedelta(days=180)).isoformat())
    date_to     = params.get("to") or date.today().isoformat()

    seg = get_segment(seg_id)
    if not seg:
        jobs.mark_failed(job_id, f"unknown segment {seg_id}")
        return

    # Phase 1: per-metric history from DB ------------------------------------
    # _series() uses both args.get(k) and args[k], so a plain dict (with
    # those keys present and non-None) is the simplest stand-in for the
    # Flask request.args that the function normally receives.
    jobs.set_progress(job_id, "loading metric history")
    history: Dict[str, list] = {}
    args = {"from": date_from, "to": date_to}
    for m in metrics:
        try:
            history[m] = _series("object_id", seg_id, m, sensor, args)
        except Exception as e:
            logger.warning("history fetch failed for %s/%s: %s", seg_id, m, e)
            history[m] = []

    # Phase 2: EE thumbnails -------------------------------------------------
    jobs.set_progress(job_id, "rendering Sentinel imagery")
    thumbs = render_segment_thumbnails(seg, sensor, date_from, date_to)

    # Phase 3: Ollama synthesis ---------------------------------------------
    jobs.set_progress(job_id, "asking the AI for a synthesis")
    summary = _summarise_history(history)
    ai_conclusion, ai_flags = _ollama_summarise(
        summary, thumbs,
        river_name=seg.get("river_name", "Unknown river"),
        segment_id=seg_id,
    )

    # Phase 4: PDF assembly --------------------------------------------------
    jobs.set_progress(job_id, "assembling the PDF")
    pdf = build_advanced_pdf(
        seg, sensor, metrics, date_from, date_to,
        history, thumbs, ai_conclusion, ai_flags,
    )

    # Phase 5: SMTP delivery -------------------------------------------------
    jobs.set_progress(job_id, "sending the email")
    body = (
        f"Hello,\n\n"
        f"Your AquaGraph advanced report for segment {seg_id} on "
        f"{seg.get('river_name', 'river')} is attached.\n\n"
        f"Window: {date_from} -> {date_to}\n"
        f"Metrics: {', '.join(metrics)}\n\n"
        f"This is the technical companion to the standard PDF report - it "
        f"includes per-segment Sentinel imagery and an AI-synthesised "
        f"conclusion. Open the attached PDF for the details.\n\n"
        f"- AquaGraph\n"
    )
    filename = (
        f"aquagraph_segment_{seg_id}_{date.today().isoformat()}.pdf"
    )
    _send_email_with_pdf(
        to_addr=email,
        subject=f"AquaGraph advanced report · segment {seg_id}",
        body_text=body,
        pdf_bytes=pdf,
        filename=filename,
    )

    jobs.mark_done(job_id, result_kb=len(pdf) // 1024)


# Register the handler on import so the jobs module can dispatch.
def _register():
    try:
        import jobs
        jobs.register_handler("advanced_segment_report",
                              handle_advanced_segment_report)
    except Exception as e:
        logger.warning("could not register advanced_segment_report handler: %s", e)


_register()
