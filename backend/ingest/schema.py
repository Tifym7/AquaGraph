"""Canonical time-series DDL + lazy idempotent bootstrap.

Mirrors backend/migrations/002_timeseries.sql and the block appended to
backend/db.sql. Used so both the Flask app (history endpoints) and the
ingestion worker can ensure the tables exist on first use - the prod Postgres
volume already exists, so the initdb hook never re-runs.
"""

DDL = """
CREATE TABLE IF NOT EXISTS satellite_observation (
    id              BIGSERIAL   PRIMARY KEY,
    object_id       TEXT        NOT NULL,
    river_id        TEXT,
    sensor          TEXT        NOT NULL,
    acquired_at     DATE        NOT NULL,
    -- precise scene timestamp (UTC) - for sun-angle / day-vs-night / orbit
    -- features; nullable so legacy date-only rows still load.
    acquired_at_ts  TIMESTAMPTZ,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metrics         JSONB       NOT NULL,
    risk            JSONB,
    CONSTRAINT uq_obs UNIQUE (object_id, sensor, acquired_at)
);
-- Bring existing tables (created before acquired_at_ts) up to schema:
ALTER TABLE satellite_observation
    ADD COLUMN IF NOT EXISTS acquired_at_ts TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_obs_river_time
    ON satellite_observation (river_id, sensor, acquired_at);
CREATE INDEX IF NOT EXISTS ix_obs_object_time
    ON satellite_observation (object_id, sensor, acquired_at);
CREATE INDEX IF NOT EXISTS ix_obs_ts
    ON satellite_observation (acquired_at_ts);
CREATE TABLE IF NOT EXISTS ingestion_run (
    id            BIGSERIAL   PRIMARY KEY,
    sensor        TEXT        NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    status        TEXT        NOT NULL DEFAULT 'running',
    mode          TEXT,
    acquired_from DATE,
    acquired_to   DATE,
    segments      INTEGER,
    message       TEXT
);
CREATE INDEX IF NOT EXISTS ix_run_sensor_time
    ON ingestion_run (sensor, started_at DESC);
"""

_ensured = False


def ensure_schema(conn) -> None:
    """Run the idempotent DDL once per process on an open psycopg2 connection."""
    global _ensured
    if _ensured:
        return
    with conn.cursor() as cur:
        cur.execute(DDL)
    conn.commit()
    _ensured = True
