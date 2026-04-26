# 🛰️ AquaGraph — Satellite Water Pollution Monitor

> **Romania's rivers are polluted. Nobody notices. Until it's too late.**

AquaGraph turns free Copernicus Sentinel-1 / Sentinel-2 imagery and EFAS
hydrological forecasts into a live, interactive monitor for every river in
Romania — making contamination visible to industry, government, and citizens
**before** it causes irreversible damage.

🗺️ **Monitor Pollution** • 💧 **Model River Networks** • 🤝 **Community Hub**

## 🏆 Cassini Hackathon 2026 — 11th edition: "Space for Water"

This project was built for the **Cassini Hackathon 2026, 11th edition –
"Space for Water"**, the EU-funded challenge series asking participants to use
Copernicus Earth-observation data and Galileo positioning to develop solutions
that protect, monitor, and sustainably manage Europe's water resources.

AquaGraph addresses the "Safeguarding water quality" challenge by turning
Sentinel multispectral + SAR data and EFAS forecast outputs into a usable
real-time monitoring tool for rivers across Romania.

## 🎬 Demo

[![AquaGraph demo video](https://img.youtube.com/vi/4jsgAE4RuHs/maxresdefault.jpg)](https://www.youtube.com/watch?v=4jsgAE4RuHs)

▶️ Click the thumbnail above (or open <https://www.youtube.com/watch?v=4jsgAE4RuHs>) to watch the full walkthrough on YouTube.

## ❓ Why does this matter?

| Problem | Consequences | EU Context |
|---|---|---|
| **60%+** of wastewater in Romania is untreated | Fines up to **80,000 RON** per incident | EU funding for water management: **€1.255B (PNRR)** |
| **1,300+** polluted industrial sites | Companies can be held liable even for **upstream pollution they didn't cause** | **CSRD** makes water-impact reporting mandatory |
| **47,000+** inspections per year | | |

## 🎯 Objectives

**Our Aim** — monitor water pollution across Romania's full river network in
near real-time, using free Sentinel-1 & Sentinel-2 satellite data, making
contamination visible to industry, government, and citizens before it causes
irreversible damage.

**The Goal** — become Romania's national water-quality intelligence platform:
- Help **7,000+ companies** meet **CSRD compliance**
- Support government **WFD 2027** reporting
- Empower communities to act through **data-driven cleanup campaigns**

## 💡 How AquaGraph solves this

| 🗺️ Interactive Network River Map | 📰 Latest Water News | 📣 Anti-pollution Campaigns |
|---|---|---|
| Visualize pollution across connected rivers in real time | Stay updated with real-time pollution events and alerts | Empowers communities to detect, report, and act on pollution |
| Identify upstream sources and downstream impact instantly | | Turns citizens into active environmental contributors |

## 🛰️ Satellite data

| Source | Use |
|---|---|
| **Sentinel-1** (SAR) | Oil-leak detection on river surfaces |
| **Sentinel-2** (multispectral) | Turbidity (**NDTI**), algae / chlorophyll-a (**NDCI**), riverside vegetation (**NDVI**), water index (**NDWI / MNDWI**) |
| **Copernicus EU-Hydro** | River network geometry + topological connectivity |
| **CEMS Early Warning Data Store (EFAS v5.0)** | Per-river discharge (m³/s) |

## 🧠 How it works

### Data pipeline

1. **River geometry** is extracted from the Copernicus **EU-Hydro** dataset
   (ESRI FileGDB) with `pyogrio` / `geopandas`. Each river is split into
   segments, and the upstream / downstream graph is built from the dataset's
   topological connectivity.
2. **Pollution indices** are computed per segment from **Sentinel-2** imagery
   (`NDVI`, `MNDWI`, `NDCI`, `BSI`, `NDTI` / TURBIDITY) plus the SAR-derived
   oil-leak signature from **Sentinel-1**. A composite **Pollution Risk**
   score is derived from the indices and attached to each segment.
3. **River discharge** (m³/s) is sampled from the **EFAS v5.0** GRIB forecast
   (`extract_efas_discharge.py`) and joined to each river by ID. Discharge
   is normalized in log10 space so the Danube doesn't crush smaller
   tributaries to the same color.
4. **Tile precomputation** (`precompute_tiles.py`) bakes per-metric raster
   tile pyramids and an LOD ladder of segment JSONs (`segments_lod_1..5.json`)
   so the frontend never has to compute colors live.

### Backend (Flask API)

Serves the precomputed tiles, segment LODs, water polygons, river-graph
queries (upstream / downstream), a news feed (Google News RSS), and auth +
campaigns layer on PostgreSQL via `psycopg2`.

### Frontend (React + Vite + Leaflet)

- **Tile pyramid** renders the active metric as a colored raster up to a
  zoom threshold, then crisp vector polylines take over above it.
- **Level-of-Detail (LOD)** selector swaps in simpler geometry at low zooms
  so the country-wide view stays smooth.
- **Sidebar** shows the top-N most affected rivers per metric, plus a detail
  panel with satellite indices, risk indicators, and connected (upstream /
  downstream) rivers.
- **Metric switcher**: Pollution Risk, NDVI, MNDWI, NDCI, Turbidity, Oil
  leackage, Discharge (m³/s).
- **Click-through propagation**: clicking a river shows where its pollution
  flows next.
- **Campaigns + news**: community pages for organizing cleanups and a live
  Romanian water-pollution news feed.

## 💼 Business Model Canvas

**Customer segments**
Industrial companies (factories, wastewater operators) · Agricultural
enterprises (fertilizer runoff risk) · Water utilities (regional operators) ·
Government agencies (ANAR, Ministry of Environment) · NGOs & citizens.

**Value proposition**
- Avoid fines (up to 80,000 RON per incident)
- Prove **upstream pollution liability**
- Automated **CSRD / ESG** compliance reporting
- Real-time satellite-based monitoring
- Early warning for pollution events

**Key partners**
ESA / Copernicus program · Environmental agencies (ANAR) · NGOs ·
Research institutions · Cloud providers.

**Channels**
B2B SaaS · Government tenders (SICAP) · Partnerships with environmental
agencies · Web dashboard · NGO / community platform.

**Revenue streams**
Monthly / annual SaaS subscriptions (B2B) · Government contracts (B2G) ·
ESA / EU grants (early funding) · Premium analytics features.

## 📈 Scaling the project

- 🌍 Expand coverage to **Europe-wide** river networks
- 📊 Develop deeper pollution analysis & **forecasting models**
- 🧭 Enhance upstream-source identification
- 🤝 Connect with public authorities and industry platforms

## 🚀 Setup

### 0. System prerequisites (Debian / Ubuntu)

A few native libraries are required before the Python wheels will build /
import correctly — GRIB decoding (`cfgrib` → `eccodes`), geospatial I/O
(`pyogrio` / `geopandas` → `gdal`), and the PostgreSQL client lib used by
`psycopg2`. Node.js + npm are needed for the frontend, and PostgreSQL itself
for local auth / campaigns.

```bash
sudo apt update
sudo apt install -y \
  python3 python3-venv python3-dev build-essential \
  libeccodes-dev libeccodes-tools \
  gdal-bin libgdal-dev \
  libpq-dev postgresql \
  nodejs npm
```

> On other distros, install the equivalents: `eccodes`, `gdal`, `libpq`,
> `nodejs`, and `postgresql`.

### 1. Backend (data processing + API)

The backend serves the topological graph, satellite indices, EFAS discharge,
and the precomputed tile pyramid.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# (Optional) Recompute tiles & LODs from the source data
python3 precompute_tiles.py

# Run the API (port 5000)
python3 app.py
```

Optional environment variables (auth + campaigns):

```bash
export DB_URL=postgresql://localhost:5432/aquagraph
export DB_USER=postgres
export DB_PASSWORD=mysecretpassword
```

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install

# Run the development server (port 5173)
npm run dev
```

Once both servers are running, the app is available at
<http://localhost:5173>.

## 🛠️ Tech stack

- **Frontend:** React, Vite, Leaflet, MUI, Axios.
- **Backend:** Python 3.12, Flask, geopandas, pyogrio, shapely, xarray +
  cfgrib, Pillow, NumPy, pandas, psycopg2.
- **Database:** PostgreSQL (campaigns + users).

