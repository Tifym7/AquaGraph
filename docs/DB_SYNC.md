# Syncing historical satellite data between databases

How to move the per-segment satellite history (the data behind the river
timeline, evolution charts and PDF reports) between environments — typically
**local dev → production VM**, occasionally **prod → local** for debugging.

---

## 1. What is synced (and what is not)

Only the two time-series tables are transferred:

| Table | Why |
|---|---|
| `satellite_observation` | the per-`(object_id, sensor, acquired_at)` history |
| `ingestion_run` | per-run audit / watermark (so incremental ingest resumes correctly) |

**Deliberately NOT synced:**

- `users`, `pending_user_verifications`, `campaigns`, `campaign_participants`
  — these are owned by each environment; overwriting prod users/campaigns with
  dev data would be destructive.
- `data/rivers_romania.json`, the tile pyramid, `segments_lod_*.json` — these
  are **derived** from the DB. Don't copy them; regenerate on the target with
  `ingest.snapshot` (see step 4).

Because we only move numeric per-segment values (no geometry, no rasters), a
multi-month dump is **tens of MB compressed** — trivial to `scp`.

---

## 2. Topology & the one constraint that matters

| | Local dev | Production VM |
|---|---|---|
| Compose file | `docker-compose.yml` | `docker-compose.prod.yml` |
| Postgres image | `postgres:16-alpine` | `postgres:16-alpine` |
| Host port | **published** `5432:5432` | **NOT published** (compose-network only) |
| Creds | `user` / `password` | `${DB_USER}` / `${DB_PASSWORD}` from `.env` |

Same Postgres **major version (16)** both sides → custom-format dumps are
fully compatible.

**The constraint:** prod Postgres is intentionally *not* reachable from the
VM host or the internet (no `ports:` in `docker-compose.prod.yml`). So the
restore **must be executed inside / against the `db` container on the VM** —
you cannot `pg_restore` to it remotely. The commands below do exactly that.

---

## 3. Full refresh (recommended — simple, data is small)

Replaces the two tables on the target with the source's. Idempotent
(`--clean --if-exists`), safe to re-run, never touches users/campaigns.

### 3a. Dump on the source (container-side — no host `pg_dump` needed)

Local dev:

```bash
docker compose exec -T db pg_dump -U user -d aquagraph \
  --format=custom --compress=9 --no-owner --no-privileges \
  --table=satellite_observation --table=ingestion_run \
  > aquagraph_timeseries.dump
```

(Equivalent helper, if you have a host Postgres client and the port is
reachable: `SRC_DB_URL=postgresql://user:password@localhost:5432/aquagraph
scripts/dump_timeseries.sh`.)

### 3b. Copy to the VM

```bash
scp aquagraph_timeseries.dump <vm-user>@<vm-host>:~/
```

> Put it in `~`, **not** the repo checkout — the deploy GitHub Action runs
> `git reset --hard origin/deploy` and would delete untracked files there.

### 3c. Restore on the VM, inside the prod `db` container

```bash
# on the VM, from the repo directory (where docker-compose.prod.yml lives)
cat ~/aquagraph_timeseries.dump | docker compose -f docker-compose.prod.yml \
  exec -T db pg_restore -U "$DB_USER" -d aquagraph \
  --clean --if-exists --no-owner --no-privileges
```

`$DB_USER` comes from the VM's `.env`. The tables are dropped & recreated
from the dump; the app's lazy `ensure_schema` having already created empty
tables is fine.

### 3d. (optional) Refresh the base map from the restored data

DB-backed features (timeline, charts, PDF) are **live immediately** — no
restart needed. Only the zoomed-out raster tiles / startup snapshot are stale:

```bash
# on the VM
docker compose -f docker-compose.prod.yml exec -T app \
  python -m ingest.snapshot            # rebuild rivers_romania.json
# add --tiles to also regenerate the tile pyramid (heavier), then:
docker compose -f docker-compose.prod.yml restart app
```

---

## 4. Incremental top-up (for ongoing, large histories)

When the target already has most data and you only want to add newer rows,
don't move the whole table. `satellite_observation` has
`UNIQUE (object_id, sensor, acquired_at)`, so an upsert is safe.

### 4a. Export only new rows on the source (CSV of a filtered query)

```bash
docker compose exec -T db psql -U user -d aquagraph -c \
  "\copy (SELECT object_id,river_id,sensor,acquired_at,metrics,risk
          FROM satellite_observation
          WHERE acquired_at > '2026-04-30') TO STDOUT WITH (FORMAT csv)" \
  > new_rows.csv
```

(Use the target's current `max(acquired_at)` as the cutoff — see Troubleshooting.)

### 4b. Load + upsert on the VM via a staging table

```bash
scp new_rows.csv <vm-user>@<vm-host>:~/

# on the VM
cat ~/new_rows.csv | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$DB_USER" -d aquagraph -v ON_ERROR_STOP=1 -c "
    CREATE TEMP TABLE _stage (LIKE satellite_observation INCLUDING DEFAULTS);
    \copy _stage(object_id,river_id,sensor,acquired_at,metrics,risk) FROM STDIN WITH (FORMAT csv)
    INSERT INTO satellite_observation
      (object_id,river_id,sensor,acquired_at,metrics,risk)
    SELECT object_id,river_id,sensor,acquired_at,metrics,risk FROM _stage
    ON CONFLICT (object_id,sensor,acquired_at) DO UPDATE
      SET metrics = EXCLUDED.metrics,
          risk    = EXCLUDED.risk,
          river_id = COALESCE(EXCLUDED.river_id, satellite_observation.river_id),
          ingested_at = NOW();
  "
```

This mirrors `ingest/db.py:upsert_observations`, so re-running is harmless.

---

## 5. Reverse direction (prod → local, for debugging)

Symmetric — swap source/target:

```bash
# pull prod history down (run on the VM)
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$DB_USER" \
  -d aquagraph --format=custom --compress=9 --no-owner --no-privileges \
  --table=satellite_observation --table=ingestion_run > prod_timeseries.dump
# scp it back, then restore into the local container:
cat prod_timeseries.dump | docker compose exec -T db \
  pg_restore -U user -d aquagraph --clean --if-exists --no-owner --no-privileges
```

---

## 6. The better long-term answer: don't sync at all

The VM (4 CPU / 8 GB) can run the ingestion scheduler itself, so prod
populates **directly from Earth Engine** and the two DBs never need
reconciling:

```bash
# on the VM
GEE_KEY_FILE=/abs/path/aquagraph-gee-key.json \
  docker compose -f docker-compose.prod.yml --profile ingest up -d --build ingest
```

The dump/restore above is then only a **one-time seed** of the demo backfill
you already pulled locally; afterwards the scheduler keeps prod fresh on its
cron. The Postgres named volume persists across `deploy`-branch deploys, so
the seed survives every redeploy — you do it once.

---

## 7. Safety & idempotency

- `--clean --if-exists` only drops/recreates `satellite_observation` and
  `ingestion_run`. Users, campaigns, auth tables are untouched.
- `UNIQUE (object_id, sensor, acquired_at)` makes both full restore and
  incremental upsert safe to repeat — no duplicate rows.
- The GitHub Action deploys **code/image, not data**; the `aquagraph-pgdata`
  volume is independent of deploys.
- Never commit `.dump` files; keep them out of the repo checkout on the VM.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `relation "satellite_observation" does not exist` on restore | Target schema not bootstrapped. Start the app once (lazy `ingest/schema.py` creates it) or apply `backend/migrations/002_timeseries.sql`. `--clean --if-exists` then succeeds. |
| `pg_restore: unsupported version` | Source/target Postgres major versions differ. Both must be 16 (they are by default). Re-dump from the matching version. |
| `permission denied` | Use the DB owner (`$DB_USER` on prod, `user` locally). `--no-owner --no-privileges` already strips ownership from the dump. |
| Restore "hangs" | Prod DB isn't host-published — you ran `pg_restore` against a host port that doesn't exist. Run it **inside the container** as in §3c. |
| Need the incremental cutoff date | `docker compose -f docker-compose.prod.yml exec -T db psql -U "$DB_USER" -d aquagraph -tc "SELECT max(acquired_at) FROM satellite_observation;"` |

---

See also: `docs/PIPELINE.md` (architecture), `scripts/dump_timeseries.sh`,
`scripts/restore_timeseries.sh`.
