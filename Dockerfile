# Production AquaGraph image: gunicorn-served Flask backend that also serves
# the pre-built React frontend (one process, one port). Postgres runs as its
# own service via docker-compose.
#
# Stage 1 builds the frontend with Node; Stage 2 is a slim Python runtime
# that copies only the built static files in — no Node, no node_modules, no
# Vite dev server in the final image.

# ----- Stage 1: build the frontend -----------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend

# Deps first for layer caching.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build          # → /app/frontend/dist

# ----- Stage 2: python runtime ---------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

# system prerequisites:
# - build-essential / libpq-dev: native builds (pyogrio, etc.)
# - libeccodes-dev / libeccodes-tools: cfgrib (EFAS GRIB ingestion)
# - gdal-bin / libgdal-dev: pyogrio + geopandas geospatial I/O
# - postgresql-client: pg_isready wait-loop in start.sh
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libeccodes-dev libeccodes-tools \
        gdal-bin libgdal-dev \
        libpq-dev postgresql-client \
        ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ----- python deps (cached layer) ------------------------------------------
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# ----- application code -----------------------------------------------------
# backend/ includes the committed precomputed tiles under backend/data, so
# the image is fully self-contained (no external data store needed).
COPY backend /app/backend

# Built frontend from stage 1 — Flask serves this from /app/frontend/dist.
COPY --from=frontend /app/frontend/dist /app/frontend/dist

ENV HOST=0.0.0.0

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 5000

CMD ["/usr/local/bin/start.sh"]
