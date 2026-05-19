"""PostgreSQL access for the ingestion pipeline.

Idempotent upsert into satellite_observation (re-running a window is safe)
plus the ingestion_run audit/watermark helpers.
"""

import json
from contextlib import contextmanager
from datetime import date
from typing import Iterable, Optional

import psycopg2
import psycopg2.extras

from . import config
from .schema import ensure_schema


@contextmanager
def connect():
    conn = psycopg2.connect(config.DB_URL)
    try:
        ensure_schema(conn)  # idempotent, one-time per process
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def last_acquired(sensor: str) -> Optional[date]:
    """Watermark: newest acquisition already stored for this sensor."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT max(acquired_at) FROM satellite_observation WHERE sensor = %s",
            (sensor,),
        )
        return cur.fetchone()[0]


def start_run(sensor: str, mode: str, frm: date, to: date) -> int:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingestion_run (sensor, mode, acquired_from, acquired_to) "
            "VALUES (%s,%s,%s,%s) RETURNING id",
            (sensor, mode, frm, to),
        )
        return cur.fetchone()[0]


def finish_run(run_id: int, status: str, segments: int, message: str = "") -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE ingestion_run SET finished_at = NOW(), status = %s, "
            "segments = %s, message = %s WHERE id = %s",
            (status, segments, message[:2000], run_id),
        )


def upsert_observations(rows: Iterable[dict]) -> int:
    """rows: {object_id, river_id, sensor, acquired_at, metrics, risk}.

    Returns number of rows written. ON CONFLICT keeps the latest values for a
    given (object_id, sensor, acquired_at) so retried/overlapping runs are safe.
    """
    payload = [
        (
            r["object_id"], r.get("river_id"), r["sensor"], r["acquired_at"],
            json.dumps(r["metrics"]), json.dumps(r.get("risk")),
        )
        for r in rows
    ]
    if not payload:
        return 0
    with connect() as conn, conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO satellite_observation "
            "(object_id, river_id, sensor, acquired_at, metrics, risk) VALUES %s "
            "ON CONFLICT (object_id, sensor, acquired_at) DO UPDATE SET "
            "metrics = EXCLUDED.metrics, risk = EXCLUDED.risk, "
            "river_id = COALESCE(EXCLUDED.river_id, satellite_observation.river_id), "
            "ingested_at = NOW()",
            payload,
            template="(%s,%s,%s,%s,%s,%s)",
            page_size=1000,
        )
    return len(payload)


def ping() -> bool:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1")
        return cur.fetchone()[0] == 1
