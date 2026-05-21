# AquaGraph Data Pipeline - Architecture & Design

> Status: **proposed design** for the automated satellite-data ingestion pipeline.
> Goal: replace the manual notebook → Google Drive → manual download → ETL flow
> with an unattended service that ingests every satellite pass, stores full
> per-segment history in PostgreSQL, and powers river-evolution graphs + PDF
> reports now (and ML training later).

## 1. What exists today (baseline)

```
GEE notebooks (manual, ee.Authenticate)         research/Cassini2026_*.ipynb
  → Export.table.toDrive  (GeoJSON chunks)
    → manual download → dataset/ehanced_eu_hydro/rivers_part_*.geojson
      → extract_rivers_pollution.py  (geopandas join + name grouping)
        → backend/data/rivers_romania.json   (51 MB, single snapshot)
        → precompute_tiles.py → backend/data/tiles/**.png  (386 MB)
          → Flask app.py loads the snapshot at startup, serves the map
```

- No time dimension: only the latest snapshot exists.
- Sentinel-1 (oil) notebook exists but its output is never ingested.
- EnMAP not used at all.
- No scheduler, no service account, no DB history.
- Production app runs on a 1 GB Azure VM (memory-constrained).

## 2. Target architecture

Two clearly separated planes:

### Ingestion plane - runs on a **dedicated worker host** (decided)

> **Zero-budget constraint:** the GCP project has **no billing account**, so
> GCS and `Export.*.toCloudStorage/toDrive` are unavailable. Earth Engine is
> still free under the **noncommercial** plan. We therefore pull data with
> **chunked synchronous `getDownloadURL` (CSV)** - no bucket, no batch task,
> no cost. We only need per-segment *metric values* keyed by `OBJECT_ID`;
> geometry already lives locally in EU-Hydro, so payloads stay tiny.

```
APScheduler (daily tick)
  └─ for each sensor (S2, S1, EnMAP):
       1. Discover new acquisitions since the per-sensor watermark
       2. Build the GEE reduceRegions over the eu-hydro asset
       3. Page features with toList(CHUNK, offset); per chunk:
            - drop geometry, keep OBJECT_ID + index/risk props
            - FeatureCollection.getDownloadURL(format='CSV', selectors=…)
            - HTTP GET the CSV (free), parse
       4. Normalize → upsert per-segment rows into PostgreSQL (history)
       5. Refresh the "latest" snapshot + tiles, publish to the app host
```

### Serving plane - the existing Flask app

- Keeps loading the latest `rivers_romania.json` + tiles for the map (unchanged
  rendering path - zero risk to the demo map).
- Gains **new read-only endpoints** that query the Postgres history tables for
  evolution graphs and PDF reports.
- Connects to the **same Postgres** the worker writes to (already deployed in
  `docker-compose.prod.yml`).

```
Worker host ──writes──► PostgreSQL ◄──reads── Flask app
     │                  (history)                   │
     └── rsync latest snapshot + tiles ─────────────┘ (map rendering, unchanged)
```

## 3. Why these choices

| Decision | Choice | Rationale |
|---|---|---|
| Auth | GEE **service account** (GCP key, free) | Only way to run GEE unattended. Service accounts/IAM need no billing. Setup guide: `docs/GEE_SERVICE_ACCOUNT_SETUP.md`. |
| Export transport | Chunked `getDownloadURL('CSV')` over HTTP | **No billing → no GCS/Drive.** Free, scriptable. Geometry dropped (we have it locally), so chunks are small; paged via `toList(CHUNK, offset)` like the notebook. Idempotent upsert makes partial runs safe. |
| History store | PostgreSQL, long/narrow table | Already deployed; range queries for graphs/reports; natural ML training source. |
| Granularity | **Per-segment** | Nothing is lost; per-river aggregates are a cheap `GROUP BY`; richest base for ML. |
| Runtime | Dedicated worker + APScheduler | Keeps the tiny app VM free; APScheduler is dependency-light vs Celery/Airflow. |
| Map path | Untouched | The demo map keeps working exactly as today; history is purely additive. |

## 4. Cadence reality (important caveat)

- **Sentinel-2** (S2_SR_HARMONIZED): ~5-day effective revisit (S2A+S2B). Cloud
  cover means usable river observations are sparser - we ingest per *available*
  acquisition, not per nominal pass.
- **Sentinel-1** (GRD): ~6–12 day revisit over Romania depending on orbit.
- **EnMAP**: ⚠️ hyperspectral, **tasked/pointed** instrument with a ~27-day
  repeat and *sparse, non-continuous* coverage. It is **not** a standard public
  GEE collection. The EnMAP ingester is designed as a *pluggable, best-effort*
  module (via the EnMAP/DLR portal API or a mirrored asset if available) and is
  **not on the demo critical path**.

The scheduler runs **daily** and processes only acquisitions newer than the
per-sensor watermark - this is "per pass" in practice without guessing orbits.

## 5. Database schema (additive - see `backend/migrations/002_timeseries.sql`)

```sql
-- One row per (segment, sensor, acquisition) - long/narrow, ML-friendly.
CREATE TABLE satellite_observation (
    id            BIGSERIAL PRIMARY KEY,
    object_id     TEXT        NOT NULL,   -- EU-Hydro segment OBJECT_ID
    river_id      TEXT,                   -- denormalized for fast river queries
    sensor        TEXT        NOT NULL,   -- 'S2' | 'S1' | 'ENMAP'
    acquired_at   DATE        NOT NULL,   -- satellite acquisition date
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metrics       JSONB       NOT NULL,   -- {"NDVI":0.4,"MNDWI":0.6,...}
    risk          JSONB,                  -- {"risk_score":..,"risk_level":..}
    UNIQUE (object_id, sensor, acquired_at)
);
CREATE INDEX ix_obs_river_time   ON satellite_observation (river_id, sensor, acquired_at);
CREATE INDEX ix_obs_object_time  ON satellite_observation (object_id, sensor, acquired_at);

-- Per-sensor ingestion watermark + run audit.
CREATE TABLE ingestion_run (
    id            BIGSERIAL PRIMARY KEY,
    sensor        TEXT NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'running', -- running|ok|error
    acquired_from DATE,
    acquired_to   DATE,
    segments      INTEGER,
    message       TEXT
);
```

Scale estimate: ~33k segments × 7 S2 indices × ~50 usable passes/yr ≈ a few
million rows/yr. Plain Postgres with the indexes above is comfortable; monthly
range-partitioning of `satellite_observation` is a documented future option, not
needed for the demo.

Per-river aggregate for graphs/reports is just:
`SELECT acquired_at, avg((metrics->>'NDTI')::float) ... GROUP BY acquired_at`.

## 6. New code layout

```
backend/ingest/
  __init__.py
  config.py          # env: GEE_SA_KEY, GEE_PROJECT, GCS_BUCKET, DB_URL, schedule
  gee_auth.py        # service-account ee.Initialize()
  sensors/
    base.py          # Sensor ABC: discover() / build_indices() / risk()
    sentinel2.py     # ported from Cassini2026_Sentinel2.ipynb
    sentinel1.py     # ported from Cassini2026_S1.ipynb (oil)
    enmap.py         # Phase 4, best-effort pollution metrics
  fetch.py           # chunked reduceRegions → getDownloadURL CSV → rows (free)
  loader.py          # CSV rows → satellite_observation upsert
  snapshot.py        # rebuild rivers_romania.json + tiles, publish to app host
  scheduler.py       # APScheduler entrypoint (the long-running service)
  cli.py             # manual: `python -m backend.ingest.cli s2 --since 2024-06-01`

backend/migrations/002_timeseries.sql
docs/GEE_SERVICE_ACCOUNT_SETUP.md
docs/PIPELINE.md   (this file)
```

The notebooks stay in `research/` as the reference/algorithm source of truth;
`sensors/sentinel2.py` and `sentinel1.py` are faithful ports of their index and
risk formulas (kept in sync, single definition reused by the snapshot rebuild).

## 7. New serving endpoints (Flask, read-only, query Postgres)

- `GET /api/river/<river_id>/history?metric=NDTI&sensor=S2&from=&to=`
  → `[{date, avg, min, max, segment_count}]` for the evolution graph.
- `GET /api/segment/<object_id>/history?metric=&sensor=` → per-segment series.
- `GET /api/river/<river_id>/report.pdf?from=&to=` → server-rendered PDF
  (reportlab + a matplotlib trend chart): river identity, latest risk, evolution
  charts per key metric, notable change callouts.

## 8. Frontend additions

- `RiverEvolutionChart.jsx` (recharts) in the river detail panel - metric +
  date-range selectors, line chart from `/history`.
- "Download PDF report" button → hits `/report.pdf`.
- No change to the map rendering path.

## 9. Phased delivery

| Phase | Scope | Status |
|---|---|---|
| **0** | Service account + noncommercial EE registration (guided, user runs it; **no billing/GCS**) | ⏳ user (Phase 0, guide written) |
| **1** | DB migration + schema, `ingest` package, config, GEE auth, CLI | ✅ done |
| **2** | Sentinel-2 ingester end-to-end (discover→fetch→load) | ✅ done |
| **3** | History + PDF endpoints, frontend evolution chart & report button | ✅ done |
| **4** | Sentinel-1 (oil) ingester + metric in UI | ✅ done |
| **5** | EnMAP best-effort ingester | post-demo |
| **6** | Snapshot rebuild + backfill + DB transfer ✅; **`ingest` compose service** (APScheduler, satellite-pass `pass`-mode, opt-in profile) ✅; rsync tile republish to app VM (pending) | mostly done |
| **7** | ML-readiness: feature export view / notebook from `satellite_observation` | future |

### Map integration (Phase 6 - done)

The map renders from `data/rivers_romania.json` → `precompute_tiles.py`
(PNG pyramid + `segments_lod_*.json`). `ingest/snapshot.py` **projects the
time-series onto that snapshot**: latest observation per `(object_id, sensor)`
from `satellite_observation` →

* S2 → `seg["indices"]` + `seg["risk"]`
* S1 `OIL_PROBABILITY` → `seg["risk"]["land_risk"]` - the field the existing
  "Oil leackage" (`land`) map metric already reads, range `(0,1)` = oil prob.

No changes to `metrics.py`, `precompute_tiles.py`, or the frontend. Segments
with no DB row keep their prior values, so the map works during/before a
backfill. `cli snapshot [--tiles]` rebuilds JSON (and optionally re-runs the
tile precompute in a subprocess). Round-trip rewrite is structurally identical
and ~3× smaller than the legacy file (faster app boot).

**Recurring ingestion service:** `docker/Dockerfile.ingest` + an `ingest`
service in both compose files behind `profiles: ["ingest"]` (so it never
auto-starts on the 1 GB app VM or in app dev). Runs
`backend/ingest/scheduler.py` - APScheduler cron (`INGEST_SCHEDULE_CRON`),
`pass` mode, only acquisitions newer than the per-sensor watermark. Optional
`INGEST_REBUILD_SNAPSHOT=1` refreshes the map snapshot after a cycle (base-map
tiles need an app restart; DB-backed timeline/charts/PDF are live). Start it:
```
GEE_KEY_FILE=/abs/aquagraph-gee-key.json \
  docker compose --profile ingest up -d --build ingest
```

**Server move:** only the two Postgres tables transfer
(`scripts/dump_timeseries.sh` → `restore_timeseries.sh`, `pg_dump -Fc`).
Tiles + snapshot are *derived* - regenerate on the target with
`cli snapshot --tiles`. `scripts/backfill.sh` runs the resumable 3-year
monthly backfill (Ctrl-C safe; skips months already present).

> Phases 1–3 are committed-ready and additive: the running demo (map, tiles,
> campaigns, auth) is untouched. The history endpoints degrade gracefully
> (HTTP 503 / empty chart) until the pipeline has populated data, so the UI is
> safe to ship before Phase 0/2 have actually run.

Backfill: once the S2 ingester works, run the CLI over historical date windows
(e.g. monthly composites 2019→now) to populate `satellite_observation` so the
evolution graphs and future ML model have real history from day one.

## 10. Open risks

- **EnMAP availability** in/around GEE is uncertain - may require the DLR EnMAP
  portal API and a separate auth. Scoped out of the demo deliberately.
- GEE interactive limits are handled in `ingest/eeutil.py` + `fetch.py`:
  - **Rate limit / quota (429) / transient 5xx** on any EE call
    (`size`, `getDownloadURL`, `discover_dates`) → exponential backoff +
    jitter, retried up to `INGEST_EE_MAX_RETRIES` (8), with a longer base for
    rate limits (`INGEST_EE_RATE_BACKOFF_BASE`, 20 s) than transient (4 s),
    capped at `INGEST_EE_BACKOFF_CAP` (600 s).
  - **"User memory limit exceeded" / "Computation timed out"** → the chunk is
    split in half and each half retried, recursively, down to
    `INGEST_FETCH_MIN_CHUNK` (50). A heavy month degrades instead of failing;
    sub-ranges that still can't complete are skipped (idempotent upsert lets
    them be re-run later) rather than aborting the whole window.
  - **Fatal errors** (bad asset, syntax) raise immediately - no spin.
  - CSV HTTP download keeps its own bounded backoff; loader upsert is
    idempotent so partial/retried runs are always safe.
- Earth Engine **noncommercial** rate limits apply (concurrent requests, daily
  compute). Chunks are fetched sequentially with an inter-chunk politeness
  sleep, never in parallel; the backoff above absorbs quota pushback during
  the multi-hour S1 backfill.
- **Sentinel-1 baseline depth.** The notebook used a 2019–2023 baseline median
  via async Drive batch jobs. With no billing we only have synchronous
  `getDownloadURL` (~5-min compute cap); a multi-year country-wide S1 median
  exceeds it ("Computation timed out"), and even a shorter one needs
  `tileScale=16` to clear "User memory limit exceeded". Verified working with a
  ~1-season baseline (`INGEST_S1_BASELINE_*`, the new default) - fast enough
  for the free tier, oil probability + risk match the notebook. For a deeper
  multi-year baseline, materialize it **once** as a free EE asset
  (`Export.image.toAsset`, not GCS) on the worker and point the baseline env
  vars at that asset - future Phase 6 work; the interface/code is unchanged.
  S1 is correspondingly slower than S2 per chunk, so the worker backfill uses a
  smaller `INGEST_FETCH_CHUNK` for it.
- Worker→app snapshot publish uses **rsync over SSH** (no object store -
  zero-budget). Worker holds a deploy SSH key to the app VM; details in Phase 6.
