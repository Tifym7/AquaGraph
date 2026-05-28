"""Tiny in-process job queue for long-running user-triggered work.

Two callers today:
  - the advanced segment report (`backend/advanced_report.py`),
  - any future async export / regeneration task.

Design:
  - Jobs are rows in `report_jobs`. The row IS the queue; we don't keep
    state in memory beyond the worker thread.
  - On `enqueue()` we insert the row in status='pending' and spawn a
    daemon thread that picks it up immediately. The thread writes back
    'running' / 'done' / 'failed' as it progresses.
  - No retries, no priorities, no cross-process visibility. If the
    container restarts mid-job, the row is left in 'running' forever -
    a periodic janitor could reap those, but it's out of scope for v1.
  - Restarting the container does NOT auto-resume pending jobs. This is
    deliberate; the user gets an email with an error if the job vanishes.

The schema is created lazily on first call to `enqueue()` so the
existing app boot path stays unchanged.
"""

import json
import logging
import os
import threading
import traceback
from typing import Callable, Optional

import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger("aquagraph.jobs")

_DB_URL      = os.getenv("DB_URL", "postgresql://localhost:5432/aquaGraph")
_DB_USER     = os.getenv("DB_USER", "postgres")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "mysecretpassword")

# One-shot lock so we don't race on the CREATE TABLE between threads.
_SCHEMA_LOCK = threading.Lock()
_SCHEMA_READY = False


def _conn():
    return psycopg2.connect(_DB_URL, user=_DB_USER or None,
                            password=_DB_PASSWORD or None)


def _ensure_schema():
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS report_jobs (
                    id            BIGSERIAL PRIMARY KEY,
                    kind          VARCHAR(64) NOT NULL,
                    params        JSONB NOT NULL,
                    email         VARCHAR(255) NOT NULL,
                    username      VARCHAR(255),
                    status        VARCHAR(16) NOT NULL DEFAULT 'pending',
                    error_message TEXT,
                    progress      VARCHAR(255),
                    result_kb     INT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    started_at    TIMESTAMPTZ,
                    finished_at   TIMESTAMPTZ
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS report_jobs_username_idx
                  ON report_jobs(username, created_at DESC)
            """)
        _SCHEMA_READY = True


# Registry: kind -> callable(job_id, params) -> None.
# Workers update progress / status through helper functions in this module.
_HANDLERS: dict[str, Callable] = {}


def register_handler(kind: str, fn: Callable):
    """Register a handler function for a job kind. Called once at import
    time from the module that implements the work."""
    _HANDLERS[kind] = fn


def enqueue(kind: str, params: dict, email: str, username: Optional[str] = None) -> int:
    """Insert a job row and kick off a worker thread for it. Returns the
    new job_id. Caller can poll /api/jobs/<id> to track status, but the
    end-user experience is "we'll email you when it's done"."""
    _ensure_schema()
    if kind not in _HANDLERS:
        raise ValueError(f"unknown job kind: {kind}")
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO report_jobs (kind, params, email, username) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (kind, json.dumps(params), email, username),
        )
        job_id = cur.fetchone()[0]
    t = threading.Thread(target=_run_job, args=(job_id,), daemon=True,
                          name=f"job-{kind}-{job_id}")
    t.start()
    logger.info("enqueued job_id=%s kind=%s email=%s", job_id, kind, email)
    return job_id


def _run_job(job_id: int):
    """Worker entrypoint. Loads the row, marks running, invokes the
    registered handler, captures the outcome on the row."""
    try:
        with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE report_jobs SET status='running', started_at=NOW() "
                "WHERE id=%s RETURNING kind, params, email, username", (job_id,),
            )
            row = cur.fetchone()
        if row is None:
            logger.error("job_id=%s vanished before pickup", job_id)
            return
        kind = row["kind"]
        params = row["params"] if isinstance(row["params"], dict) \
                                else json.loads(row["params"])
        handler = _HANDLERS.get(kind)
        if handler is None:
            _mark_failed(job_id, f"no handler registered for {kind}")
            return
        # Hand control to the registered handler. It may call set_progress()
        # / mark_done() / mark_failed() on its own, but the wrapper here
        # also catches exceptions and ensures the row never sticks in
        # 'running'.
        handler(job_id, params, email=row["email"], username=row["username"])
        # If the handler didn't already finalise, default to done.
        with _conn() as c, c.cursor() as cur:
            cur.execute(
                "UPDATE report_jobs SET status='done', finished_at=NOW() "
                "WHERE id=%s AND status='running'", (job_id,),
            )
    except Exception as e:
        logger.exception("job_id=%s failed", job_id)
        _mark_failed(job_id, f"{type(e).__name__}: {e}",
                     trace=traceback.format_exc())


def set_progress(job_id: int, message: str):
    """Workers call this between phases (e.g. 'rendering thumbnails')."""
    with _conn() as c, c.cursor() as cur:
        cur.execute("UPDATE report_jobs SET progress=%s WHERE id=%s",
                    (message[:255], job_id))


def mark_done(job_id: int, result_kb: Optional[int] = None):
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE report_jobs SET status='done', finished_at=NOW(), "
            "  result_kb=%s WHERE id=%s",
            (result_kb, job_id),
        )


def _mark_failed(job_id: int, message: str, trace: Optional[str] = None):
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE report_jobs SET status='failed', finished_at=NOW(), "
            "  error_message=%s WHERE id=%s",
            (message + ("\n\n" + trace if trace else ""), job_id),
        )


def mark_failed(job_id: int, message: str):
    _mark_failed(job_id, message)


def get_job(job_id: int) -> Optional[dict]:
    _ensure_schema()
    with _conn() as c, c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT id, kind, status, progress, error_message, "
            "       result_kb, email, username, "
            "       created_at, started_at, finished_at "
            "FROM report_jobs WHERE id=%s", (job_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None
