import axios from 'axios'

const API_BASE = 'http://localhost:5000/api'

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
  let r, g, b

  if (t < 0.25) {
    const p = t / 0.25
    r = Math.round(16 + p * (132 - 16))
    g = Math.round(185 + p * (204 - 185))
    b = Math.round(129 + p * (22 - 129))
  } else if (t < 0.5) {
    const p = (t - 0.25) / 0.25
    r = Math.round(132 + p * (245 - 132))
    g = Math.round(204 + p * (158 - 204))
    b = Math.round(22 + p * (11 - 22))
  } else if (t < 0.75) {
    const p = (t - 0.5) / 0.25
    r = Math.round(245 + p * (239 - 245))
    g = Math.round(158 + p * (68 - 158))
    b = Math.round(11 + p * (68 - 11))
  } else {
    const p = (t - 0.75) / 0.25
    r = Math.round(239 + p * (153 - 239))
    g = Math.round(68 + p * (27 - 68))
    b = Math.round(68 + p * (27 - 68))
  }

  return `rgb(${r}, ${g}, ${b})`
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
