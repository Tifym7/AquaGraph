"""Pipeline configuration, sourced from environment (.env).

Zero-budget: no GCS/billing vars. Auth is a free service-account key, or a
persisted `earthengine authenticate` credential as a fallback.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# --- Earth Engine ---
GEE_PROJECT = os.getenv("GEE_PROJECT", "cassini2026")
GEE_SERVICE_ACCOUNT_KEY = os.getenv("GEE_SERVICE_ACCOUNT_KEY", "").strip()
GEE_USE_PERSISTED_CREDENTIALS = _bool("GEE_USE_PERSISTED_CREDENTIALS", False)
GEE_ASSET_RIVERS = os.getenv("GEE_ASSET_RIVERS", "projects/cassini2026/assets/eu-hydro")

# Country filter (FAO GAUL level-0 name), matches the notebooks.
GEE_COUNTRY = os.getenv("GEE_COUNTRY", "Romania")

# --- Fetch tuning (free getDownloadURL has size/timeout caps) ---
# Features per chunk for toList()/getDownloadURL. 3000 matches the notebook.
FETCH_CHUNK = int(os.getenv("INGEST_FETCH_CHUNK", "3000"))
# reduceRegions scale (m). Notebook uses 20-30; 30 is faster/cheaper.
REDUCE_SCALE = int(os.getenv("INGEST_REDUCE_SCALE", "30"))
# reduceRegions tileScale: splits the computation into smaller tiles to cut
# peak memory ("User memory limit exceeded" on the free tier). Higher = slower
# but safer. Heavy sensors (S1's multi-year baseline + focal stats) need 16.
REDUCE_TILESCALE = int(os.getenv("INGEST_REDUCE_TILESCALE", "16"))
# Seconds to wait/retry between chunk HTTP fetches (politeness + backoff base).
FETCH_BACKOFF = float(os.getenv("INGEST_FETCH_BACKOFF", "2"))
FETCH_MAX_RETRIES = int(os.getenv("INGEST_FETCH_MAX_RETRIES", "5"))
# Adaptive chunk floor: on EE memory/timeout a chunk is split in half and
# retried, down to this size. Below it we give up on that sub-range.
FETCH_MIN_CHUNK = int(os.getenv("INGEST_FETCH_MIN_CHUNK", "50"))
# Per-chunk progress bar (rows + ETA). On by default so a slow window is
# visibly alive; PROGRESS_EVERY throttles the line frequency.
PROGRESS = _bool("INGEST_PROGRESS", True)
PROGRESS_EVERY = int(os.getenv("INGEST_PROGRESS_EVERY", "1"))

# --- Earth Engine API resilience (rate limit / transient backoff) ---
EE_MAX_RETRIES = int(os.getenv("INGEST_EE_MAX_RETRIES", "8"))
EE_BACKOFF_BASE = float(os.getenv("INGEST_EE_BACKOFF_BASE", "4"))     # transient
EE_RATE_BACKOFF_BASE = float(os.getenv("INGEST_EE_RATE_BACKOFF_BASE", "20"))  # 429/quota
EE_BACKOFF_CAP = float(os.getenv("INGEST_EE_BACKOFF_CAP", "600"))

# --- Sentinel-1 oil-slick detection (mirrors Cassini2026_S1.ipynb) ---
# Baseline = historical composite, filtered to the event window's months.
# NOTE: the notebook used 2019-2023 (5 years) because it exported via async
# Drive batch jobs. We have no billing -> only synchronous getDownloadURL,
# which has a ~5-min compute cap. A multi-year S1 median over the whole
# country blows that cap ("Computation timed out"). A ~1-season baseline
# (default below) recomputes fast enough to fit the free tier. For a deeper
# multi-year baseline, materialize it once as an EE asset on the worker
# (free, not GCS) and point INGEST_S1_BASELINE_START/END at that - see
# docs/PIPELINE.md §10.
S1_BASELINE_START = os.getenv("INGEST_S1_BASELINE_START", "2023-06-01")
S1_BASELINE_END = os.getenv("INGEST_S1_BASELINE_END", "2023-08-31")
S1_SMOOTHING_M = int(os.getenv("INGEST_S1_SMOOTHING_M", "30"))
S1_WATER_OCCURRENCE_MIN = int(os.getenv("INGEST_S1_WATER_OCC_MIN", "20"))
S1_OIL_THRESHOLD = float(os.getenv("INGEST_S1_OIL_THRESHOLD", "0.55"))

# --- Transport: how reduced features leave Earth Engine -------------------
# "sync" : free chunked getDownloadURL (no billing). The default;
# "gcs"  : GEE batch Export.table.toCloudStorage -> download from a bucket.
#          Server-side & parallel, no 5-min/memory caps -> finer scale,
#          per-pass, many years, much faster. Needs billing + a GCS bucket.
INGEST_TRANSPORT = os.getenv("INGEST_TRANSPORT", "sync").strip().lower()
GCS_BUCKET = os.getenv("GCS_BUCKET", "").strip()
GCS_PREFIX = os.getenv("GCS_PREFIX", "aquagraph-exports").strip("/")
# Batch task polling (no hard cap like the synchronous path).
EXPORT_POLL_SECONDS = int(os.getenv("INGEST_EXPORT_POLL", "20"))
EXPORT_TIMEOUT_SECONDS = int(os.getenv("INGEST_EXPORT_TIMEOUT", "10800"))  # 3h
# Delete exported objects after ingest (keeps GCS storage ~0 / costs nil).
GCS_KEEP = _bool("INGEST_GCS_KEEP", False)
# Concurrency: how many batch export tasks to keep submitted at once. EE
# queues beyond its own run-concurrency, so this just keeps the pipeline
# from blocking on one task at a time — turns a multi-day per-pass backfill
# into hours. Each in-flight task is independent & idempotent.
GCS_MAX_INFLIGHT = int(os.getenv("INGEST_GCS_MAX_INFLIGHT", "16"))

# --- Database ---
DB_URL = os.getenv("DB_URL", "").strip()
if not DB_URL:
    _user = os.getenv("DB_USER", "aquagraph")
    _pw = os.getenv("DB_PASSWORD", "")
    _host = os.getenv("DB_HOST", "localhost")
    _port = os.getenv("DB_PORT", "5432")
    _name = os.getenv("DB_NAME", "aquagraph")
    DB_URL = f"postgresql://{_user}:{_pw}@{_host}:{_port}/{_name}"

# --- Scheduler ---
SCHEDULE_CRON = os.getenv("INGEST_SCHEDULE_CRON", "0 3 * * *")  # daily 03:00
# Sensors the scheduled run processes, in order.
SCHEDULE_SENSORS = [s.strip().upper() for s in
                    os.getenv("INGEST_SENSORS", "S2,S1").split(",") if s.strip()]
# After each scheduled cycle, rebuild data/rivers_romania.json from the latest
# DB values so the map reflects new passes. NOTE: the Flask app loads that
# snapshot at startup, so the base-map/tiles refresh on the next app restart;
# the DB-backed timeline / charts / PDF update live immediately.
REBUILD_SNAPSHOT = _bool("INGEST_REBUILD_SNAPSHOT", False)
