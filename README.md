# AquaGraph — Satellite Water Pollution Monitor

Built for the **Cassini Hackathon 2026, 11th edition — "Space for Water"**, the
EU-funded challenge to use Copernicus Earth-observation data and Galileo
positioning to protect, monitor, and sustainably manage Europe's water
resources.

## Objective

Monitor pollution across Romania's full river network in near real-time using
fSentinel-1 and Sentinel-2 imagery, making contamination visible to industry,
government, and citizens before it causes irreversible damage.

## What AquaGraph offers

| Interactive river map | Water news feed | Anti-pollution campaigns |
|---|---|---|
| Pollution visualized across the connected river network in real time | Live updates on pollution events and alerts | Tools for communities to act on pollution |
| Upstream sources and downstream impact identified instantly | | Citizens become active environmental contributors |

## Demo

[![AquaGraph demo video](https://img.youtube.com/vi/4jsgAE4RuHs/maxresdefault.jpg)](https://www.youtube.com/watch?v=4jsgAE4RuHs)

Full walkthrough: <https://www.youtube.com/watch?v=4jsgAE4RuHs>

Project page: <https://taikai.network/cassinihackathons/hackathons/space-for-water/projects/cmo4mg9a204jpm5h3ugdajq6w/idea>

## Satellite data

| Source | Use |
|---|---|
| **Sentinel-1** (SAR) | Oil-leak detection on river surfaces |
| **Sentinel-2** (multispectral) | Turbidity (**NDTI**), algae / chlorophyll-a (**NDCI**), riverside vegetation (**NDVI**), water index (**NDWI / MNDWI**) |
| **Copernicus EU-Hydro** | River network geometry and topological connectivity |
| **CEMS Early Warning Data Store (EFAS v5.0)** | Per-river discharge (m³/s) |

## How it works

### Data pipeline

1. **River geometry** is extracted from the Copernicus **EU-Hydro** dataset
   (ESRI FileGDB) with `pyogrio` / `geopandas`. Each river is split into
   segments, and the upstream / downstream graph is built from the dataset's
   topological connectivity.
2. **Pollution indices** are computed per segment from **Sentinel-2** imagery
   (`NDVI`, `MNDWI`, `NDCI`, `BSI`, `NDTI` / TURBIDITY) along with the
   SAR-derived oil-leak signature from **Sentinel-1**. A composite **Pollution
   Risk** score is derived from these indices and attached to each segment.
3. **River discharge** (m³/s) is sampled from the **EFAS v5.0** GRIB forecast
   (`extract_efas_discharge.py`) and joined to each river by ID. Discharge is
   normalized in log10 space so the Danube doesn't crush smaller tributaries
   into the same color band.
4. **Tile precomputation** (`precompute_tiles.py`) bakes per-metric raster
   pyramids and an LOD ladder of segment JSONs (`segments_lod_1..5.json`) so
   the frontend never has to compute colors at runtime.

### Backend (Flask API)

Serves the precomputed tiles, segment LODs, water polygons, river-graph
queries (upstream / downstream), a news feed sourced from Google News RSS,
and an auth + campaigns layer backed by PostgreSQL via `psycopg2`.

### Frontend (React + Vite + Leaflet)

- **Tile pyramid** renders the active metric as a colored raster up to a zoom
  threshold; above it, crisp vector polylines take over.
- **Level-of-Detail (LOD)** selector swaps in simpler geometry at low zooms
  to keep the country-wide view smooth.
- **Sidebar** lists the top-N most affected rivers per metric, with a detail
  panel for satellite indices, risk indicators, and connected (upstream /
  downstream) rivers.
- **Metric switcher**: Pollution Risk, NDVI, MNDWI, NDCI, Turbidity, Oil
  Leakage, Discharge (m³/s).
- **Click-through propagation**: selecting a river highlights where its
  pollution flows downstream.
- **Campaigns and news**: community pages for organizing cleanups and a live
  Romanian water-pollution news feed.

## Docker (one-command setup)

The full stack — PostgreSQL, Flask backend, Vite frontend — is defined in a
single `Dockerfile` and `docker-compose.yml`. Postgres auto-initializes from
`backend/db.sql` on first start; no manual `psql` required.

```bash
docker compose up --build
```

Once running:

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:5000/api>
- Postgres: `localhost:5432` (user `user`, password `password`, database `aquagraph`)

To reset the database and re-run the init script, drop the volume:

```bash
docker compose down -v
docker compose up --build
```

To run the stack directly on the host instead, follow the manual setup below.

## Manual setup

### 0. System prerequisites (Debian / Ubuntu)

A few native libraries are needed before the Python wheels will build and
import correctly: GRIB decoding (`cfgrib` → `eccodes`), geospatial I/O
(`pyogrio` / `geopandas` → `gdal`), and the PostgreSQL client lib used by
`psycopg2`. Node.js and npm are required for the frontend, and PostgreSQL
itself for local auth and campaigns.

```bash
sudo apt update
sudo apt install -y \
  python3 python3-venv python3-dev build-essential \
  libeccodes-dev libeccodes-tools \
  gdal-bin libgdal-dev \
  libpq-dev postgresql \
  nodejs npm
```

> On other distributions, install the equivalents: `eccodes`, `gdal`,
> `libpq`, `nodejs`, and `postgresql`.

### 1. Backend (data processing and API)

The backend serves the topological graph, satellite indices, EFAS discharge,
and the precomputed tile pyramid.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# (Optional) Recompute tiles and LODs from the source data
python3 precompute_tiles.py

# Run the API (port 5000)
python3 app.py
```

Auth and campaigns require a PostgreSQL database. Configure the connection
through environment variables (the same ones the API reads at runtime):

```bash
export DB_URL=postgresql://localhost:5432/aquagraph
export DB_USER=postgres
export DB_PASSWORD=mysecretpassword
```

Bootstrap the database with the project's seed script — `backend/db.sql`
creates the `aquagraph` database (only if it doesn't already exist), all
required tables (users, pending verifications, campaigns, participants),
and seeds a few example campaigns:

```bash
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d postgres -f backend/db.sql
```

The script connects to the `postgres` maintenance database first (so
`CREATE DATABASE` works), then `\connect`s into `aquagraph` for the
schema and seed steps. Override `-h` / add `-p` if your Postgres isn't on
`localhost:5432`.

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install

# Run the development server (port 5173)
npm run dev
```

With both servers running, the app is available at <http://localhost:5173>.
