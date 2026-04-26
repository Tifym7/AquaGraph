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
  land: 'Oil leackage',
  discharge: 'Discharge (m³/s)',
}
export const METRIC_KEYS = ['pollution', 'NDVI', 'MNDWI', 'NDCI', 'TURBIDITY', 'land', 'discharge']

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
  // Log10 m³/s: 10⁰=1 (small stream) → 10⁴=10000 (Danube). Matches backend.
  discharge: [0, 4],
}

export function getRawMetricValue(seg, metric) {
  const risk = seg?.risk || {}
  if (metric === 'pollution' || metric === 'risk') return risk.risk_score ?? null
  if (metric === 'water') return risk.water_risk ?? null
  if (metric === 'land') return risk.land_risk ?? null
  if (metric === 'discharge') {
    const d = seg?.discharge
    const v = d && typeof d === 'object' ? d.median_discharge_m3s : d
    if (v == null) return null
    return Math.log10(Math.max(1, v))
  }
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
/**
 * Lightweight: ranked top-N rivers for the sidebar list. Returns river
 * metadata + avg_normalized only — no segments — so it's fast to refetch
 * on every metric change.
 */
export async function fetchTopRivers(metric = 'pollution', limit = 10) {
  try {
    const response = await axios.get(`${API_BASE}/top-rivers`, { params: { metric, limit } })
    return response.data.rivers || []
  } catch (error) {
    console.error('Failed to fetch top rivers:', error)
    return []
  }
}

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
export async function fetchUpstream(riverId, metric = 'pollution') {
  try {
    const response = await axios.get(`${API_BASE}/river/${riverId}/upstream`, { params: { metric } })
    return response.data.upstream || []
  } catch (error) {
    console.error('Failed to fetch upstream:', error)
    return []
  }
}

/**
 * Fetch downstream chain for a river.
 */
export async function fetchDownstream(riverId, metric = 'pollution') {
  try {
    const response = await axios.get(`${API_BASE}/river/${riverId}/downstream`, { params: { metric } })
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
 * Per-metric color gradients — single source of truth shared by the map and sidebar.
 * Order = low → high values. Metric keys must match METRIC_KEYS / backend metric ids.
 */
export const METRIC_GRADIENTS = {
  pollution: ['#4caf50', '#8bc34a', '#ffeb3b', '#ff9800', '#f44335', '#e53935'],
  risk:      ['#4caf50', '#ffeb3b', '#ff9800', '#f44335', '#9c27b0'],
  NDVI:      ['#1e428f', '#00aaff', '#49d0d1', '#74dc23', '#ffc600', '#d40746'],
  MNDWI:     ['#ff5252', '#ffee58', '#4caf50', '#00897b', '#1e428f'],
  NDCI:      ['#4caf50', '#ffeb3b', '#e53935'],
  TURBIDITY: ['#0055cc', '#00aaff', '#49d0d1', '#74dc23', '#ffc600', '#e53935'],
  water:     ['#0055cc', '#00aaff', '#49d0d1'],
  land:      ['#ff9800', '#d4a76a', '#653215'],
  // Trickle → torrent palette: pale cyan for tributaries, deep blue/purple for the Danube.
  discharge: ['#e0f7fa', '#4dd0e1', '#00838f', '#1565c0', '#311b92'],
}

function _hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 }
}

/**
 * Interpolate a color along a gradient stop array for a 0-1 value.
 */
export function gradientColor(value, gradient) {
  const t = Math.max(0, Math.min(1, value))
  const segs = gradient.length - 1
  const idx = Math.min(Math.floor(t * segs), segs - 1)
  const localT = (t * segs) - idx
  const c1 = _hexToRgb(gradient[idx]), c2 = _hexToRgb(gradient[idx + 1])
  return `rgb(${Math.round(c1.r + (c2.r - c1.r) * localT)},${Math.round(c1.g + (c2.g - c1.g) * localT)},${Math.round(c1.b + (c2.b - c1.b) * localT)})`
}

/**
 * Color for a normalized (0-1) value on the given metric — matches the map.
 */
export function getMetricColor(value, metric = 'pollution') {
  const grad = METRIC_GRADIENTS[metric] || METRIC_GRADIENTS.pollution
  return gradientColor(value, grad)
}

/**
 * Backwards-compatible: equivalent to getMetricColor(level, 'pollution').
 */
export function getPollutionColor(level) {
  return getMetricColor(level, 'pollution')
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

