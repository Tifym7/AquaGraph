"""Free, chunked, resilient extraction from Earth Engine.

For each chunk of the EU-Hydro asset we reduce the sensor's indices image over
the segments, attach server-side risk, drop geometry, and pull the numeric
table via FeatureCollection.getDownloadURL(CSV) over plain HTTP. No GCS, no
batch tasks, no billing.

Resilience (see eeutil.py):
  * rate-limit / quota / transient EE errors  -> exponential backoff + retry
  * "User memory limit exceeded" / "timed out" -> split the chunk in half and
    retry each half (down to FETCH_MIN_CHUNK), so a heavy month degrades
    gracefully instead of failing
  * CSV HTTP download                          -> its own bounded backoff
Chunks are processed sequentially with a politeness sleep between them.
"""

import csv
import io
import time
from typing import Iterator, List

import ee
import requests

from . import config
from .eeutil import EEComputeTimeout, EEMemoryError, ee_retry
from .sensors.base import Sensor

_OID = "OBJECT_ID"


def _parse_float(v: str):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _http_csv(url: str) -> str:
    last = None
    for attempt in range(config.FETCH_MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=300)
            if resp.status_code == 200:
                return resp.text
            last = f"HTTP {resp.status_code}: {resp.text[:200]}"
        except requests.RequestException as exc:  # noqa: PERF203
            last = str(exc)
        time.sleep(config.FETCH_BACKOFF * (2 ** attempt))
    raise RuntimeError(f"CSV download failed after retries: {last}")


def _chunk_csv(indices, sensor, rivers, offset: int, size: int,
               selectors: List[str]) -> str:
    """One reduce+download for [offset, offset+size). EE rate/transient errors
    are retried inside ee_retry; memory/timeout raise typed errors."""
    chunk = ee.FeatureCollection(rivers.toList(size, offset))
    stats = indices.reduceRegions(
        collection=chunk,
        reducer=ee.Reducer.mean(),
        scale=config.REDUCE_SCALE,
        tileScale=config.REDUCE_TILESCALE,
    )
    stats = sensor.add_risk(stats)
    stats = stats.map(lambda f: ee.Feature(None).copyProperties(f, selectors))
    url = ee_retry(
        lambda: stats.getDownloadURL(filetype="CSV", selectors=selectors),
        what=f"getDownloadURL[{offset}:{offset + size}]",
    )
    return _http_csv(url)


def _parse(text: str, sensor: Sensor, acquired_at: str) -> Iterator[dict]:
    for rec in csv.DictReader(io.StringIO(text)):
        oid = rec.get(_OID)
        if not oid:
            continue
        metrics = {}
        for f in sensor.METRIC_FIELDS:
            val = _parse_float(rec.get(f))
            if val is not None:
                metrics[f] = round(val, 6)
        if not metrics:
            continue  # no satellite coverage for this segment in window
        risk = {}
        for f in sensor.RISK_FIELDS:
            raw = rec.get(f)
            if raw is None or raw == "":
                continue
            num = _parse_float(raw)
            risk[f] = raw if num is None else round(num, 4)
        yield {
            "object_id": str(oid),
            "sensor": sensor.SENSOR,
            "acquired_at": acquired_at,
            "metrics": metrics,
            "risk": risk or None,
        }


def _iter_range(indices, sensor, rivers, offset: int, size: int,
                selectors: List[str], acquired_at: str) -> Iterator[dict]:
    """Yield rows for [offset, offset+size), halving the range and retrying
    when EE reports a memory/compute limit (graceful degradation)."""
    try:
        text = _chunk_csv(indices, sensor, rivers, offset, size, selectors)
    except (EEMemoryError, EEComputeTimeout) as exc:
        if size <= config.FETCH_MIN_CHUNK:
            # Can't shrink further - skip this sub-range rather than abort the
            # whole window; upsert is idempotent so it can be retried later.
            print(f"   [fetch] giving up on {offset}:{offset + size} "
                  f"(min chunk reached): {type(exc).__name__}", flush=True)
            return
        half = size // 2
        print(f"   [fetch] {type(exc).__name__} at {offset}:{offset + size} "
              f"-> splitting into {half}+{size - half}", flush=True)
        yield from _iter_range(indices, sensor, rivers, offset, half,
                               selectors, acquired_at)
        yield from _iter_range(indices, sensor, rivers, offset + half,
                               size - half, selectors, acquired_at)
        return
    yield from _parse(text, sensor, acquired_at)


def _bar(frac: float, width: int = 22) -> str:
    frac = max(0.0, min(1.0, frac))
    filled = int(frac * width)
    return "#" * filled + "-" * (width - filled)


def _fmt(secs: float) -> str:
    secs = int(max(0, secs))
    return f"{secs // 60}m{secs % 60:02d}s" if secs >= 60 else f"{secs}s"


def fetch_window(sensor: Sensor, start: str, end: str,
                 acquired_at: str) -> Iterator[dict]:
    """Yield observation rows for one date window.

    `acquired_at` is the date stamped onto every row (the pass date, or the
    representative date of a composite window). Emits a per-chunk progress
    bar (rows so far + ETA) so a slow window is visibly alive, not frozen.
    """
    rivers = ee.FeatureCollection(config.GEE_ASSET_RIVERS)
    count = int(ee_retry(lambda: rivers.size().getInfo(), what="asset size"))
    indices = sensor.indices_image(start, end)
    selectors: List[str] = [_OID] + sensor.METRIC_FIELDS + sensor.RISK_FIELDS

    total_chunks = (count + config.FETCH_CHUNK - 1) // config.FETCH_CHUNK
    tag = f"{sensor.SENSOR} {acquired_at}"
    t0 = time.time()
    rows = 0
    if config.PROGRESS:
        print(f"   [{tag}] start: {count} segments, {total_chunks} chunks "
              f"of {config.FETCH_CHUNK} (scale={config.REDUCE_SCALE} "
              f"tileScale={config.REDUCE_TILESCALE})", flush=True)

    for ci, offset in enumerate(range(0, count, config.FETCH_CHUNK), 1):
        size = min(config.FETCH_CHUNK, count - offset)
        before = rows
        for row in _iter_range(indices, sensor, rivers, offset, size,
                               selectors, acquired_at):
            rows += 1
            yield row
        if config.PROGRESS and (ci % config.PROGRESS_EVERY == 0
                                or ci == total_chunks):
            done = offset + size
            frac = done / count if count else 1.0
            el = time.time() - t0
            eta = (el / frac - el) if frac > 0 else 0
            print(f"   [{tag}] [{_bar(frac)}] {frac * 100:5.1f}%  "
                  f"chunk {ci}/{total_chunks}  {done}/{count} segs  "
                  f"{rows} rows (+{rows - before})  "
                  f"{_fmt(el)} elapsed  ETA ~{_fmt(eta)}", flush=True)
        time.sleep(config.FETCH_BACKOFF)  # politeness between chunks

    if config.PROGRESS:
        print(f"   [{tag}] window done: {rows} rows in {_fmt(time.time() - t0)}",
              flush=True)
