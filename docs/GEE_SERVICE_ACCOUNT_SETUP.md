# Setting up GEE for unattended auth - **zero-budget / no billing**

The notebooks use interactive `ee.Authenticate()`. A background service cannot
do that - it needs a **service account** with a JSON key, on a Cloud project
registered for Earth Engine under the **free noncommercial** plan.

**No billing account is attached** - so Cloud Storage (GCS) and
`Export.*.toCloudStorage/toDrive` are NOT used. The pipeline pulls data with
free chunked `getDownloadURL` instead. Creating a service account and an IAM
key is **free** (IAM has no billing requirement). Do this **once**.

## 1. Register the project for Earth Engine (noncommercial, free)

- Go to https://code.earthengine.google.com/register
- Choose the existing project `cassini2026`.
- Select **"Unpaid usage - Noncommercial / Research"**.
  (This is the free tier; it does **not** require a billing account.)
- Ensure the Earth Engine API is enabled for the project:
  https://console.cloud.google.com/apis/library/earthengine.googleapis.com

> If the console blocks API enablement asking for billing, use the Earth Engine
> registration page above - the noncommercial path enables the API without it.

## 2. Create the service account (free)

```bash
gcloud config set project cassini2026

gcloud iam service-accounts create aquagraph-ingest \
  --display-name="AquaGraph ingestion worker"
```

Email: `aquagraph-ingest@cassini2026.iam.gserviceaccount.com`

## 3. Grant the roles it needs (no Storage role - GCS unused)

```bash
SA=aquagraph-ingest@cassini2026.iam.gserviceaccount.com

# Use Earth Engine.
gcloud projects add-iam-policy-binding cassini2026 \
  --member="serviceAccount:$SA" --role="roles/earthengine.writer"

# REQUIRED: lets the SA consume the project's enabled APIs. Without this,
# ee.Initialize fails with "Caller does not have required permission to use
# project ... roles/serviceusage.serviceUsageConsumer".
gcloud projects add-iam-policy-binding cassini2026 \
  --member="serviceAccount:$SA" --role="roles/serviceusage.serviceUsageConsumer"
```

> IAM propagation can take a few minutes after granting.

## 4. Register the service account with Earth Engine

GEE requires the service account to be explicitly enrolled:

- https://signup.earthengine.google.com/#!/service_accounts
- Register `aquagraph-ingest@cassini2026.iam.gserviceaccount.com` under the
  `cassini2026` project.

## 5. Create and download the key (free)

```bash
gcloud iam service-accounts keys create ~/aquagraph-gee-key.json \
  --iam-account=aquagraph-ingest@cassini2026.iam.gserviceaccount.com
```

> ⚠️ Secret. Never commit it. Lives only on the worker host.

## 6. Wire it into the pipeline

On the worker host (see `backend/ingest/config.py` / `.env`):

```bash
GEE_SERVICE_ACCOUNT_KEY=/secrets/aquagraph-gee-key.json
GEE_PROJECT=cassini2026
GEE_ASSET_RIVERS=projects/cassini2026/assets/eu-hydro
DB_URL=postgresql://USER:PASS@DB_HOST:5432/aquagraph
# No GCS_* vars - export transport is free getDownloadURL.
```

## 7. Verify

```bash
python -m backend.ingest.cli check-auth
# → "EE initialized as aquagraph-ingest@... (noncommercial) | DB reachable"
```

## Fallback if a service-account key cannot be created

Some orgs disable SA key creation. Then use a **persisted user refresh token**:

```bash
earthengine authenticate --quiet     # one-time, on the worker
# token is written to ~/.config/earthengine/credentials and reused unattended
```

Set `GEE_USE_PERSISTED_CREDENTIALS=1` and omit `GEE_SERVICE_ACCOUNT_KEY`. The
pipeline will `ee.Initialize()` from the stored credentials. Refresh tokens are
long-lived but can expire - `check-auth` will flag it so you can re-run
`earthengine authenticate`.

## Notes
- Notebooks keep interactive auth for research; only the worker uses this.
- `*-gee-key.json` / `secrets/` are git-ignored (added in Phase 1).
- No bucket, no billing, no recurring cost - all within the EE free tier.
