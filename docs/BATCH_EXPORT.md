# Fast / precise ingestion via GCS batch export

Two transports now coexist - pick per run with `INGEST_TRANSPORT`:

| `INGEST_TRANSPORT` | How | Needs | Speed / scale |
|---|---|---|---|
| `sync` *(default)* | chunked `getDownloadURL` (free) | nothing | OK for demo; ~80 min/month, ~5-min compute cap → coarse scale |
| `gcs` | GEE batch `Export.table.toCloudStorage` → download from a bucket | billing + a GCS bucket | server-side & parallel, **no caps** → 10 m scale, per-pass, many years, far faster |

`sync` is unchanged and remains the default - nothing you run today breaks.
Set `INGEST_TRANSPORT=gcs` only for the heavy precise backfills.

---

## 1. One-time GCS setup (you have billing + a $10 voucher)

```bash
gcloud config set project cassini2026

# Bucket in the EU (near Earth Engine); name is yours, set GCS_BUCKET to it.
gcloud storage buckets create gs://aquagraph-exports-cassini \
  --location=EU --uniform-bucket-level-access

# The ingestion service account must read/write/delete objects.
SA=aquagraph-ingest@cassini2026.iam.gserviceaccount.com   # your SA
gcloud projects add-iam-policy-binding cassini2026 \
  --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"
```

(The SA key is the same one already used for EE - `GEE_SERVICE_ACCOUNT_KEY`.)

---

## 2. Cost - the $10 voucher is plenty (effectively free)

- **Earth Engine compute**: free (noncommercial plan) - batch tasks included.
- **`Export.table.toCloudStorage`**: free (it's an EE export, not a billed API).
- **GCS storage**: the pipeline **deletes each object after ingest**
  (`INGEST_GCS_KEEP=0`, the default), so steady-state storage ≈ 0. Even if
  kept, a multi-year per-segment CSV corpus is ~1–2 GB ≈ a few cents/month.
- **Egress** (downloading the CSVs to the worker): a few hundred MB–~2 GB
  total for years of data → well under $1.

So $10 covers this workload essentially indefinitely. Keep
`INGEST_GCS_KEEP=0` and the EU bucket.

---

## 3. Run it - more precise, more years, faster

Everything downstream (Postgres schema, loader, snapshot, reports, the app)
is identical; only the transport changes. Reuse the same `backfill.sh` /
`cli`, just add the GCS env.

### Precise multi-year monthly composites (recommended first)

```bash
GEE_SERVICE_ACCOUNT_KEY="$HOME/aquagraph-gee-key.json" \
DB_URL="postgresql://user:password@localhost:5432/aquagraph" \
GEE_PROJECT=cassini2026 \
GEE_ASSET_RIVERS=projects/cassini2026/assets/eu-hydro \
INGEST_TRANSPORT=gcs \
GCS_BUCKET=aquagraph-exports-cassini \
INGEST_REDUCE_SCALE=10 \
INGEST_REDUCE_TILESCALE=4 \
YEARS=8 SENSORS=S2 \
bash /home/dlese/work/AquaGraph/scripts/backfill.sh
```

- `INGEST_REDUCE_SCALE=10` → Sentinel-2 native 10 m (vs the demo's 60 m):
  much finer per-segment means. Use `20` for S1.
- `INGEST_REDUCE_TILESCALE=4` → batch has no memory cap, so a low tileScale
  is fine and faster (16 was only needed to survive the free synchronous cap).
- `YEARS=8` → full usable Sentinel-2 SR archive (~2017→now). `SENSORS=S2,S1`
  for both; S1 also wants `INGEST_S1_BASELINE_START/END` covering the event
  months (see `docs/PIPELINE.md` / config.py note).

### Per-pass (finest temporal resolution, for ML)

```bash
# every satellite acquisition, not a monthly median - heavier but batch
# handles it. One export task per pass date.
... same env as above ...
python3 -m ingest.cli backfill --years 5 --sensors S2 --mode pass
```

`backfill` now takes `--mode composite|pass`; `--mode pass` stores one row per
segment **per real acquisition** (`acquired_at` = the pass date).

### Tuning knobs (all env, all optional)

| Var | Default | Meaning |
|---|---|---|
| `INGEST_TRANSPORT` | `sync` | `gcs` to use batch export |
| `GCS_BUCKET` | – | bucket name (required for `gcs`) |
| `GCS_PREFIX` | `aquagraph-exports` | object path prefix |
| `INGEST_REDUCE_SCALE` | `30` | metres; `10` = S2 native (precise) |
| `INGEST_REDUCE_TILESCALE` | `16` | `4` is fine with `gcs` (no mem cap) |
| `INGEST_EXPORT_POLL` | `20` | seconds between task-status polls |
| `INGEST_EXPORT_TIMEOUT` | `10800` | per-window task timeout (s) |
| `INGEST_GCS_KEEP` | `0` | `1` keeps the GCS objects (else deleted) |

---

## 4. Same data, same place

`gcs` writes the **identical** `satellite_observation` rows as `sync` (same
parser, schema, idempotent upsert). So:

- It coexists with already-ingested `sync` data - re-running a window just
  upserts (no duplicates; finer scale overwrites the coarse value for that
  `(object_id, sensor, acquired_at)`).
- Sync to prod with the unchanged `docs/DB_SYNC.md` flow, or run the `gcs`
  backfill directly on the VM (it has billing access via the same SA key).
- The `--profile ingest` scheduler can also use `gcs` - just set
  `INGEST_TRANSPORT=gcs` + `GCS_BUCKET` in its env.

## 5. Verify the setup

```bash
INGEST_TRANSPORT=gcs GCS_BUCKET=aquagraph-exports-cassini \
GEE_SERVICE_ACCOUNT_KEY=$HOME/aquagraph-gee-key.json \
python3 -m ingest.cli check-auth      # EE + asset + DB
# then a 1-month smoke test:
... env ... INGEST_TRANSPORT=gcs GCS_BUCKET=... \
  python3 -m ingest.cli ingest S2 --mode composite \
  --since 2026-05-01 --until 2026-05-31
```

A successful run prints `batch export started … COMPLETED … window done: N rows`.
