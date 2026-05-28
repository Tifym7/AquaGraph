# How Google Earth Engine works for AquaGraph

A reference for new contributors who see `image.reduceRegions(...)` in our
code and wonder "wait, when does that actually run, and where?". The short
answer: it doesn't run when we write it - it runs on **Google's cluster**,
once, when we explicitly trigger it.

This doc maps the model to specific lines in our repository so you can read
along.

---

## TL;DR

- Every Earth Engine (EE) call in our Python - `ee.ImageCollection(...)`,
  `.filterDate(...)`, `.median()`, `.map(...)`, `image.reduceRegions(...)` -
  is **deferred**. It builds nodes in a serializable computation graph; it
  does not fetch a pixel.
- The graph only executes when we hand it to Google via one of two triggers:
  - **`task.start()`** - batch export → CSV in our GCS bucket.
  - **`stats.getDownloadURL("CSV")`** - synchronous, ~5-minute compute cap.
- Google moves **compute to the data** (~10s of PB of Sentinel imagery sit
  on their storage); we only send/receive small JSON graphs and small CSV
  results. That is *the* reason a 1 GB VM can process a 10-year archive.

---

## The mental model

```
┌──────────────────────────────────┐         ┌────────────────────────────┐
│  Our worker (~1 GB VM)           │ -graph→ │  Google Earth Engine       │
│                                  │         │  · planetary storage       │
│  build a graph of operations:    │         │  · planet-scale executors  │
│    filterDate                    │         │  · per-tile parallelism    │
│    .map(_mask_clouds)            │         │  · scene cache             │
│    .median()                     │         │                            │
│    .reduceRegions(rivers, mean)  │         │  materialises the graph    │
│    .add_risk()                   │         │  on the tiles that         │
│  ┌─ deferred -────────────────┐  │         │  intersect our geometries  │
│  │  no pixels touched yet     │  │  ←CSV── │                            │
│  └────────────────────────────┘  │         │                            │
└──────────────────────────────────┘         └────────────────────────────┘
```

Inputs: ~few-KB JSON graph + a per-segment feature collection. Outputs: a
~few-MB CSV with one row per (river segment, sensor, acquisition).

---

## Walking through our code

The asymmetry is real: ~100 lines of *graph construction* on our side, and a
single `.start()` that runs the whole thing on theirs.

### 1. Build the graph - `backend/ingest/sensors/sentinel2.py`

```python
# sentinel2.py:52  - still deferred
def _base_collection(self, start, end):
    return (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(self.country())
            .filterDate(start, end)
            .map(_mask_s2_clouds))

# sentinel2.py:60
def indices_image(self, start, end):
    composite = self._base_collection(start, end).median().clip(self.country())
    return _compute_indices(composite).select(self.METRIC_FIELDS)
```

`filterBounds`, `filterDate`, `.map(...)`, `.median()`, `.clip(...)`, and the
per-pixel band math in `_compute_indices` are all **graph nodes**. They
return proxy objects (`ee.Image`, `ee.ImageCollection`) describing what to
compute, not the result.

The same pattern, much heavier graph, lives in
`backend/ingest/sensors/sentinel1.py:77–134` - event composite + multi-year
baseline median + `focal_median` + `reduceNeighborhood(stdDev)` + weighted
oil-probability + JRC water mask. Still **just graph nodes**.

### 2. Compose into a `FeatureCollection` - still deferred

`backend/ingest/gcs_export.py:57–68` is the cleanest illustration:

```python
indices = sensor.indices_image(start, end)            # graph
stats   = indices.reduceRegions(                      # graph
    collection = rivers,                              # ~34,962 EU-Hydro segments
    reducer    = ee.Reducer.mean(),
    scale      = config.REDUCE_SCALE,                 # 10 m
    tileScale  = config.REDUCE_TILESCALE,             # parallelism / memory dial
)
stats   = sensor.add_risk(stats)                      # graph
stats   = stats.map(lambda f: f.set(_TS_COL, ts_ms))  # graph
stats   = stats.map(                                  # graph (drop geometry)
    lambda f: ee.Feature(None).copyProperties(f, sel)
)
```

At line 68 we hold an `ee.FeatureCollection` proxy that describes:

> "for every river segment, take the median S2 composite of the window,
> compute the indices, reduce by the segment polyline at 10 m, attach the
> risk fields, attach the UTC scene timestamp, drop geometry, keep these
> columns."

Still no compute on either side.

### 3. The trigger - the only place EE actually does work

Two transports, **same graph**:

#### Batch - `backend/ingest/gcs_export.py:70–83`

```python
task = ee.batch.Export.table.toCloudStorage(
    collection     = stats,                # the graph
    bucket         = config.GCS_BUCKET,    # aquagraph_gee
    fileNamePrefix = obj_prefix,
    fileFormat     = "CSV",
    selectors      = sel,
)

def start_task(task, ...):
    ee_retry(lambda: task.start(), ...)    # ← graph ships to Google, queued
```

`task.start()` is **the trigger**. The graph is serialised, sent to
Google's batch infrastructure, and queued. We then poll `task.status()`
(`gcs_export.py:85`) until `COMPLETED`, download the CSV blob, and delete
it. Concurrent orchestration of many such tasks lives in
`backend/ingest/loader.py:_run_concurrent_gcs`.

#### Synchronous (free, no billing) - `backend/ingest/fetch.py:73`

```python
url = ee_retry(
    lambda: stats.getDownloadURL(filetype="CSV", selectors=selectors)
)
```

Same graph, but `getDownloadURL` runs it interactively. EE materialises it
synchronously, with a ~5-minute compute cap and tighter memory limits, and
returns a temporary URL we HTTP-GET. This is what powers the zero-budget
"sync" transport.

---

## Why this model is efficient for Google

| Property | What it means | Where in our code |
|---|---|---|
| **Compute → data**, not data → compute | Imagery (~10s of PB) lives in Google Cloud. We send a few-KB graph; Google fetches only the tiles intersecting our geometries and only the bands we reference. | Our `indices_image` calls reference specific bands (`B2/B3/B4/B5/B8/B11`); EE plan only reads those. |
| **Lazy materialisation** | Nothing is precomputed. Asking for "monthly median over Romania for B3/B8" pulls only those scenes, only those bands. No intermediate full-image is persisted. | `.median()` / `.filterDate()` chain in `sensors/sentinel2.py`. |
| **Shared scene cache** | Many users hit the same Sentinel scenes; tiles cache hot on Google's side. | Implicit - repeated runs over the same date are materially cheaper. |
| **Per-tile parallelism** | `reduceRegions` over 34,962 polylines is partitioned across many machines. | `tileScale` is the only memory/parallelism dial we expose: `config.REDUCE_TILESCALE`. |
| **Quota-based back-pressure** | Each account gets metered compute units. Abusers queue/throttle. | This is the throttling we hit on S1 backfills; we live with it via `INGEST_GCS_MAX_INFLIGHT` and stranded-blob recovery. |
| **Output ↔ output, not data ↔ data** | We send a small graph, receive a small CSV. The PB of imagery the graph touched never leaves Google. | A typical batch CSV is **~3 MB** - the input it touched was multiple **TB**. |

---

## The asymmetry in our codebase

| Stage | File(s) / lines | Where it runs |
|---|---|---|
| Build deferred graph (S2) | `backend/ingest/sensors/sentinel2.py:52–134` | Our worker, no cost |
| Build deferred graph (S1) | `backend/ingest/sensors/sentinel1.py:50–170` | Our worker, no cost |
| Assemble FeatureCollection | `backend/ingest/gcs_export.py:48–68` *(or)* `backend/ingest/fetch.py:58–71` | Our worker, no cost |
| **Trigger** (batch) | `backend/ingest/gcs_export.py:81–83` (`task.start()`) | **Google's cluster** |
| **Trigger** (sync) | `backend/ingest/fetch.py:73–75` (`getDownloadURL`) | **Google's cluster** |
| Poll task state | `backend/ingest/gcs_export.py:85–87` | Cheap API call |
| Download CSV + parse | `backend/ingest/gcs_export.py:114–134` + `backend/ingest/fetch.py:_parse` | Our worker, ~MB of I/O |
| Upsert into Postgres | `backend/ingest/db.py:upsert_observations` | Our DB |

Roughly: **~100 lines of graph + 1 trigger line** drive the entire heavy
compute on Google's side; the remaining hundreds of lines in our package are
just submission, polling, downloading, and DB upserts.

---

## Implications for our architecture

- **Our worker stays tiny.** The 1 GB Azure VM never sees a satellite scene.
  It builds graphs, polls EE, parses small CSVs, and upserts to Postgres.
- **Scaling is on Google's side.** Going from 1 month to 10 years just makes
  the graph reference more dates; the *worker's* memory/CPU don't grow.
- **Throttling is the real cost gate, not compute.** EE quota meters our
  request rate; we work around it with concurrency caps
  (`INGEST_GCS_MAX_INFLIGHT`), exponential backoff
  (`backend/ingest/eeutil.py`), and stranded-blob recovery
  (`gcs_export.existing_blobs` → reuse server-side work that finished after
  we timed out client-side).
- **Bands ≠ data we hold.** We never store rasters. Only the per-segment
  numeric aggregates and the computed risk score live in `satellite_observation`.
- **Switching transports is one env var.** `INGEST_TRANSPORT=sync` uses the
  free `getDownloadURL` path; `INGEST_TRANSPORT=gcs` uses the batch path
  through `aquagraph_gee`. Same graph, same downstream - see
  `loader._window_fn()` in `backend/ingest/loader.py`.

---

## Key files (index)

| File | What it owns |
|---|---|
| `backend/ingest/sensors/sentinel2.py` | S2 cloud mask, monthly/per-pass composite, 7 indices, S2 risk computation. **All deferred graph.** |
| `backend/ingest/sensors/sentinel1.py` | S1 event + baseline composites, `focal_median`, `reduceNeighborhood`, oil-probability, S1 risk. **All deferred graph.** |
| `backend/ingest/gcs_export.py` | Batch transport: `build_task`, `start_task`, `task_state`, `drain_rows`, `existing_blobs` (stranded recovery). |
| `backend/ingest/fetch.py` | Synchronous transport: chunked `getDownloadURL`, adaptive halving on memory/timeout. |
| `backend/ingest/loader.py` | Orchestration: `_run_sequential` (sync) and `_run_concurrent_gcs` (batch pool). |
| `backend/ingest/eeutil.py` | Retry/backoff layer around every EE API call. |
| `backend/ingest/config.py` | All EE/GCS tuning knobs (concurrency, timeout, scale, tileScale, baseline window). |

See also: `docs/PIPELINE.md` (architecture), `docs/BATCH_EXPORT.md`
(GCS transport setup), `docs/GEE_SERVICE_ACCOUNT_SETUP.md` (auth).
