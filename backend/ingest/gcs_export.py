"""Fast transport: GEE batch Export.table.toCloudStorage → download → rows.

Alternative to fetch.py's free synchronous path. Earth Engine runs the
reduceRegions over the *whole* EU-Hydro asset in one server-side batch task
(parallelised by Google, no 5-min / memory caps), writes CSV to a GCS bucket,
and we stream it back. Makes finer scale, per-pass mode and many years fast.
Requires billing + a GCS bucket. Selected via `INGEST_TRANSPORT=gcs`.

This module exposes small primitives so the loader can run **many tasks
concurrently** (submit a pool, ingest each as it COMPLETES) - that's what
makes a per-pass multi-year backfill finish in hours, not days. It also keeps
`export_window` (single blocking window) for simple / composite use; both
yield the exact same row dicts as `fetch.fetch_window`.
"""

import os
import time
from typing import Iterator, List, Tuple

import ee

from . import config
from .eeutil import ee_retry
from .fetch import _OID, _TS_COL, _parse  # reuse the identical CSV→row parser
from .sensors.base import Sensor


def _gcs_client():
    from google.cloud import storage
    key = config.GEE_SERVICE_ACCOUNT_KEY
    if key and os.path.exists(key):
        return storage.Client.from_service_account_json(key)
    return storage.Client(project=config.GEE_PROJECT)


def _safe_desc(sensor_code: str, acquired_at: str) -> str:
    # EE task description: [A-Za-z0-9_.-], <=100 chars.
    d = f"aq_{sensor_code}_{acquired_at}"
    return "".join(c if c.isalnum() or c in "_.-" else "_" for c in d)[:100]


def _selectors(sensor: Sensor) -> List[str]:
    return [_OID, _TS_COL] + sensor.METRIC_FIELDS + sensor.RISK_FIELDS


# --- primitives (used by the concurrent orchestrator in loader) -----------

def build_task(sensor: Sensor, start: str, end: str,
                acquired_at: str) -> Tuple[object, str]:
    """Construct (not start) a batch export task for one window.
    Returns (task, gcs_object_prefix)."""
    if not config.GCS_BUCKET:
        raise RuntimeError(
            "INGEST_TRANSPORT=gcs but GCS_BUCKET is unset (see "
            "docs/BATCH_EXPORT.md).")
    rivers = ee.FeatureCollection(config.GEE_ASSET_RIVERS)
    indices = sensor.indices_image(start, end)
    sel = _selectors(sensor)
    stats = indices.reduceRegions(
        collection=rivers,
        reducer=ee.Reducer.mean(),
        scale=config.REDUCE_SCALE,
        tileScale=config.REDUCE_TILESCALE,
    )
    stats = sensor.add_risk(stats)
    ts_ms = sensor.window_time_ms(start, end)   # ee.Number (UTC ms)
    stats = stats.map(lambda f: f.set(_TS_COL, ts_ms))
    stats = stats.map(lambda f: ee.Feature(None).copyProperties(f, sel))
    obj_prefix = f"{config.GCS_PREFIX}/{sensor.SENSOR}/{acquired_at}"
    task = ee.batch.Export.table.toCloudStorage(
        collection=stats,
        description=_safe_desc(sensor.SENSOR, acquired_at),
        bucket=config.GCS_BUCKET,
        fileNamePrefix=obj_prefix,
        fileFormat="CSV",
        selectors=sel,
    )
    return task, obj_prefix


def start_task(task, what: str = "export.start") -> None:
    ee_retry(lambda: task.start(), what=what)


def task_state(task, what: str = "export.status") -> str:
    return ee_retry(lambda: task.status(), what=what).get("state", "UNKNOWN")


def task_error(task) -> str:
    try:
        return task.status().get("error_message", "")
    except Exception:
        return ""


def existing_blobs(sensor: Sensor, acquired_at: str):
    """List any CSVs already in GCS for this window. Lets the orchestrator
    *recover* tasks that finished server-side after a client-side timeout
    (or after a crash/restart) instead of re-running the export. Returns
    (obj_prefix, [blob, ...]); empty list means nothing waiting."""
    if not config.GCS_BUCKET:
        return ("", [])
    obj_prefix = f"{config.GCS_PREFIX}/{sensor.SENSOR}/{acquired_at}"
    try:
        client = _gcs_client()
        blobs = [b for b in client.list_blobs(config.GCS_BUCKET,
                                              prefix=obj_prefix)
                 if b.name.endswith(".csv")]
    except Exception:
        blobs = []
    return (obj_prefix, blobs)


def drain_rows(sensor: Sensor, obj_prefix: str,
               acquired_at: str) -> Iterator[dict]:
    """Download every CSV under the prefix, yield parsed rows, delete blobs."""
    client = _gcs_client()
    blobs = [b for b in client.list_blobs(config.GCS_BUCKET, prefix=obj_prefix)
             if b.name.endswith(".csv")]
    if not blobs:
        raise RuntimeError(
            f"export COMPLETED but no CSV under "
            f"gs://{config.GCS_BUCKET}/{obj_prefix}")
    for b in blobs:
        for row in _parse(b.download_as_text(), sensor, acquired_at):
            yield row
    if not config.GCS_KEEP:
        for b in blobs:
            try:
                b.delete()
            except Exception:  # a leftover object is harmless
                pass


# --- single blocking window (composite / simple use) ----------------------

def export_window(sensor: Sensor, start: str, end: str,
                  acquired_at: str) -> Iterator[dict]:
    """Yield rows for one window, blocking until its batch task completes."""
    tag = f"{sensor.SENSOR} {acquired_at}"
    task, obj_prefix = build_task(sensor, start, end, acquired_at)
    start_task(task, what=f"export.start[{tag}]")
    if config.PROGRESS:
        print(f"   [{tag}] batch export started "
              f"(scale={config.REDUCE_SCALE} tileScale={config.REDUCE_TILESCALE})"
              f" -> gs://{config.GCS_BUCKET}/{obj_prefix}*", flush=True)
    t0 = time.time()
    while True:
        state = task_state(task, what=f"export.status[{tag}]")
        el = int(time.time() - t0)
        if state == "COMPLETED":
            if config.PROGRESS:
                print(f"   [{tag}] export COMPLETED in "
                      f"{el // 60}m{el % 60:02d}s", flush=True)
            break
        if state in ("FAILED", "CANCELLED", "CANCEL_REQUESTED"):
            raise RuntimeError(
                f"GCS export {state} for {tag}: {task_error(task)}")
        if el > config.EXPORT_TIMEOUT_SECONDS:
            raise TimeoutError(f"GCS export for {tag} exceeded "
                               f"{config.EXPORT_TIMEOUT_SECONDS}s ({state})")
        if config.PROGRESS:
            print(f"   [{tag}] export {state} … {el // 60}m{el % 60:02d}s",
                  flush=True)
        time.sleep(config.EXPORT_POLL_SECONDS)
    n = 0
    for row in drain_rows(sensor, obj_prefix, acquired_at):
        n += 1
        yield row
    if config.PROGRESS:
        print(f"   [{tag}] window done: {n} rows", flush=True)
