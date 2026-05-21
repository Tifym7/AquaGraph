#!/usr/bin/env bash
# Export ONLY the satellite time-series tables for moving to a bigger server.
# Tiles and rivers_romania.json are NOT dumped - they are derived; regenerate
# them on the target with `python3 -m ingest.cli snapshot --tiles`.
#
# Usage:
#   SRC_DB_URL=postgresql://user:password@localhost:5432/aquagraph \
#     scripts/dump_timeseries.sh   ->  aquagraph_timeseries_<ts>.dump
#
# Custom format (-Fc) is compressed and restores in parallel. Typical size:
# the data is small (numbers only) - ~5-6 GB of table ≈ a far smaller dump.

set -euo pipefail

: "${SRC_DB_URL:?set SRC_DB_URL to the source Postgres connection string}"
OUT="${OUT:-aquagraph_timeseries_$(date +%Y%m%d_%H%M%S).dump}"

pg_dump "$SRC_DB_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --table=satellite_observation \
  --table=ingestion_run \
  --file="$OUT"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
echo "Move it to the new server, then: DST_DB_URL=... scripts/restore_timeseries.sh $OUT"
