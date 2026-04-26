#!/bin/sh
# Container entrypoint: wait for postgres, start Flask in the background,
# then keep the Vite dev server in the foreground so the container's lifetime
# tracks the frontend (and we still get Flask logs interleaved on stdout).

set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-user}"

echo "[start.sh] Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done
echo "[start.sh] Postgres ready."

cd /app/backend
echo "[start.sh] Starting Flask backend on 0.0.0.0:5000..."
python3 -c "import app; app.app.run(host='0.0.0.0', port=5000, debug=False)" &
backend_pid=$!

# If Flask dies, take the container down with it.
trap 'kill -TERM "$backend_pid" 2>/dev/null || true' INT TERM

cd /app/frontend
echo "[start.sh] Starting Vite dev server on :5173..."
exec npm run dev -- --host 0.0.0.0 --port 5173
