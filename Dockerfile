# Single-image AquaGraph build: backend (Flask) + frontend (Vite dev server)
# in one container. Postgres runs as its own service via docker-compose.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

# ----- system prerequisites -------------------------------------------------
# - build-essential / libpq-dev: psycopg2 native build
# - libeccodes-dev / libeccodes-tools: cfgrib (EFAS GRIB ingestion)
# - gdal-bin / libgdal-dev: pyogrio + geopandas geospatial I/O
# - postgresql-client: pg_isready healthcheck in start.sh
# - nodejs 20.x: frontend dev server
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libeccodes-dev libeccodes-tools \
        gdal-bin libgdal-dev \
        libpq-dev postgresql-client \
        curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ----- python deps (cached layer) ------------------------------------------
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# ----- frontend deps (cached layer) ----------------------------------------
COPY frontend/package.json frontend/package-lock.json* /app/frontend/
RUN cd /app/frontend && npm install

# ----- application code -----------------------------------------------------
COPY backend  /app/backend
COPY frontend /app/frontend

# Vite + Flask must bind to all interfaces so the host can reach them.
ENV HOST=0.0.0.0

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 5000 5173

CMD ["/usr/local/bin/start.sh"]
