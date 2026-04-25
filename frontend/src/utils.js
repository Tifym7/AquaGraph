import axios from 'axios'

const API_BASE = 'http://127.0.0.1:5000/api'

/**
 * Fetch rivers from the backend API.
 * @param {number} currentZoom - The current zoom level of the map
 * @param {Object} mapBounds - Leaflet Bounds object
 */
export async function fetchRivers(currentZoom = 7, mapBounds = null) {
  try {
    const params = { zoom: currentZoom }
    if (mapBounds) {
      params.bbox = `${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}`
    }
    const response = await axios.get(`${API_BASE}/rivers`, { params })
    return response.data.rivers
  } catch (error) {
    console.error('Failed to fetch rivers:', error)
    return []
  }
}

/**
 * Fetch a single river by ID from the backend API.
 */
export async function fetchRiver(riverId) {
  try {
    const response = await axios.get(`${API_BASE}/rivers/${riverId}`)
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

export async function fetchNews() {
  try {
    const response = await axios.get(`${API_BASE}/news`)
    return response.data.articles || []
  } catch (error) {
    console.error('Failed to fetch news:', error)
    return []
  }
}