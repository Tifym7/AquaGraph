import axios from 'axios'

export const API_BASE = 'http://localhost:5000/api'

/**
 * LOD ladder — must mirror backend/metrics.py:LOD_TIERS so the frontend
 * fetches the same simplified geometry that was painted into the tiles.
 */
export function lodForZoom(zoom) {
  if (zoom < 6) return 1
  if (zoom < 8) return 2
  if (zoom < 10) return 3
  if (zoom < 12) return 4
  return 5
}

/* The zoom snap matches one zoom step per LOD tier so the wheel/-/+ jumps
   directly between detail levels. Even zooms map cleanly to LOD 2..5 plus
   a "very close" extra step (z=14) that uses the same LOD 5 data. */
export const ZOOM_SNAP = 2
export const ZOOM_DELTA = 2
export const ZOOM_MIN = 6
export const ZOOM_MAX = 18 // basemap supports it, vector polylines scale crisp
export const VECTOR_ZOOM_THRESHOLD = 12 // at >= this zoom we render LOD 5 as crisp vectors

/* Below this zoom we don't fetch / mount the click overlay at all — at the
   country-wide view (z=6, 8) the user is browsing the precomputed visual,
   not clicking individual segments, so paying for 18k transparent polylines
   in the DOM (multi-GB RAM, lag on every mousemove) is wasteful. */
export const CLICK_OVERLAY_ZOOM_THRESHOLD = 10

/* At this zoom and above we fetch detailed water polygons for the current
   viewport and render them as actual filled vector shapes (lakes, wide
   river channels). Below this we rely on the rasterized polygon paint. */
export const POLYGON_ZOOM_THRESHOLD = 14

/* Shared metric metadata used by the sidebar's selector and detail labels.
   The full gradient definitions still live next to the rendering layers in
   MapView; here we just need key + display label. */
export const METRIC_LABELS = {
  pollution: 'Pollution Risk',
  risk: 'Risk Score',
  NDVI: 'NDVI (vegetation)',
  MNDWI: 'MNDWI (water)',
  NDCI: 'NDCI (chlorophyll)',
  TURBIDITY: 'Turbidity (sediment)',
  water: 'Water Index',
  land: 'Land Index',
}
export const METRIC_KEYS = ['pollution', 'risk', 'NDVI', 'MNDWI', 'NDCI', 'TURBIDITY', 'water', 'land']

/* Fetch detailed water polygons whose bbox intersects the given Leaflet
   bounds. Each polygon carries `river_id` and the river's `normalized`
   metric value so the frontend can color and route clicks. */
export async function fetchPolygonsInBounds(bounds, metric = 'pollution') {
  if (!bounds) return []
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`
  try {
    const response = await axios.get(`${API_BASE}/polygons`, { params: { bbox, metric } })
    return response.data?.polygons || []
  } catch (error) {
    console.error('Failed to fetch polygons:', error)
    return []
  }
}

/* ---- Metric value + color helpers (mirror backend/metrics.py) ---- */
const METRIC_RANGES = {
  NDVI: [-1, 1], MNDWI: [-1, 1], NDCI: [-1, 1],
  BSI: [-0.5, 0.3], TURBIDITY: [0, 2000],
  water: [0, 2], land: [0, 1], risk: [0, 5], pollution: [0, 5],
}

export function getRawMetricValue(seg, metric) {
  const risk = seg?.risk || {}
  if (metric === 'pollution' || metric === 'risk') return risk.risk_score ?? null
  if (metric === 'water') return risk.water_risk ?? null
  if (metric === 'land') return risk.land_risk ?? null
  const indices = seg?.indices || {}
  const upper = metric.toUpperCase()
  for (const k of Object.keys(indices)) {
    if (k.toUpperCase() === upper) return indices[k]
  }
  return null
}

export function normalizeMetric(raw, metric) {
  if (raw == null || Number.isNaN(raw)) return 0
  const range = METRIC_RANGES[metric]
  if (!range) return 0
  const [lo, hi] = range
  if (hi === lo) return 0.5
  return Math.max(0, Math.min(1, (raw - lo) / (hi - lo)))
}

/**
 * Fetch the precomputed click-overlay segment list for a given LOD tier.
 * One HTTP call per LOD crossing — far cheaper than a per-pan refetch.
 */
export async function fetchSegments(lod = 3) {
  try {
    const response = await axios.get(`${API_BASE}/segments`, { params: { lod } })
    return response.data?.segments || []
  } catch (error) {
    console.error(`Failed to fetch segments for lod=${lod}:`, error)
    return []
  }
}

/**
 * Fetch available metrics from the backend.
 */
export async function fetchMetrics() {
  try {
    const res = await axios.get(`${API_BASE}/metrics`)
    return res.data
  } catch (error) {
    console.error('Failed to fetch metrics:', error)
    return { metrics: {}, default: 'pollution' }
  }
}

/**
 * Fetch rivers from the backend API. Used by the sidebar's top-10 list;
 * the map no longer calls this for visual rendering.
 * @param {number} currentZoom - The current zoom level of the map
 * @param {Object} mapBounds - Leaflet Bounds object
 * @param {string} metric - metric key (default: 'pollution')
 */
export async function fetchRivers(currentZoom = 7, mapBounds = null, metric = 'pollution') {
  try {
    const params = { zoom: currentZoom }
    if (mapBounds) {
      params.bbox = `${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}`
    }
    params.metric = metric
    const response = await axios.get(`${API_BASE}/rivers`, { params })
    const data = response.data  // returns { rivers, metric, metric_label, total }
    /* Cap silently — this endpoint now only powers the sidebar's top-N list,
       so trimming long responses isn't worth a console warning every reload. */
    const MAX_RIVERS = currentZoom < 8 ? 250 : currentZoom < 10 ? 400 : currentZoom < 12 ? 600 : 800
    if (data.rivers && data.rivers.length > MAX_RIVERS) {
      data.rivers = data.rivers.slice(0, MAX_RIVERS)
    }
    return data
  } catch (error) {
    console.error('Failed to fetch rivers:', error)
    return { rivers: [], metric: metric, metric_label: metric }
  }
}

/**
 * Fetch a single river by ID from the backend API.
 * Returns the full record including water_polygons (used by the detail view).
 */
export async function fetchRiver(riverId, metric = 'pollution') {
  try {
    const response = await axios.get(`${API_BASE}/rivers/${riverId}`, { params: { metric } })
    return response.data
  } catch (error) {
    console.error(`Failed to fetch river ${riverId}:`, error)
    return null
  }
}

/**
 * Fetch upstream contributors for a river.
 */
export async function fetchUpstream(riverId) {
  try {
    const response = await axios.get(`${API_BASE}/river/${riverId}/upstream`)
    return response.data.upstream || []
  } catch (error) {
    console.error('Failed to fetch upstream:', error)
    return []
  }
}

/**
 * Fetch downstream chain for a river.
 */
export async function fetchDownstream(riverId) {
  try {
    const response = await axios.get(`${API_BASE}/river/${riverId}/downstream`)
    return response.data.downstream || []
  } catch (error) {
    console.error('Failed to fetch downstream:', error)
    return []
  }
}

export async function fetchNews() {
  try {
    const response = await axios.get(`${API_BASE}/news`)
    return response.data.articles || []
  } catch (error) {
    console.error('Failed to fetch news:', error)
    return []
  }
}

/**
 * Get a color on the green → yellow → red gradient based on pollution level (0-1).
 */
export function getPollutionColor(level) {
  const t = Math.max(0, Math.min(1, level))
  const stops = [
    [30,  100, 255],
    [0,   200, 255],
    [255, 220,   0],
    [255,  80,   0],
    [180,   0,   0],
  ]

  const segment = Math.min(Math.floor(t * 4), 3)
  const p = (t * 4) - segment

  const [r1, g1, b1] = stops[segment]
  const [r2, g2, b2] = stops[segment + 1]

  return `rgb(${Math.round(r1 + p * (r2 - r1))}, ${Math.round(g1 + p * (g2 - g1))}, ${Math.round(b1 + p * (b2 - b1))})`
}

/**
 * Get status badge style for a pollution level.
 */
export function getPollutionStatusStyle(level) {
  const color = getPollutionColor(level)
  return {
    color,
    backgroundColor: `${color}20`,
    border: `1px solid ${color}40`,
  }
}

