# 🛰️ AquaGraph

AquaGraph is an early-stage hackathon project exploring satellite-based monitoring and visualization of topological water pollution.

It features a high-performance interactive map built with React and Leaflet, which dynamically streams real river geometry and flow connectivity data sourced from the Copernicus EU-Hydro dataset via a Python backend.

## 🚀 Setup

### 1. Backend (Data Processing & API)
The backend serves the topological graph and geometry streams. It uses `pyogrio` and `geopandas` for processing ESRI FileGDB data, and `Flask` for the APIs.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run the API (port 5000)
python3 app.py
```

### 2. Frontend (React + Vite)
The front-end handles bounding-box viewport synchronization and real-time level of detail (LOD) rendering.

```bash
cd frontend
npm install

# Run the development server (port 5173)
npm run dev
```

Once both servers are running, the application will be available at `http://localhost:5173`.
