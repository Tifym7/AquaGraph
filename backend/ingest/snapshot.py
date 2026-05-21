"""Project the time-series back onto the map.

The map renders from data/rivers_romania.json -> precompute_tiles.py (PNG
pyramid + segments_lod_*.json). This module refreshes that snapshot from the
*latest* observation per segment in satellite_observation, so the map colours
and tiles reflect ingested satellite data - with NO changes to metrics.py,
precompute_tiles.py, or the frontend:

  * S2 latest  -> seg["indices"] (NDVI/MNDWI/NDTI/NDCI/BSI/TURBIDITY)
                  + seg["risk"]  (risk_score/risk_level/water_risk/.../is_water)
  * S1 latest  -> seg["risk"]["land_risk"] = OIL_PROBABILITY (0..1), which is
                  exactly what the existing "Oil leackage" (land) metric reads,
                  so that layer becomes real Sentinel-1 oil with no render code.

Segments with no DB observation keep their existing snapshot values, so the
map still works before/while a backfill runs.

  python -m backend.ingest.cli snapshot            # rebuild JSON only
  python -m backend.ingest.cli snapshot --tiles    # also regenerate tiles
"""

import json
import os
import subprocess
import sys
from statistics import mean

from . import db

_DATA = os.path.join(os.path.dirname(__file__), "..", "data")
_RIVERS_JSON = os.path.join(_DATA, "rivers_romania.json")

# S2 spectral indices that live under seg["indices"].
_S2_INDEX_FIELDS = ["NDVI", "MNDWI", "NDTI", "NDCI", "BSI", "TURBIDITY"]
# S2 risk fields that live under seg["risk"].
_S2_RISK_FIELDS = ["risk_score", "risk_level", "water_risk", "land_risk",
                   "is_water"]


def _latest_per_segment() -> dict:
    """{object_id: {'S2': (metrics, risk), 'S1': (metrics, risk)}} - newest
    acquisition per (object_id, sensor)."""
    out: dict = {}
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT ON (object_id, sensor) "
            "       object_id, sensor, metrics, risk "
            "FROM satellite_observation "
            "ORDER BY object_id, sensor, acquired_at DESC"
        )
        for object_id, sensor, metrics, risk in cur.fetchall():
            out.setdefault(object_id, {})[sensor] = (metrics or {}, risk or {})
    return out


def _apply(seg: dict, latest: dict) -> bool:
    """Merge the latest DB values into one segment. Returns True if changed."""
    by_sensor = latest.get(str(seg.get("object_id")))
    if not by_sensor:
        return False
    changed = False

    s2 = by_sensor.get("S2")
    if s2:
        m, r = s2
        idx = {k: float(m[k]) for k in _S2_INDEX_FIELDS if k in m}
        if idx:
            seg["indices"] = idx
            changed = True
        rk = {k: r[k] for k in _S2_RISK_FIELDS if k in r}
        if rk:
            seg["risk"] = {**seg.get("risk", {}), **rk}
            changed = True

    s1 = by_sensor.get("S1")
    if s1:
        m, _ = s1
        oil = m.get("OIL_PROBABILITY")
        if oil is not None:
            # Drive the existing "Oil leackage" (land) map layer with real S1.
            seg.setdefault("risk", {})["land_risk"] = float(oil)
            changed = True

    return changed


def _refresh_river_aggregates(river: dict) -> None:
    """Keep avg_indices/avg_risk consistent with refreshed segments (used by
    the sidebar / top-rivers ranking)."""
    segs = river.get("segments", [])
    if not segs:
        return
    for field, bucket in (("avg_indices", "indices"), ("avg_risk", "risk")):
        agg = {}
        keys = set()
        for s in segs:
            keys.update(s.get(bucket, {}).keys())
        for k in keys:
            vals = [s[bucket][k] for s in segs
                    if isinstance(s.get(bucket, {}).get(k), (int, float))]
            if vals:
                agg[k] = round(mean(vals), 4)
        if agg:
            river[field] = agg


def rebuild_snapshot(regen_tiles: bool = False) -> dict:
    if not os.path.exists(_RIVERS_JSON):
        raise FileNotFoundError(_RIVERS_JSON)

    latest = _latest_per_segment()
    with open(_RIVERS_JSON) as fh:
        rivers = json.load(fh)

    touched = 0
    for river in rivers:
        river_changed = False
        for seg in river.get("segments", []):
            if _apply(seg, latest):
                touched += 1
                river_changed = True
        if river_changed:
            _refresh_river_aggregates(river)

    # Atomic replace, keep one .bak.
    tmp = _RIVERS_JSON + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(rivers, fh)
    if os.path.exists(_RIVERS_JSON):
        os.replace(_RIVERS_JSON, _RIVERS_JSON + ".bak")
    os.replace(tmp, _RIVERS_JSON)

    result = {
        "segments_observed": len(latest),
        "segments_updated": touched,
        "rivers": len(rivers),
        "snapshot": _RIVERS_JSON,
        "tiles_regenerated": False,
    }

    if regen_tiles:
        # Isolate the heavy tile build in a subprocess (memory + reuses the
        # existing precompute_tiles.py entrypoint unchanged).
        backend_dir = os.path.dirname(os.path.dirname(__file__))
        subprocess.run([sys.executable, "precompute_tiles.py"],
                        cwd=backend_dir, check=True)
        result["tiles_regenerated"] = True

    return result
