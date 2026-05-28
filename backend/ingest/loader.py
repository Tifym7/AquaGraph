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
from .sensors import get_sensor


def _window_fn():
    """Pick the transport: free synchronous chunks, or batch GCS export.
    Imported lazily so a `sync` run never needs google-cloud-storage and a
    `gcs` run still works if the sync deps changed."""
    from . import config as _cfg
    if _cfg.INGEST_TRANSPORT == "gcs":
        from .gcs_export import export_window
        return export_window
    from .fetch import fetch_window
    return fetch_window

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
    from . import config as _cfg
    total = 0
    try:
        windows = plan_windows(sensor, mode, frm, to)
        if _cfg.PROGRESS:
            print(f"  [{code}] transport={_cfg.INGEST_TRANSPORT} mode={mode} "
                  f"windows={len(windows)}", flush=True)
        if _cfg.INGEST_TRANSPORT == "gcs":
            total = _run_concurrent_gcs(code, sensor, windows, seg2river)
        else:
            total = _run_sequential(code, sensor, windows, seg2river)
        db.finish_run(run_id, "ok", total,
                      f"{len(windows)} window(s) {frm}->{to} mode={mode}")
        return {"sensor": code, "status": "ok", "segments": total,
                "windows": len(windows), "from": str(frm), "to": str(to)}
    except Exception as exc:  # record failure, then re-raise for the caller
        db.finish_run(run_id, "error", total, repr(exc))
        raise


def _commit(code: str, acquired_at: str, seg2river, rows) -> int:
    """Attach river_id and batch-upsert one window's rows. Returns count."""
    committed = 0
    batch: List[dict] = []
    for row in rows:
        row["river_id"] = seg2river.get(row["object_id"])
        batch.append(row)
        if len(batch) >= _UPSERT_BATCH:
            committed += db.upsert_observations(batch)
            batch = []
    if batch:
        committed += db.upsert_observations(batch)
    return committed


def _run_sequential(code, sensor, windows, seg2river) -> int:
    """Free synchronous transport: one window at a time (unchanged behaviour)."""
    from . import config as _cfg
    window_fn = _window_fn()
    total = 0
    for wi, (acquired_at, w_start, w_end) in enumerate(windows, 1):
        if _cfg.PROGRESS:
            print(f"  [{code}] window {wi}/{len(windows)} "
                  f"{acquired_at} ({w_start}->{w_end})", flush=True)
        n = _commit(code, acquired_at, seg2river,
                    window_fn(sensor, w_start, w_end, acquired_at))
        total += n
        if _cfg.PROGRESS:
            print(f"  [{code}] window {wi}/{len(windows)} {acquired_at} "
                  f"DONE: {n} rows committed", flush=True)
    return total


def _run_concurrent_gcs(code, sensor, windows, seg2river) -> int:
    """GCS batch transport: keep up to GCS_MAX_INFLIGHT export tasks running;
    download + upsert each as it COMPLETES; refill the pool. Failed/timed-out
    windows are skipped (idempotent - re-run later). Turns a per-pass
    multi-year backfill from days into hours."""
    import time as _t
    from . import config as _cfg
    from . import gcs_export as gx

    pending = list(windows)              # [(acquired_at, start, end), ...]
    inflight = []                        # [{task, prefix, acq, t0}, ...]
    total = ndone = nfail = 0
    nwin = len(windows)

    while pending or inflight:
        while pending and len(inflight) < _cfg.GCS_MAX_INFLIGHT:
            acq, ws, we = pending.pop(0)
            # --- recover stranded CSVs before submitting a new export ---
            # An earlier run's task may have finished server-side AFTER we
            # timed out client-side (or after a crash); its CSV will be
            # sitting in the bucket. Ingest that instead of paying EE again.
            obj_prefix, found = gx.existing_blobs(sensor, acq)
            if found:
                try:
                    n = _commit(code, acq, seg2river,
                                gx.drain_rows(sensor, obj_prefix, acq))
                    total += n
                    ndone += 1
                    print(f"  [{code}] {acq} RECOVERED from bucket "
                          f"({len(found)} blob) -> {n} rows  "
                          f"[{ndone + nfail}/{nwin}, {total} total]",
                          flush=True)
                except Exception as exc:
                    nfail += 1
                    print(f"  [{code}] {acq} recover FAILED: {exc!r} "
                          f"- skipped", flush=True)
                continue
            try:
                task, prefix = gx.build_task(sensor, ws, we, acq)
                gx.start_task(task, what=f"export.start[{code} {acq}]")
                inflight.append({"task": task, "prefix": prefix,
                                 "acq": acq, "t0": _t.time()})
            except Exception as exc:
                nfail += 1
                print(f"  [{code}] {acq} submit FAILED: {exc!r} "
                      f"- skipped (idempotent re-run)", flush=True)

        still = []
        for it in inflight:
            acq = it["acq"]
            try:
                state = gx.task_state(it["task"],
                                      what=f"export.status[{code} {acq}]")
            except Exception:
                still.append(it)
                continue
            el = int(_t.time() - it["t0"])
            if state == "COMPLETED":
                try:
                    n = _commit(code, acq, seg2river,
                                gx.drain_rows(sensor, it["prefix"], acq))
                    total += n
                    ndone += 1
                    print(f"  [{code}] {acq} COMPLETED ({el // 60}m"
                          f"{el % 60:02d}s) -> {n} rows  "
                          f"[{ndone + nfail}/{nwin}, {total} total]",
                          flush=True)
                except Exception as exc:
                    nfail += 1
                    print(f"  [{code}] {acq} download/upsert FAILED: "
                          f"{exc!r} - skipped", flush=True)
            elif state in ("FAILED", "CANCELLED", "CANCEL_REQUESTED"):
                nfail += 1
                print(f"  [{code}] {acq} export {state}: "
                      f"{gx.task_error(it['task'])} - skipped", flush=True)
            elif el > _cfg.EXPORT_TIMEOUT_SECONDS:
                nfail += 1
                print(f"  [{code}] {acq} export TIMEOUT >"
                      f"{_cfg.EXPORT_TIMEOUT_SECONDS}s - skipped", flush=True)
            else:
                still.append(it)
        inflight = still

        if inflight and not (pending and len(inflight) < _cfg.GCS_MAX_INFLIGHT):
            if _cfg.PROGRESS:
                print(f"  [{code}] progress {ndone + nfail}/{nwin} "
                      f"({nfail} failed) | inflight={len(inflight)} "
                      f"pending={len(pending)} | {total} rows", flush=True)
            _t.sleep(_cfg.EXPORT_POLL_SECONDS)

    print(f"  [{code}] gcs run done: {ndone} ok, {nfail} failed/skipped, "
          f"{total} rows", flush=True)
    return total
