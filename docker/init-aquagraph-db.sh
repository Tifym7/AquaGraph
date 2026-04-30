#!/bin/bash
# Postgres initdb hook. Runs the project's existing backend/db schema/seed
# script against the auto-created POSTGRES_DB database, stripping the leading
# `CREATE DATABASE aquagraph;` (postgres has already created the DB named in
# POSTGRES_DB, so re-running CREATE DATABASE here would error).

set -e

echo "[init-aquagraph-db] Applying backend/db to database ${POSTGRES_DB}..."

sed -e '/CREATE DATABASE/Id' /aquagraph-db.sql \
  | psql -v ON_ERROR_STOP=1 \
         --username "$POSTGRES_USER" \
         --dbname   "$POSTGRES_DB"

echo "[init-aquagraph-db] Done."
