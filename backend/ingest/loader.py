"""Window orchestration: fetch -> attach river_id -> upsert -> audit.

`ingest()` is the single entry point used by the CLI and the scheduler.

Modes:
  * pass      -- one window per real satellite acquisition date (forward sync)
  * composite -- one window per calendar month (median composite); used for
                 historical backfill and clean evolution graphs despite clouds.
"""

import json
import os
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from . import db
from .fetch import fetch_window
from .sensors import get_sensor

_DATA = os.path.join(os.path.dirname(__file__), "..", "data")
_RIVERS_JSON = os.path.join(_DATA, "rivers_romania.json")

_UPSERT_BATCH = 5000


# --- object_id -> river_id (from the snapshot the app already serves) ---
_seg2river: Optional[Dict[str, str]] = None


def _segment_river_map() -> Dict[str, str]:
    global _seg2river
    if _seg2river is not None:
        return _seg2river
    mapping: Dict[str, str] = {}
    if os.path.exists(_RIVERS_JSON):
        with open(_RIVERS_JSON) as fh:
            for river in json.load(fh):
                rid = river.get("id")
                for seg in river.get("segments", []):
                    oid = seg.get("object_id")
                    if oid is not None and rid:
                        mapping[str(oid)] = rid
    _seg2river = mapping
    return mapping


# --- window planning ---
def _month_iter(frm: date, to: date) -> List[Tuple[str, str, str]]:
    """[(acquired_label, start, end_exclusive), ...] one per month in [frm,to]."""
    out: List[Tuple[str, str, str]] = []
    y, m = frm.year, frm.month
    while date(y, m, 1) <= to:
        start = date(y, m, 1)
        end = date(y + (m == 12), (m % 12) + 1, 1)
        out.append((start.isoformat(), start.isoformat(), end.isoformat()))
        y, m = end.year, end.month
    return out


def plan_windows(sensor, mode: str, frm: date, to: date) -> List[Tuple[str, str, str]]:
    if mode == "composite":
        return _month_iter(frm, to)
    if mode == "pass":
        dates = sensor.discover_dates(frm.isoformat(),
                                      (to + timedelta(days=1)).isoformat())
        return [
            (d, d, (datetime.strptime(d, "%Y-%m-%d").date()
                    + timedelta(days=1)).isoformat())
            for d in dates
        ]
    raise ValueError(f"unknown mode {mode!r} (expected pass|composite)")


def ingest(sensor_code: str, mode: str = "pass",
           since: Optional[str] = None, until: Optional[str] = None) -> dict:
    """Run ingestion for one sensor over a date range.

    Defaults: since = day after the stored watermark (or 60 days back if empty),
    until = today.
    """
    sensor = get_sensor(sensor_code)
    code = sensor.SENSOR

    today = date.today()
    to = datetime.strptime(until, "%Y-%m-%d").date() if until else today
    if since:
        frm = datetime.strptime(since, "%Y-%m-%d").date()
    else:
        wm = db.last_acquired(code)
        frm = (wm + timedelta(days=1)) if wm else (today - timedelta(days=60))

    if frm > to:
        return {"sensor": code, "status": "skip",
                "message": f"nothing new (watermark>={frm})", "segments": 0}

    run_id = db.start_run(code, mode, frm, to)
    seg2river = _segment_river_map()
    total = 0
    try:
        windows = plan_windows(sensor, mode, frm, to)
        from . import config as _cfg
        for wi, (acquired_at, w_start, w_end) in enumerate(windows, 1):
            if _cfg.PROGRESS:
                print(f"  [{code}] window {wi}/{len(windows)} "
                      f"{acquired_at} ({w_start}->{w_end})", flush=True)
            w_committed = 0
            batch: List[dict] = []
            for row in fetch_window(sensor, w_start, w_end, acquired_at):
                row["river_id"] = seg2river.get(row["object_id"])
                batch.append(row)
                if len(batch) >= _UPSERT_BATCH:
                    n = db.upsert_observations(batch)
                    total += n
                    w_committed += n
                    if _cfg.PROGRESS:
                        print(f"  [{code}] {acquired_at}: committed "
                              f"{w_committed} rows to DB so far", flush=True)
                    batch = []
            if batch:
                n = db.upsert_observations(batch)
                total += n
                w_committed += n
            if _cfg.PROGRESS:
                print(f"  [{code}] window {wi}/{len(windows)} {acquired_at} "
                      f"DONE: {w_committed} rows committed", flush=True)
        db.finish_run(run_id, "ok", total,
                      f"{len(windows)} window(s) {frm}->{to} mode={mode}")
        return {"sensor": code, "status": "ok", "segments": total,
                "windows": len(windows), "from": str(frm), "to": str(to)}
    except Exception as exc:  # record failure, then re-raise for the caller
        db.finish_run(run_id, "error", total, repr(exc))
        raise
