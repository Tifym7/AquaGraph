"""
AquaGraph Flask Backend
Serves Romanian river data with satellite-derived segment-level pollution data
and a river connectivity graph.

All metric values are attached per-segment (not averaged per river), so you can
see which parts of a river are polluted while the rest remains green.

Visual rendering for the map is now served as **precomputed raster tiles**
(see precompute_tiles.py). This file's `/api/tiles/...` route serves the
generated PNGs as static assets, and `/api/segments?lod=N` serves the matching
lightweight click-overlay JSONs.
"""

import json
import math
import datetime
import os
from flask import Flask, jsonify, request, send_file, send_from_directory, Response, abort
from flask_cors import CORS
import urllib.request
import xml.etree.ElementTree as ET

from user.services.campaign_service import CampaignService
from user.model.campaign import Campaign
from auth import auth_bp
from history_api import history_bp
from user.persistence.campaign_db_repository import CampaignDBRepository


from metrics import (
    METRIC_LABELS,
    avg_normalized,
    color_rgb_string,
    color_for_segment,
    get_raw_value,
    normalize,
)

app = Flask(__name__)
app.register_blueprint(auth_bp)
app.register_blueprint(history_bp)

_campaign_repo = CampaignDBRepository(
    url=os.getenv('DB_URL', 'postgresql://localhost:5432/aquagraph'),
    username=os.getenv('DB_USER', 'postgres'),
    password=os.getenv('DB_PASSWORD', 'mysecretpassword'),
)

_campaign_service = CampaignService(_campaign_repo)

CORS(app)

# ===== Paths =====
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
TILES_DIR = os.path.join(DATA_DIR, "tiles")

# Built React app (produced by `vite build` → frontend/dist). In production
# Flask serves it directly so the whole app is one origin / one port.
FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)

# Startup loads several large JSON datasets synchronously. Without progress
# output the gunicorn worker looks frozen for minutes during boot, so log
# each step (flushed - gunicorn captures stdout as a pipe).
import time as _time
_t0 = _time.time()
def _step(msg):
    print(f"[startup +{_time.time() - _t0:5.1f}s] {msg}", flush=True)

_step("loading rivers_romania.json ...")
with open(os.path.join(DATA_DIR, "rivers_romania.json")) as f:
    RAW_RIVERS = json.load(f)
_step(f"  rivers_romania.json loaded ({len(RAW_RIVERS)} rivers)")

_step("loading river_graph.json ...")
with open(os.path.join(DATA_DIR, "river_graph.json")) as f:
    RIVER_GRAPH = json.load(f)
_step("  river_graph.json loaded")

POLY_MATCH_PATH = os.path.join(DATA_DIR, "euhydro_poly_match.json")
POLY_MATCH = {}
if os.path.exists(POLY_MATCH_PATH):
    with open(POLY_MATCH_PATH) as f:
        POLY_MATCH = json.load(f)
    print(f"Loaded EU-Hydro poly match for {len(POLY_MATCH)} rivers")

WATER_POLYS_BY_ID = {}
WATER_POLY_BBOXES = {}
WATER_POLYS_PATH = os.path.join(DATA_DIR, "euhydro_water_polygons.json")
if os.path.exists(WATER_POLYS_PATH):
    _step("loading euhydro_water_polygons.json (large) ...")
    with open(WATER_POLYS_PATH) as f:
        for p in json.load(f):
            pid = p["poly_id"]
            WATER_POLYS_BY_ID[pid] = p
            lats, lons = [], []
            for ring in p["coordinates"]:
                for pt in ring:
                    lats.append(pt[0]); lons.append(pt[1])
            if lats:
                WATER_POLY_BBOXES[pid] = {
                    "min_lat": min(lats), "max_lat": max(lats),
                    "min_lon": min(lons), "max_lon": max(lons),
                }
    _step(f"  water polygons loaded ({len(WATER_POLYS_BY_ID)})")

# Inverse of POLY_MATCH so the polygon endpoint can route a polygon click
# back to the river (and its metric value) it belongs to.
POLYGON_TO_RIVER = {}
for _rid, _m in POLY_MATCH.items():
    for _pid in _m.get("polygon_ids", []) or []:
        POLYGON_TO_RIVER.setdefault(_pid, _rid)

# EFAS-derived discharge (m³/s) per river - used as a metric and later for
# downstream pollution-impact propagation.
DISCHARGE_BY_RIVER = {}
DISCHARGE_PATH = os.path.join(DATA_DIR, "efas_discharge_mapped.json")
if os.path.exists(DISCHARGE_PATH):
    with open(DISCHARGE_PATH) as f:
        for rid, entry in json.load(f).items():
            DISCHARGE_BY_RIVER[rid] = entry.get("discharge", {})
    print(f"Loaded EFAS discharge for {len(DISCHARGE_BY_RIVER)} rivers")

# Build rivers index used by detail endpoints + graph traversal.
# Each segment gets the river's discharge attached so the unified metric
# pipeline (metrics.get_raw_value) can read it like any other field.
_step("building RIVERS_BY_ID index ...")
RIVERS_BY_ID = {}
for r in RAW_RIVERS:
    rid = r["id"]
    lats, lons = [], []
    river_discharge = DISCHARGE_BY_RIVER.get(rid)
    segments_with_discharge = []
    for seg in r.get("segments", []):
        if river_discharge:
            seg = {**seg, "discharge": river_discharge}
        segments_with_discharge.append(seg)
        for line in seg.get("coordinates", []):
            for pt in line:
                lats.append(pt[0]); lons.append(pt[1])
    RIVERS_BY_ID[rid] = {
        "id": rid, "name": r["name"],
        "strahler": r.get("strahler", 1),
        "length_m": r.get("length_m", 0),
        "segments": segments_with_discharge,
        "bbox": {"min_lat": min(lats) if lats else 0, "max_lat": max(lats) if lats else 0,
                 "min_lon": min(lons) if lons else 0, "max_lon": max(lons) if lons else 0},
    }

_step(f"RIVERS_BY_ID built ({len(RIVERS_BY_ID)} rivers) - startup data ready")

# Expose the river lookup to the history/report blueprint (river names in PDFs
# and history responses) without creating an import cycle.
app.config["RIVERS_BY_ID"] = RIVERS_BY_ID

# ===== API Endpoints =====
def boxes_intersect(b1, b2):
    return not (b1["max_lon"] < b2["min_lon"] or b1["min_lon"] > b2["max_lon"] or
                b1["max_lat"] < b2["min_lat"] or b1["min_lat"] > b2["max_lat"])

def simplify_geom(coords_list, stride):
    if stride <= 1: return coords_list
    res = []
    for seg in coords_list:
        if len(seg) <= 2:
            res.append(seg); continue
        s = seg[::stride]
        if s[-1] != seg[-1]: s.append(seg[-1])
        res.append(s)
    return res

@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    return jsonify({
        "metrics": {
            "pollution":  "Pollution Risk (composite)",
            "risk":       "Risk Score (satellite)",
            "NDVI":       "NDVI (vegetation density)",
            "MNDWI":      "MNDWI (water presence)",
            "NDCI":       "NDCI (chlorophyll/a)",
            "BSI":        "BSI (bare soil)",
            "TURBIDITY":  "Turbidity (sediment)",
            "water":      "Water Index",
            "land":       "Land Index",
        },
        "default": "pollution",
    })


# ----- New tile + LOD-segment endpoints -----
@app.route("/api/tiles/<metric>/<int:z>/<int:x>/<int:y>.png")
def serve_tile(metric, z, x, y):
    """Serve a precomputed raster tile (see precompute_tiles.py)."""
    rel = os.path.join(metric, str(z), str(x), f"{y}.png")
    full = os.path.join(TILES_DIR, rel)
    if not os.path.exists(full):
        # Empty/no-data tile - Leaflet treats this as a missing tile.
        resp = Response(status=204)
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp
    resp = send_from_directory(TILES_DIR, rel, mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=259200, immutable"
    return resp


@app.route("/api/segments", methods=["GET"])
def serve_segments():
    """Serve the precomputed click-overlay JSON for a given LOD tier."""
    try:
        lod = int(request.args.get("lod", 3))
    except ValueError:
        lod = 3
    lod = max(1, min(5, lod))
    path = os.path.join(DATA_DIR, f"segments_lod_{lod}.json")
    if not os.path.exists(path):
        return jsonify({"error": f"segments_lod_{lod}.json not found - run precompute_tiles.py"}), 503
    resp = send_file(path, mimetype="application/json")
    resp.headers["Cache-Control"] = "public, max-age=259200, immutable"
    return resp


@app.route("/api/polygons", methods=["GET"])
def get_polygons_in_bbox():
    """Return the detailed water-body polygons whose bbox intersects the
    requested viewport. Each polygon carries the river it belongs to and
    that river's average normalized metric value, so the frontend can both
    route clicks back to the river and color the polygon by metric."""
    bbox_str = request.args.get("bbox", "")
    metric = request.args.get("metric", "pollution")
    if not bbox_str:
        return jsonify({"polygons": [], "total": 0})
    try:
        s, w, n, e = map(float, bbox_str.split(","))
    except ValueError:
        return jsonify({"polygons": [], "total": 0})
    vb = {"min_lat": s, "max_lat": n, "min_lon": w, "max_lon": e}
    out = []
    for pid, bbox in WATER_POLY_BBOXES.items():
        if not boxes_intersect(bbox, vb):
            continue
        p = WATER_POLYS_BY_ID.get(pid)
        if not p:
            continue
        rid = POLYGON_TO_RIVER.get(pid)
        normalized = None
        river_name = ""
        if rid:
            river = RIVERS_BY_ID.get(rid)
            if river:
                normalized = avg_normalized(river["segments"], metric)
                river_name = river.get("name", "")
        out.append({
            "poly_id": pid,
            "name": p.get("name", "") or river_name,
            "coordinates": p["coordinates"],
            "bbox": bbox,
            "river_id": rid,
            "river_name": river_name,
            "normalized": normalized,
        })
    return jsonify({"polygons": out, "total": len(out), "metric": metric})


# ----- Legacy multi-river endpoint (kept for compatibility / fallback) -----
@app.route("/api/rivers", methods=["GET"])
def get_rivers():
    """DEPRECATED for visual rendering - frontend now uses /api/tiles/* +
    /api/segments. Still useful for the sidebar list (top-N rivers) and as
    a graceful fallback if precomputation hasn't been run yet."""
    zoom = request.args.get("zoom", 7, type=int)
    bbox_str = request.args.get("bbox", "")
    metric = request.args.get("metric", "pollution")

    if zoom < 6:
        min_strahler, stride, min_length = 5, 12, 5000; show_poly = False
    elif zoom < 8:
        min_strahler, stride, min_length = 4, 8, 2000; show_poly = False
    elif zoom < 10:
        min_strahler, stride, min_length = 3, 4, 500; show_poly = False
    elif zoom < 12:
        min_strahler, stride, min_length = 2, 2, 100; show_poly = True
    elif zoom < 14:
        min_strahler, stride, min_length = 1, 1, 0; show_poly = True
    else:
        min_strahler, stride, min_length = 1, 1, 0; show_poly = True

    filtered = [r for r in RIVERS_BY_ID.values()
                if r.get("strahler", 1) >= min_strahler
                and r.get("length_m", 0) >= min_length]

    if bbox_str:
        try:
            s, w, n, e = map(float, bbox_str.split(","))
            vb = {"min_lat":s,"max_lat":n,"min_lon":w,"max_lon":e}
            filtered = [r for r in filtered if boxes_intersect(r["bbox"], vb)]
        except ValueError:
            pass

    filtered.sort(key=lambda r: avg_normalized(r["segments"], metric), reverse=True)

    final = []
    seen_ids = set()
    for river in filtered:
        rid = river["id"]
        if rid in seen_ids:
            continue
        seen_ids.add(rid)
        segs_out = []
        for seg in river["segments"]:
            raw = get_raw_value(seg, metric)
            norm = normalize(raw, metric)
            color = color_rgb_string(color_for_segment(seg, metric))
            segs_out.append({
                "object_id": seg.get("object_id"),
                "coordinates": simplify_geom(seg.get("coordinates",[]), stride),
                "indices": seg.get("indices", {}),
                "risk": seg.get("risk", {}),
                "raw_value": raw,
                "normalized": norm,
                "color": color,
            })

        match = POLY_MATCH.get(rid, {})
        wpolys = []
        if match.get("polygon_ids") and show_poly:
            for pid in match["polygon_ids"]:
                pd = WATER_POLYS_BY_ID.get(pid)
                if pd:
                    wpolys.append(simplify_geom(pd["coordinates"], stride))

        final.append({
            "id": river["id"], "name": river["name"],
            "strahler": river.get("strahler", 1),
            "length_m": river.get("length_m", 0),
            "segment_count": len(river["segments"]),
            "segments": segs_out,
            "water_polygons": wpolys,
            "bbox": river["bbox"],
            "avg_normalized": avg_normalized(river["segments"], metric),
        })

    return jsonify({
        "rivers": final, "total": len(final),
        "metric": metric,
        "metric_label": METRIC_LABELS.get(metric, metric),
    })


@app.route("/api/top-rivers", methods=["GET"])
def get_top_rivers():
    """Lightweight ranked list for the sidebar's "Top N" view - returns
    river metadata + the metric average only (no segments, no polygons),
    so it's cheap to fetch and recompute on every metric change."""
    metric = request.args.get("metric", "pollution")
    limit = max(1, min(100, request.args.get("limit", 10, type=int)))

    ranked = []
    for river in RIVERS_BY_ID.values():
        name = river.get("name") or ""
        if name.startswith("Tributary") or name.startswith("Unnamed"):
            continue
        avg = avg_normalized(river["segments"], metric)
        ranked.append({
            "id": river["id"],
            "name": name,
            "strahler": river.get("strahler", 1),
            "length_m": river.get("length_m", 0),
            "segment_count": len(river["segments"]),
            "avg_normalized": avg,
            "bbox": river["bbox"],
        })

    ranked.sort(key=lambda r: r["avg_normalized"], reverse=True)
    return jsonify({
        "rivers": ranked[:limit],
        "metric": metric,
        "metric_label": METRIC_LABELS.get(metric, metric),
    })


@app.route("/api/rivers/<river_id>", methods=["GET"])
def get_river(river_id):
    """Full detail for a single river - always includes water polygons at
    full fidelity (this powers the focused detail view after a click)."""
    river = RIVERS_BY_ID.get(river_id)
    if not river:
        return jsonify({"error": "River not found"}), 404

    metric = request.args.get("metric", "pollution")
    segs_out = []
    for seg in river["segments"]:
        raw = get_raw_value(seg, metric)
        norm = normalize(raw, metric)
        color = color_rgb_string(color_for_segment(seg, metric))
        segs_out.append({
            "object_id": seg.get("object_id"),
            "coordinates": seg.get("coordinates", []),
            "indices": seg.get("indices", {}),
            "risk": seg.get("risk", {}),
            "raw_value": raw,
            "normalized": norm,
            "color": color,
        })

    # Detailed water polygons - bug fix: previously omitted from this endpoint.
    match = POLY_MATCH.get(river_id, {})
    wpolys = []
    for pid in match.get("polygon_ids", []) or []:
        pd = WATER_POLYS_BY_ID.get(pid)
        if pd:
            wpolys.append(pd["coordinates"])

    return jsonify({
        "id": river["id"], "name": river["name"],
        "strahler": river.get("strahler", 1),
        "length_m": river.get("length_m", 0),
        "segments": segs_out,
        "water_polygons": wpolys,
        "bbox": river["bbox"],
        "avg_normalized": avg_normalized(river["segments"], metric),
    })

@app.route("/api/river-graph", methods=["GET"])
def get_river_graph():
    return jsonify(RIVER_GRAPH)

@app.route("/api/river/<river_id>/upstream", methods=["GET"])
def get_upstream(river_id):
    """Recursively collect upstream tributaries. Tracks an `appended` set so
    a river that is a tributary of multiple ancestors in the same subtree
    only shows up once (frontend keys break otherwise)."""
    metric = request.args.get("metric", "pollution")
    visited = set()
    # Seed with the origin so a graph cycle (river_graph.json has them, e.g.
    # river_361 MURES ⇄ river_3212) can never list the river inside its own
    # upstream - a river is never its own tributary in real hydrology.
    appended = {river_id}
    result = []
    def _walk(rid):
        if rid in visited or rid not in RIVER_GRAPH: return
        visited.add(rid)
        for t in RIVER_GRAPH[rid].get("tributaries", []):
            tid = t["id"]
            rd = RIVERS_BY_ID.get(tid)
            if rd and tid not in appended:
                appended.add(tid)
                mn = avg_normalized(rd["segments"], metric)
                result.append({"id":tid,"name":rd["name"],"strahler":rd.get("strahler",1),
                               "pollution_level":mn,"pollution_label":_label_from(mn),
                               "avg_normalized":mn})
            _walk(tid)
    _walk(river_id)
    return jsonify({"river_id":river_id,"upstream":result})

@app.route("/api/river/<river_id>/downstream", methods=["GET"])
def get_downstream(river_id):
    """Walk the flows_into chain, deduping any river that re-appears (graph
    cycles in the data shouldn't exist but do, and a duplicate id breaks
    React keys in the sidebar)."""
    metric = request.args.get("metric", "pollution")
    result = []
    visited = set()
    appended = set()
    cur = river_id
    while cur and cur not in visited:
        visited.add(cur)
        node = RIVER_GRAPH.get(cur)
        if not node or not node.get("flows_into"):
            break
        did = node["flows_into"]["id"]
        # Cycle back to the origin (e.g. MURES → Tributary → MURES): the
        # chain just loops, so there is no genuine further downstream river.
        if did == river_id:
            break
        rd = RIVERS_BY_ID.get(did)
        if rd and did not in appended:
            appended.add(did)
            mn = avg_normalized(rd["segments"], metric)
            result.append({"id":did,"name":rd["name"],"strahler":rd.get("strahler",1),
                           "pollution_level":mn,"pollution_label":_label_from(mn),
                           "avg_normalized":mn})
        cur = did
    return jsonify({"river_id":river_id,"downstream":result})

def _label_from(level):
    if level >= 0.7: return "Critical"
    if level >= 0.5: return "High"
    if level >= 0.3: return "Moderate"
    return "Low"

@app.route('/api/news')
def get_news():
    import re
    import urllib.parse
    print(">>> /api/news called")

    QUERIES = [
        'poluarea apei Romania',
        'calitatea apei Romania rau',
        'poluare rau Romania 2025',
    ]

    FALLBACK = [
        {
            'title': 'Poluarea apei în România: situația râurilor monitorizate în 2025',
            'url': 'https://www.digi24.ro/stiri/externe/mediu',
            'source': 'Digi24',
            'summary': 'Autoritățile române monitorizează calitatea apei în principalele râuri, cu accent pe zonele industriale din Prahova, Mureș și Olt.'
        },
        {
            'title': 'Dunărea transportă anual mii de tone de plastic spre Marea Neagră',
            'url': 'https://www.agerpres.ro',
            'source': 'Agerpres',
            'summary': 'Studiile recente arată că Dunărea este unul dintre cele mai poluate fluvii din Europa de Est, cu efecte directe asupra litoralului românesc.'
        },
        {
            'title': 'Râul Argeș: depășiri ale limitelor de nitriți din cauza agriculturii',
            'url': 'https://www.digi24.ro',
            'source': 'Digi24',
            'summary': 'Monitorizările din 2025 indică depășiri ale limitelor admise de nitriți în bazinul Argeș, afectând apa potabilă din județele limitrofe.'
        },
        {
            'title': 'Fabrici amendate pentru deversări ilegale în râul Mureș',
            'url': 'https://www.agerpres.ro',
            'source': 'Agerpres',
            'summary': 'Mai multe fabrici din județul Mureș au fost amendate pentru deversări ilegale de substanțe chimice, periclitând ecosistemul local.'
        },
        {
            'title': 'Microplasticele afectează fauna marină de pe litoralul românesc',
            'url': 'https://www.digi24.ro',
            'source': 'Digi24',
            'summary': 'Cercetătorii de la Institutul "Grigore Antipa" au descoperit concentrații alarmante de microplastice în apele Mării Negre la litoralul românesc.'
        },
        {
            'title': 'Fonduri europene de 120 mil. euro pentru râurile poluate din România',
            'url': 'https://www.agerpres.ro',
            'source': 'Agerpres',
            'summary': 'România va beneficia de fonduri europene pentru reabilitarea bazinelor hidrografice afectate de poluare industrială și agricolă.'
        },
    ]

    try:
        articles = []
        for query in QUERIES:
            if len(articles) >= 6:
                break
            encoded = urllib.parse.quote(query)
            rss_url = f'https://news.google.com/rss/search?q={encoded}&hl=ro&gl=RO&ceid=RO:ro'
            try:
                req = urllib.request.Request(
                    rss_url,
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    content = resp.read()

                root = ET.fromstring(content)
                items = root.findall('.//item')[:2]

                for item in items:
                    title = item.findtext('title') or ''
                    link  = item.findtext('link') or ''
                    desc  = item.findtext('description') or ''
                    source_el = item.find('source')
                    source = source_el.text if source_el is not None else 'Google News'
                    desc_clean = re.sub('<[^>]+>', '', desc).strip()
                    desc_clean = desc_clean.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace(
                        '&gt;', '>').replace('&quot;', '"')
                    desc_clean = ' '.join(desc_clean.split())
                    desc_clean = desc_clean[:220] + '...'
                    articles.append({
                        'title': title,
                        'url': link,
                        'source': source,
                        'summary': desc_clean,
                    })
            except Exception as feed_err:
                print(f"Query '{query}' failed: {feed_err}")
                continue

        if articles:
            return jsonify({'articles': articles[:6]})
        return jsonify({'articles': FALLBACK})

    except Exception as e:
        print(f"News fetch failed: {e}")
        return jsonify({'articles': FALLBACK})

@app.route('/api/campaigns', methods=['GET'])
def get_campaigns():
    try:
        campaigns = _campaign_repo.get_all_campaigns()
        return jsonify({
            'campaigns': [
                {
                    'id': c.get_campaign_id(),
                    'campaign_name': c.get_campaign_name(),
                    'organization_name': c.get_organization_name(),
                    'river_name': c.get_river_name(),
                    'coordinates': c.get_coordinates(),
                    'start_date': str(c.get_start_date()),
                    'end_date': str(c.get_end_date()),
                    'likes': c.get_likes(),
                    'participants': c.get_participants(),
                }
                for c in campaigns
            ]
        })
    except Exception as e:
        print(f"Error fetching campaigns: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/campaigns/<int:campaign_id>/participate', methods=['POST'])
def participate_campaign(campaign_id):
    try:
        data = request.get_json()
        email = data.get('email')
        if not email:
            return jsonify({'error': 'Email lipsă'}), 400
        campaign = _campaign_repo.get_campaign_by_id(campaign_id)
        if not campaign:
            return jsonify({'error': 'Campanie negăsită'}), 404
        _campaign_repo.add_participant(campaign_id, email)
        return jsonify({'message': 'Înscris cu succes'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/campaigns/<int:campaign_id>/like', methods=['POST'])
def like_campaign(campaign_id):
    try:
        campaign = _campaign_repo.get_campaign_by_id(campaign_id)
        if not campaign:
            return jsonify({'error': 'Campanie negăsită'}), 404
        campaign.set_likes(campaign.get_likes() + 1)
        _campaign_repo.update_campaign(campaign)
        return jsonify({'likes': campaign.get_likes()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/campaigns/<int:campaign_id>/unlike', methods=['POST'])
def unlike_campaign(campaign_id):
    try:
        campaign = _campaign_repo.get_campaign_by_id(campaign_id)
        if not campaign:
            return jsonify({'error': 'Campanie negăsită'}), 404
        campaign.set_likes(max(0, campaign.get_likes() - 1))
        _campaign_repo.update_campaign(campaign)
        return jsonify({'likes': campaign.get_likes()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/campaigns', methods=['POST'])
def create_campaign():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'JSON body lipsa'}), 400

        required = ['campaignName', 'organizationName', 'riverName', 'startDate', 'endDate']
        for field in required:
            if not data.get(field):
                return jsonify({'error': f'Câmpul {field} este obligatoriu'}), 400

        if data['endDate'] < data['startDate']:
            return jsonify({'error': 'endDate nu poate fi înainte de startDate'}), 400

        coords = data.get('coordinates', {})
        lat = coords.get('lat', '')
        lng = coords.get('lng', '')
        coordinates_str = f"{lat},{lng}" if lat and lng else "0,0"

        campaign = Campaign(
            campaign_id=None,
            campaign_name=data['campaignName'],
            organization_name=data['organizationName'],
            river_name=data['riverName'],
            coordinates=coordinates_str,
            start_date=data['startDate'],
            end_date=data['endDate'],
            likes=0,
            participants=[],
        )

        saved = _campaign_service.create_campaign(campaign)
        return jsonify(_campaign_to_dict(saved)), 201


    except Exception as e:
        print(f"Error creating campaign: {e}")
        return jsonify({'error': str(e)}), 500

# ===== Frontend (SPA) =====
# Anything not matched by an /api/* route above is served from the built
# frontend. Real files (JS/CSS/assets) are returned as-is; every other path
# falls back to index.html so client-side routing works on deep links.
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        abort(404)
    candidate = os.path.join(FRONTEND_DIST, path)
    if path and os.path.isfile(candidate):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


if __name__ == "__main__":
    print(f"Loaded {len(RIVERS_BY_ID)} rivers with graph data")
    app.run(debug=True, port=5000)
