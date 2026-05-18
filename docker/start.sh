#!/bin/sh
# Container entrypoint: wait for postgres, then run the Flask app under
# gunicorn in the foreground. Gunicorn serves BOTH the JSON API and the
# built React frontend (see backend/app.py:serve_frontend), so this single
# process on :5000 is the whole web tier.
#
# Tunables (env):
#   GUNICORN_WORKERS  worker processes (default 1 - sized for a 1 GB VM;
#                     each worker loads the river JSON into memory, so more
#                     workers cost real RAM)
#   GUNICORN_THREADS  threads per worker (default 4 - handles concurrent
#                     tile/segment requests without extra memory)
#   GUNICORN_TIMEOUT  worker boot/request timeout (default 300 - importing
#                     app.py loads several large JSON datasets and can take
#                     >120s on a small VM; too low here = the arbiter SIGKILLs
#                     the still-booting worker and respawns it forever)

set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-user}"
GUNICORN_WORKERS="${GUNICORN_WORKERS:-1}"
GUNICORN_THREADS="${GUNICORN_THREADS:-4}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-300}"

echo "[start.sh] Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done
echo "[start.sh] Postgres ready."

cd /app/backend
echo "[start.sh] Starting gunicorn on 0.0.0.0:5000 (${GUNICORN_WORKERS}w/${GUNICORN_THREADS}t)..."
# --preload: import the app once in the master before forking. Loads the
# large datasets a single time (saves RAM when GUNICORN_WORKERS > 1) and,
# combined with the lazy DB schema bootstrap, means a slow DB no longer
# hangs worker boot.
exec gunicorn \
  --bind 0.0.0.0:5000 \
  --workers "$GUNICORN_WORKERS" \
  --threads "$GUNICORN_THREADS" \
  --timeout "$GUNICORN_TIMEOUT" \
  --preload \
  --access-logfile - \
  --error-logfile - \
  app:app
