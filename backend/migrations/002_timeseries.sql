-- AquaGraph time-series migration (additive; safe to run repeatedly).
-- Stores full per-segment satellite history powering river-evolution graphs,
-- PDF reports, and (later) ML training. See docs/PIPELINE.md §5.

\connect aquagraph

-- One row per (segment, sensor, acquisition). Long/narrow, ML-friendly.
CREATE TABLE IF NOT EXISTS satellite_observation (
    id            BIGSERIAL   PRIMARY KEY,
    object_id     TEXT        NOT NULL,            -- EU-Hydro segment OBJECT_ID
    river_id      TEXT,                            -- denormalized for fast river queries
    sensor        TEXT        NOT NULL,            -- 'S2' | 'S1' | 'ENMAP'
    acquired_at   DATE        NOT NULL,            -- satellite acquisition date
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metrics       JSONB       NOT NULL,            -- {"NDVI":0.4,"MNDWI":0.6,...}
    risk          JSONB,                           -- {"risk_score":..,"risk_level":..}
    CONSTRAINT uq_obs UNIQUE (object_id, sensor, acquired_at)
);

CREATE INDEX IF NOT EXISTS ix_obs_river_time
    ON satellite_observation (river_id, sensor, acquired_at);
CREATE INDEX IF NOT EXISTS ix_obs_object_time
    ON satellite_observation (object_id, sensor, acquired_at);

-- Per-sensor ingestion watermark + run audit.
CREATE TABLE IF NOT EXISTS ingestion_run (
    id            BIGSERIAL   PRIMARY KEY,
    sensor        TEXT        NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    status        TEXT        NOT NULL DEFAULT 'running',  -- running|ok|error
    mode          TEXT,                                    -- pass|composite
    acquired_from DATE,
    acquired_to   DATE,
    segments      INTEGER,
    message       TEXT
);

CREATE INDEX IF NOT EXISTS ix_run_sensor_time
    ON ingestion_run (sensor, started_at DESC);
