#!/usr/bin/env bash
# Standalone 3-year history backfill (run this separately - it is long-running;
# S1 is hours on the free Earth Engine tier). Safe to Ctrl-C and re-run: each
# (sensor, month) already present is skipped.
#
# Usage:
#   export GEE_SERVICE_ACCOUNT_KEY=$HOME/aquagraph-gee-key.json
#   export DB_URL=postgresql://user:password@localhost:5432/aquagraph
#   scripts/backfill.sh                # 3y, S2 then S1, then rebuild snapshot
#   YEARS=2 SENSORS=S2 scripts/backfill.sh
#
# Resume after a reboot: just run it again.

set -euo pipefail

YEARS="${YEARS:-3}"
MONTHS="${MONTHS:-}"          # if set, overrides YEARS (e.g. MONTHS=6)
SENSORS="${SENSORS:-S2,S1}"
REGEN_TILES="${REGEN_TILES:-0}"   # 1 = also rebuild the heavy tile pyramid

cd "$(dirname "$0")/.."/backend

: "${GEE_SERVICE_ACCOUNT_KEY:?set GEE_SERVICE_ACCOUNT_KEY to the SA key path}"
: "${DB_URL:?set DB_URL to the Postgres connection string}"
export GEE_PROJECT="${GEE_PROJECT:-cassini2026}"
export GEE_ASSET_RIVERS="${GEE_ASSET_RIVERS:-projects/cassini2026/assets/eu-hydro}"
# S1 is heavy on the free tier - smaller chunks avoid compute timeouts.
export INGEST_FETCH_CHUNK="${INGEST_FETCH_CHUNK:-1500}"

if [ -n "$MONTHS" ]; then
  echo ">> Backfilling last ${MONTHS} months of ${SENSORS} into ${DB_URL%%\?*}"
  python3 -m ingest.cli backfill --months "$MONTHS" --sensors "$SENSORS"
else
  echo ">> Backfilling ${YEARS}y of ${SENSORS} into ${DB_URL%%\?*}"
  python3 -m ingest.cli backfill --years "$YEARS" --sensors "$SENSORS"
fi

echo ">> Rebuilding map snapshot from latest DB values"
if [ "$REGEN_TILES" = "1" ]; then
  python3 -m ingest.cli snapshot --tiles
else
  python3 -m ingest.cli snapshot
  echo "   (snapshot JSON rebuilt; run with REGEN_TILES=1 to also rebuild tiles)"
fi

echo ">> Done. Restart the Flask app to load the refreshed snapshot."
