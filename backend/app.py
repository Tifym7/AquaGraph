"""
AquaSat Flask Backend
Serves real Romanian river geometries from EU-Hydro data
with synthetic pollution values and a river connectivity graph.
"""

import hashlib
import json
import math
import datetime
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import urllib.request
import xml.etree.ElementTree as ET

from user.services.campaign_service import CampaignService
from user.model.campaign import Campaign
from auth import auth_bp
from user.persistence.campaign_db_repository import CampaignDBRepository


app = Flask(__name__)
app.register_blueprint(auth_bp)

_campaign_repo = CampaignDBRepository(
    url=os.getenv('DB_URL', 'postgresql://localhost:5432/aquagraph'),
    username=os.getenv('DB_USER', ''),
    password=os.getenv('DB_PASSWORD', ''),
)

_campaign_service = CampaignService(_campaign_repo)

CORS(app)

# ---------------------------------------------------------------------------
# Load pre-extracted data
# ---------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

with open(os.path.join(DATA_DIR, "rivers_romania.json")) as f:
    RAW_RIVERS = json.load(f)

with open(os.path.join(DATA_DIR, "river_graph.json")) as f:
    RIVER_GRAPH = json.load(f)


# ---------------------------------------------------------------------------
# Generate deterministic mock pollution per river (seeded by name hash)
# ---------------------------------------------------------------------------
def _mock_pollution(river):
    """Generate deterministic mock pollution data from river name + strahler."""
    seed = int(hashlib.md5(river["name"].encode()).hexdigest()[:8], 16)
    # Larger rivers (higher Strahler) tend to have moderate pollution;
    # smaller ones can be anything.
    base = (seed % 1000) / 1000.0
    strahler = river.get("strahler", 3)

    # Adjust: big rivers get moderated, small ones vary more
    if strahler >= 7:
        pollution = 0.15 + base * 0.35   # 0.15–0.50
    elif strahler >= 5:
        pollution = 0.10 + base * 0.55   # 0.10–0.65
    elif strahler >= 3:
        pollution = 0.05 + base * 0.75   # 0.05–0.80
    else:
        pollution = base * 0.95           # 0.00–0.95

    pollution = round(pollution, 2)

    # Label thresholds
    if pollution >= 0.7:
        label = "Critical"
    elif pollution >= 0.5:
        label = "High"
    elif pollution >= 0.3:
        label = "Moderate"
    else:
        label = "Low"

    # Deterministic pollutant breakdown from same seed
    s2 = seed
    nitrates    = round(3 + (s2 % 40) * pollution, 1)
    phosphates  = round(1 + ((s2 >> 4) % 15) * pollution, 1)
    heavy_metals = round(0.1 + ((s2 >> 8) % 8) * pollution, 1)
    suspended   = round(10 + ((s2 >> 12) % 150) * pollution, 0)

    return {
        "pollution_level": pollution,
        "pollution_label": label,
        "pollutants": {
            "nitrates": nitrates,
            "phosphates": phosphates,
            "heavy_metals": heavy_metals,
            "suspended_solids": suspended,
        },
        "last_updated": "2026-04-24T10:30:00Z",
    }


# Build enriched river list
RIVERS = []
RIVERS_BY_ID = {}

for r in RAW_RIVERS:
    # Calculate bounding box for the river
    lats = []
    lons = []
    for line in r.get("coordinates", []):
        for pt in line:
            lats.append(pt[0])
            lons.append(pt[1])
            
    min_lat = min(lats) if lats else 0
    max_lat = max(lats) if lats else 0
    min_lon = min(lons) if lons else 0
    max_lon = max(lons) if lons else 0

    enriched = {
        "id": r["id"],
        "name": r["name"],
        "strahler": r.get("strahler", 1),
        "length_m": r.get("length_m", 0),
        "segment_count": r.get("segment_count", 1),
        "coordinates": r["coordinates"],
        "bbox": {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lon": min_lon,
            "max_lon": max_lon
        }
    }
    enriched.update(_mock_pollution(r))
    RIVERS.append(enriched)
    RIVERS_BY_ID[r["id"]] = enriched


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _campaign_to_dict(c):
    return {
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


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

def boxes_intersect(b1, b2):
    """Check if two bounding boxes intersect."""
    return not (b1["max_lon"] < b2["min_lon"] or 
                b1["min_lon"] > b2["max_lon"] or 
                b1["max_lat"] < b2["min_lat"] or 
                b1["min_lat"] > b2["max_lat"])

@app.route("/api/rivers", methods=["GET"])
def get_rivers():
    """Return rivers list filtered by bbox and zoom."""
    zoom = request.args.get("zoom", 7, type=int)
    bbox_str = request.args.get("bbox", "") # Format: south,west,north,east
    
    # Dynamic Strahler Cutoff Based on Zoom
    if zoom < 8:
        min_strahler = 7
    elif zoom < 10:
        min_strahler = 5
    else:
        min_strahler = 3
        
    filtered = [r for r in RIVERS if r["strahler"] >= min_strahler]

    if bbox_str:
        try:
            s, w, n, e = map(float, bbox_str.split(","))
            view_bbox = {
                "min_lat": s,
                "max_lat": n,
                "min_lon": w,
                "max_lon": e
            }
            # Filter by intersection
            filtered = [r for r in filtered if boxes_intersect(r["bbox"], view_bbox)]
        except ValueError:
            pass # Ignore invalid bbox strings

    # Sort by pollution descending
    filtered.sort(key=lambda r: r["pollution_level"], reverse=True)

    return jsonify({"rivers": filtered, "total": len(filtered)})


@app.route("/api/rivers/<river_id>", methods=["GET"])
def get_river(river_id):
    """Return a single river by ID."""
    river = RIVERS_BY_ID.get(river_id)
    if river is None:
        return jsonify({"error": "River not found"}), 404
    return jsonify(river)


@app.route("/api/river-graph", methods=["GET"])
def get_river_graph():
    """Return the full river connectivity graph."""
    return jsonify(RIVER_GRAPH)


@app.route("/api/river/<river_id>/upstream", methods=["GET"])
def get_upstream(river_id):
    """Return all upstream contributors for a river (recursive)."""
    visited = set()
    result = []

    def _walk_up(rid):
        if rid in visited or rid not in RIVER_GRAPH:
            return
        visited.add(rid)
        node = RIVER_GRAPH[rid]
        for trib in node.get("tributaries", []):
            tid = trib["id"]
            river_data = RIVERS_BY_ID.get(tid)
            if river_data:
                result.append({
                    "id": tid,
                    "name": river_data["name"],
                    "strahler": river_data["strahler"],
                    "pollution_level": river_data["pollution_level"],
                    "pollution_label": river_data["pollution_label"],
                })
            _walk_up(tid)

    _walk_up(river_id)
    return jsonify({"river_id": river_id, "upstream": result})


@app.route("/api/river/<river_id>/downstream", methods=["GET"])
def get_downstream(river_id):
    """Return all downstream rivers (chain to the sea)."""
    result = []
    visited = set()
    current = river_id

    while current and current not in visited:
        visited.add(current)
        node = RIVER_GRAPH.get(current)
        if not node or not node.get("flows_into"):
            break
        downstream_id = node["flows_into"]["id"]
        river_data = RIVERS_BY_ID.get(downstream_id)
        if river_data:
            result.append({
                "id": downstream_id,
                "name": river_data["name"],
                "strahler": river_data["strahler"],
                "pollution_level": river_data["pollution_level"],
                "pollution_label": river_data["pollution_label"],
            })
        current = downstream_id

    return jsonify({"river_id": river_id, "downstream": result})

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

if __name__ == "__main__":
    print(f"Loaded {len(RIVERS)} rivers with graph data")
    app.run(debug=True, port=5000)
