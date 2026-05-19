#!/usr/bin/env bash
# Restore the time-series dump onto the target (bigger) server's Postgres.
# The target DB must already have the AquaGraph schema (the app/ingest code
# self-heals it via ingest/schema.py, or apply backend/migrations/002).
#
# Usage:
#   DST_DB_URL=postgresql://user:pass@bigserver:5432/aquagraph \
#     scripts/restore_timeseries.sh aquagraph_timeseries_<ts>.dump
#
# Idempotent-ish: --clean drops the two tables first so a re-run is clean.
# (Does NOT touch users/campaigns/etc.)

set -euo pipefail

DUMP="${1:?usage: restore_timeseries.sh <dumpfile>}"
: "${DST_DB_URL:?set DST_DB_URL to the target Postgres connection string}"

pg_restore \
  --dbname="$DST_DB_URL" \
  --clean --if-exists --no-owner --no-privileges \
  --jobs="${JOBS:-4}" \
  "$DUMP"

echo "Restored $DUMP into ${DST_DB_URL%%\?*}"
echo "Next on the big server:"
echo "  python3 -m ingest.cli snapshot --tiles   # regenerate map snapshot+tiles from the restored history"
echo "  (then restart the Flask app)"
