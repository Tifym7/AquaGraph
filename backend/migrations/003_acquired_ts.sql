-- Add the precise UTC scene timestamp to satellite_observation. Additive,
-- idempotent, non-breaking: legacy rows keep acquired_at_ts NULL; new
-- per-pass ingest rows (sentinel*.window_time_ms via fetch.py / gcs_export.py)
-- carry the median system:time_start of the scenes contributing to the
-- (date) window — used for sun-angle / day-vs-night / orbit ML features.
\connect aquagraph

ALTER TABLE satellite_observation
    ADD COLUMN IF NOT EXISTS acquired_at_ts TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_obs_ts
    ON satellite_observation (acquired_at_ts);
