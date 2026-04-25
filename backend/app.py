"""
AquaSat Flask Backend
Serves real Romanian river geometries from EU-Hydro data
with synthetic pollution values and a river connectivity graph.
"""

import hashlib
import json
import math
import os
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
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


if __name__ == "__main__":
    print(f"Loaded {len(RIVERS)} rivers with graph data")
    app.run(debug=True, port=5000)
