import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Polygon as LeafletPolygon, Pane, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  API_BASE, fetchRiver, fetchPolygonsInBounds,
  getRawMetricValue, normalizeMetric,
  ZOOM_SNAP, ZOOM_DELTA, ZOOM_MIN, ZOOM_MAX, VECTOR_ZOOM_THRESHOLD,
  CLICK_OVERLAY_ZOOM_THRESHOLD, POLYGON_ZOOM_THRESHOLD,
  METRIC_GRADIENTS, gradientColor,
} from '../utils'
import duckUrl from '../assets/duck.svg'
import useIsMobile from '../hooks/useIsMobile'

const BASEMAP_OPTIONS = [
  { id: 'carto-light', label: 'Light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://carto.com/">CARTO</a> - © OSM contributors' },
  { id: 'carto-dark', label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://carto.com/">CARTO</a> - © OSM contributors' },
  { id: 'osm-standard', label: 'Standard', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  { id: 'opentopo', label: 'Topo', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> - © OSM contributors' },
  { id: 'carto-voyager', label: 'Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://carto.com/">CARTO</a> - © OSM contributors' },
  { id: 'esri-satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { id: 'esri-natgeo', label: 'NatGeo', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}' },
]

const METRIC_OPTIONS = [
  { key: 'pollution', label: 'Pollution Risk', gradient: METRIC_GRADIENTS.pollution, labels: ['Clean', 'Moderate', 'Critical'] },
  { key: 'NDVI', label: 'NDVI (vegetation)', gradient: METRIC_GRADIENTS.NDVI, labels: ['Low Veg', 'Moderate', 'Dense'] },
  { key: 'MNDWI', label: 'MNDWI (water)', gradient: METRIC_GRADIENTS.MNDWI, labels: ['No Water', 'Moderate', 'High Water'] },
  { key: 'NDCI', label: 'NDCI (chlorophyll)', gradient: METRIC_GRADIENTS.NDCI, labels: ['Low', 'Moderate', 'High'] },
  { key: 'TURBIDITY', label: 'TURBIDITY (sediment)', gradient: METRIC_GRADIENTS.TURBIDITY, labels: ['Clear', 'Moderate', 'High Turbidity'] },
  { key: 'land', label: 'Oil leackage', gradient: METRIC_GRADIENTS.land, labels: ['Low', 'Moderate', 'High'] },
  { key: 'discharge', label: 'Discharge (m³/s)', gradient: METRIC_GRADIENTS.discharge, labels: ['Trickle', 'River', 'Danube'] },
]

const LOD_FADE_MS = 350

function InitialRegionSetter({ initialRegion }) {
  const map = useMap()

  useEffect(() => {
    if (initialRegion) {
      map.setView([initialRegion.lat, initialRegion.lng], initialRegion.zoom, {
        animate: true,
        duration: 1.5
      })
    }
  }, [map, initialRegion])

  return null
}

/* Centralized pane setup: create every custom pane once with the right
   z-index, BEFORE any layer tries to render into them. Doing this via
   react-leaflet's <Pane> JSX has been flaky (style props sometimes get
   ignored on rerender), so we manage it imperatively. */
function MapPanes() {
  const map = useMap()
  useEffect(() => {
    const setup = (name, zIndex, opts = {}) => {
      let pane = map.getPane(name)
      if (!pane) pane = map.createPane(name)
      pane.style.zIndex = String(zIndex)
      if (opts.pointerEvents) pane.style.pointerEvents = opts.pointerEvents
    }
    // Below the default overlayPane (400) so colored centerlines stack on top.
    setup('water-polygons', 380)
    // Above markerPane (600) so highlighted river polygons sit on top of all
    // other vector content (the segments inside use a higher z because their
    // pane is set explicitly).
    setup('selected-river', 620, { pointerEvents: 'none' })
    // Ducks float on top of every vector line - including the highlighted
    // selected-river segments. Sits just under tooltipPane (650).
    setup('ducks-pane', 640, { pointerEvents: 'none' })
  }, [map])
  return null
}

function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [30, 30] }) }, [map, bounds])
  return null
}

/* Fly to the selected river - but ONLY when the selection came from the
   sidebar (top-10 list, upstream / downstream flow links). Map clicks pass
   through `setSelectedRiver` directly without `_flyOnFocus`, so the camera
   stays put. The `selectedRiver._flyOnFocus` flag is the signal. */
function RiverFocus({ selectedRiver }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedRiver?._flyOnFocus) return
    const seg = selectedRiver.selectedSegment
    const bbox = seg?.bbox || selectedRiver.bbox
    if (!bbox) return
    map.flyToBounds(
      [[bbox.min_lat, bbox.min_lon], [bbox.max_lat, bbox.max_lon]],
      { padding: [50, 50], maxZoom: 14, duration: 1.2 }
    )
  }, [map, selectedRiver])
  return null
}

/* Fires once on mount and whenever the user finishes a zoom - pan does NOT
   trigger anything because the visual layer is now a tile pyramid. */
function ZoomReporter({ onZoomChange, onLocalZoomChange }) {
  const map = useMapEvents({
    zoomend: () => {
      const z = map.getZoom()
      onZoomChange(z)
      onLocalZoomChange && onLocalZoomChange(z)
    },
    moveend: () => {
      onLocalZoomChange && onLocalZoomChange(map.getZoom())
    },
  })
  useEffect(() => {
    const z = map.getZoom()
    onZoomChange(z)
    onLocalZoomChange && onLocalZoomChange(z)
  }, [map, onZoomChange, onLocalZoomChange])
  return null
}

/* Reports the current viewport bbox so the high-zoom vector layer can
   filter to only the segments visible right now. */
function ViewportReporter({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
  })
  useEffect(() => { onBoundsChange(map.getBounds()) }, [map, onBoundsChange])
  return null
}

/* Transparent hit-area polyline - the visible color comes from the raster
   tile underneath; this only exists for click + hover routing. */
function RiverHitArea({ segment, onSegmentClick, onSegmentHover, isSelected }) {
  return (
    <Polyline
      positions={segment.coordinates || []}
      pathOptions={{
        color: '#ffffff',
        weight: 18,
        opacity: 0,           // fully invisible by default
        stroke: true,
        lineCap: 'round',
        lineJoin: 'round',
        bubblingMouseEvents: false,
      }}
      eventHandlers={{
        click: () => onSegmentClick(segment),
        mouseover: (e) => {
          e.target.setStyle({ opacity: 0.35, color: '#ffffff', weight: 14 })
          onSegmentHover && onSegmentHover(segment)
        },
        mouseout: (e) => {
          e.target.setStyle({ opacity: 0, weight: 18 })
          onSegmentHover && onSegmentHover(null)
        },
      }}
    />
  )
}

/* High-zoom vector layer: at z >= VECTOR_ZOOM_THRESHOLD the upscaled raster
   tiles look blurry, so we paint LOD 5 segments as crisp visible polylines
   colored by the active metric. Only segments whose bbox intersects the
   current viewport are rendered, keeping draw count manageable. */
function bboxIntersects(segBbox, mapBounds) {
  if (!segBbox || !mapBounds) return false
  const s = mapBounds.getSouth(), n = mapBounds.getNorth()
  const w = mapBounds.getWest(), e = mapBounds.getEast()
  return !(segBbox.max_lon < w || segBbox.min_lon > e ||
    segBbox.max_lat < s || segBbox.min_lat > n)
}


function HighZoomVectorLayer({ segments, mapBounds, metric, isActive, onSegmentClick, onSegmentHover }) {
  const colors = METRIC_OPTIONS.find(m => m.key === metric) || METRIC_OPTIONS[0]
  const gradient = colors.gradient

  const visible = useMemo(() => {
    if (!isActive || !mapBounds) return []
    return segments.filter(s => bboxIntersects(s.bbox, mapBounds))
  }, [segments, mapBounds, isActive])

  if (!isActive) return null

  /* Render directly into Leaflet's default overlayPane. Polygons live in
     a pane with lower zIndex (380), so the colored centerline naturally
     stacks on top of the water-body fill. No custom <Pane> wrapper needed
     here - that was where react-leaflet's style propagation flaked. */
  return (
    <>
      {visible.map((seg) => {
        const raw = getRawMetricValue(seg, metric)
        const norm = normalizeMetric(raw, metric)
        const color = gradientColor(norm, gradient)
        const weight = (seg.strahler || 3) >= 5 ? 4 : 3
        return (
          <Polyline
            key={`vec-${seg.river_id}-${seg.object_id}`}
            positions={seg.coordinates}
            pathOptions={{
              color,
              weight,
              opacity: 0.92,
              lineCap: 'round',
              lineJoin: 'round',
            }}
            eventHandlers={{
              click: () => onSegmentClick(seg),
              mouseover: (e) => {
                e.target.setStyle({ weight: weight + 3, opacity: 1 })
                onSegmentHover && onSegmentHover(seg)
              },
              mouseout: (e) => {
                e.target.setStyle({ weight, opacity: 0.92 })
                onSegmentHover && onSegmentHover(null)
              },
            }}
          />
        )
      })}
    </>
  )
}

/* At very high zoom (z >= POLYGON_ZOOM_THRESHOLD) we paint the actual
   detailed water-body shapes - the raster tiles encode polygons at coarse
   resolution, but here we draw the true outlines as filled vectors so the
   user can see the precise shape of lakes / wide river channels.

   Polygons are interactive and metric-colored. On click we DO NOT trust
   the polygon's pre-mapped river_id (it's a many-to-one mapping that
   often points to a different river than the polyline the user sees
   inside the polygon). Instead we use the click latlng to find the
   closest LOD-5 polyline in the viewport and select that river/segment. */
/* Water bodies render as a soft, neutral blue at z >= POLYGON_ZOOM_THRESHOLD.
   The polygons show the real shape of lakes / wide river channels, while the
   colored polyline on top remains the authoritative metric indicator. */
const POLY_FILL = '#bbdefb'
const POLY_STROKE = '#64b5f6'

function WaterPolygonLayer({ isActive, mapBounds, polys, segments, onSegmentClick, onSegmentHover }) {
  /* Closest-segment search restricted to viewport-visible segments.
     ~hundreds of segments at z=14, comparing every vertex is fine. */
  const findNearestSegment = useCallback((latlng) => {
    if (!latlng || !segments?.length || !mapBounds) return null
    const lat = latlng.lat, lng = latlng.lng
    let best = null
    let bestDist = Infinity
    for (const seg of segments) {
      if (!bboxIntersects(seg.bbox, mapBounds)) continue
      const lines = seg.coordinates || []
      for (const line of lines) {
        for (const pt of line) {
          const dy = pt[0] - lat
          const dx = pt[1] - lng
          const d = dy * dy + dx * dx
          if (d < bestDist) {
            bestDist = d
            best = seg
          }
        }
      }
    }
    return best
  }, [segments, mapBounds])

  const handlePolygonClick = useCallback((e, fallbackRiverId) => {
    const nearest = findNearestSegment(e?.latlng)
    if (nearest) {
      onSegmentClick({ river_id: nearest.river_id, object_id: nearest.object_id })
    } else if (fallbackRiverId) {
      onSegmentClick({ river_id: fallbackRiverId, object_id: null })
    }
  }, [findNearestSegment, onSegmentClick])

  if (!isActive) return null

  return (
    <>
      {polys.map((p) => (
        p.coordinates.map((ring, j) => (
          <LeafletPolygon
            key={`wp-${p.poly_id}-${j}`}
            pane="water-polygons"
            positions={ring}
            pathOptions={{
              color: POLY_STROKE,
              weight: 1,
              opacity: 0.5,
              fillColor: POLY_FILL,
              fillOpacity: 0.22,
              lineCap: 'round',
              lineJoin: 'round',
            }}
            eventHandlers={{
              click: (e) => handlePolygonClick(e, p.river_id),
              mouseover: (e) => {
                e.target.setStyle({ weight: 2, fillOpacity: 0.4 })
                const hovered = findNearestSegment(e.latlng)
                onSegmentHover && onSegmentHover(hovered
                  ? { river_id: hovered.river_id, river_name: hovered.river_name, object_id: hovered.object_id }
                  : { river_id: p.river_id, river_name: p.river_name || p.name, object_id: p.poly_id })
              },
              mouseout: (e) => {
                e.target.setStyle({ weight: 1, fillOpacity: 0.22 })
                onSegmentHover && onSegmentHover(null)
              },
            }}
          />
        ))
      ))}
    </>
  )
}

/* ----- Ducks 🦆 -----
   Pure cuteness layer: at z >= POLYGON_ZOOM_THRESHOLD, place 1-3 ducks on
   each visible water-body polygon that's wide enough to plausibly hold one.
   Each duck drifts slowly along the polyline running through its polygon,
   bobs vertically, and occasionally dashes a bit faster, like a real duck
   playing on the river. Markers are managed imperatively via L.marker so
   the per-frame setLatLng doesn't churn React. */
function isPolygonWideEnough(p) {
  if (!p?.bbox) return false
  // ~0.0005° ≈ 55 m at Romania's latitude - comfortable for a duck.
  const w = p.bbox.max_lon - p.bbox.min_lon
  const h = p.bbox.max_lat - p.bbox.min_lat
  return Math.min(w, h) > 0.0005
}

/* Plain-bbox overlap (NOT a Leaflet bounds - bboxIntersects above expects
   .getSouth() / .getNorth() etc. and would throw on plain objects). */
function bboxesOverlap(a, b) {
  if (!a || !b) return false
  return !(a.max_lon < b.min_lon || a.min_lon > b.max_lon ||
    a.max_lat < b.min_lat || a.min_lat > b.max_lat)
}

function pickPolylineInPolygon(poly, segments) {
  let best = null
  let bestScore = 0
  const pb = poly.bbox
  for (const s of segments) {
    if (!bboxesOverlap(s.bbox, pb)) continue
    const lines = s.coordinates || []
    let inside = 0, totalPts = 0
    for (const line of lines) {
      for (const pt of line) {
        totalPts++
        if (pt[0] >= pb.min_lat && pt[0] <= pb.max_lat &&
          pt[1] >= pb.min_lon && pt[1] <= pb.max_lon) inside++
      }
    }
    if (totalPts < 2) continue
    const score = inside
    if (score > bestScore) { bestScore = score; best = s }
  }
  if (!best) return null
  // Use the longest sub-line of the chosen segment.
  let line = best.coordinates?.[0] || []
  for (const candidate of best.coordinates || []) {
    if (candidate.length > line.length) line = candidate
  }
  return line.length >= 2 ? line : null
}

function sampleLine(line, t) {
  if (!line || line.length < 2) return line?.[0] || [0, 0]
  const total = line.length - 1
  const tt = Math.max(0, Math.min(1, t))
  const pos = tt * total
  const idx = Math.min(Math.floor(pos), total - 1)
  const local = pos - idx
  const a = line[idx], b = line[idx + 1]
  return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local]
}

function lineHeading(line, t) {
  if (!line || line.length < 2) return 0
  const total = line.length - 1
  const idx = Math.min(Math.floor(Math.max(0, Math.min(1, t)) * total), total - 1)
  const a = line[idx], b = line[idx + 1]
  const dy = b[0] - a[0]
  const dx = b[1] - a[1]
  // SVG +x is right, atan2(dy, dx) → degrees with +x as 0; negate dy because
  // screen y grows downward (lat grows upward).
  return Math.atan2(-dy, dx) * 180 / Math.PI
}

function DucksLayer({ isActive, polys, segments, mapBounds }) {
  const map = useMap()
  const markersRef = useRef([])
  const ducksRef = useRef([])
  const rafRef = useRef(null)

  // (Re)build the duck set whenever the visible polygons change.
  // Old ducks scale OUT (CSS transition handles the visual shrink) before
  // their markers are removed; new ducks mount at scale 0 and pop up.
  useEffect(() => {
    // Tear-down: scale current markers to 0 first, then remove after the
    // CSS transition. Anything pre-existing keeps its place during overlap.
    const oldMarkers = markersRef.current
    oldMarkers.forEach(m => {
      const el = m.getElement?.()
      const wrap = el?.querySelector?.('.duck-wrap')
      if (wrap) wrap.style.transform = 'scale(0)'
    })
    setTimeout(() => oldMarkers.forEach(m => m.remove()), 1450)

    markersRef.current = []
    ducksRef.current = []

    if (!isActive || !polys?.length || !segments?.length) return

    const now = performance.now()
    const ducks = []
    const seenLines = new Set()
    for (const poly of polys) {
      if (!isPolygonWideEnough(poly)) continue
      const line = pickPolylineInPolygon(poly, segments)
      if (!line) continue
      const key = `${line[0][0].toFixed(4)},${line[0][1].toFixed(4)}-${line[line.length - 1][0].toFixed(4)},${line[line.length - 1][1].toFixed(4)}`
      if (seenLines.has(key)) continue
      seenLines.add(key)
      const flockSize = 1 + Math.floor(Math.random() * 3) // 1..3
      for (let i = 0; i < flockSize; i++) {
        ducks.push({
          line,
          t: Math.random(),
          dir: Math.random() < 0.5 ? 1 : -1,
          // ~3x slower than before - calm, lazy drift along the river.
          baseSpeed: 0.000007 + Math.random() * 0.0000001,
          bobPhase: Math.random() * Math.PI * 2,
          bobFreq: 0.0018 + Math.random() * 0.001,
          dashUntil: 0,
          nextDashAt: now + 6000 + Math.random() * 10000,
        })
      }
    }
    if (!ducks.length) return

    ducks.forEach(d => {
      const start = sampleLine(d.line, d.t)
      const icon = L.divIcon({
        className: 'duck-icon',
        // Mount at scale(0) so the CSS transition can pop the duck in.
        html: `<div class="duck-wrap" style="transform:scale(0)"><img src="${duckUrl}" alt="" /></div>`,
        iconSize: [90, 66],
        iconAnchor: [45, 33],
      })
      const m = L.marker(start, { icon, interactive: false, pane: 'ducks-pane', keyboard: false })
      m.addTo(map)
      markersRef.current.push(m)
      // Trigger the scale-in on the next frame so the transition fires.
      requestAnimationFrame(() => {
        const el = m.getElement?.()
        const wrap = el?.querySelector?.('.duck-wrap')
        if (wrap) wrap.style.transform = 'scale(1)'
      })
    })
    ducksRef.current = ducks
  }, [isActive, polys, segments, map])

  // Animation loop.
  useEffect(() => {
    if (!isActive) return
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(64, now - last)
      last = now
      ducksRef.current.forEach((d, i) => {
        // Occasional gentle dash - 2.5x speed (was 4x), longer cooldown.
        if (now > d.nextDashAt && d.dashUntil < now) {
          d.dashUntil = now + 700 + Math.random() * 800
          d.nextDashAt = d.dashUntil + 6000 + Math.random() * 12000
        }
        const dashing = now < d.dashUntil
        const speed = d.baseSpeed * (dashing ? 2.5 : 1)
        d.t += d.dir * speed * dt
        if (d.t >= 1) { d.t = 1; d.dir = -1 }
        if (d.t <= 0) { d.t = 0; d.dir = 1 }

        const pos = sampleLine(d.line, d.t)
        const bob = Math.sin(d.bobPhase + now * d.bobFreq) * 0.000018

        const m = markersRef.current[i]
        if (!m) return
        m.setLatLng([pos[0] + bob, pos[1]])

        // Horizontal flip based on the duck's actual east/west motion
        // (no rotation - duck stays upright). Sample the line segment the
        // duck is currently on and check the longitude delta.
        const total = d.line.length - 1
        const segIdx = Math.min(Math.floor(d.t * total), total - 1)
        const a = d.line[segIdx], b = d.line[segIdx + 1]
        const dxWorld = (b[1] - a[1]) * d.dir
        const sx = dxWorld >= 0 ? -1 : 1
        const ds = dashing ? 1.06 : 1
        const el = m.getElement?.()
        if (el) {
          const img = el.querySelector('img')
          if (img) img.style.transform = `scale(${sx * ds}, ${ds})`
        }
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isActive])

  // Final cleanup on unmount.
  useEffect(() => () => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }, [])

  return null
}

/* Renders one LOD tier's click overlay inside its own pane. Only segments
   whose bbox intersects the current viewport are mounted as DOM nodes -
   without this, an 18k-segment LOD would create 18k SVG paths and event
   listeners on every load (multi-GB RAM, frame drops on every mousemove). */
function LodOverlay({ tier, segments, mapBounds, isActive, onSegmentClick, onSegmentHover }) {
  if (!isActive) return null

  const visible = mapBounds ? segments.filter(s => bboxIntersects(s.bbox, mapBounds)) : []

  /* Click hit areas live in the default overlayPane along with the colored
     polylines - they're transparent so they don't visually conflict, and
     pointer-events: stroke (in CSS) makes them clickable anyway. */
  return (
    <>
      {visible.map((seg) => (
        <RiverHitArea
          key={`${seg.river_id}-${seg.object_id}`}
          segment={seg}
          onSegmentClick={onSegmentClick}
          onSegmentHover={onSegmentHover}
        />
      ))}
    </>
  )
}

/* Below CLICK_OVERLAY_ZOOM_THRESHOLD we don't render any LOD panes - there
   is nothing in the DOM at all. Above the threshold, only the active tier
   mounts viewport-filtered segments. */
function LodTransitioner({ segmentLods, activeLod, mapBounds, mountThresholdReached, onSegmentClick, onSegmentHover }) {
  if (!mountThresholdReached) return null
  return (
    <LodOverlay
      key={activeLod}
      tier={activeLod}
      segments={segmentLods[activeLod] || []}
      mapBounds={mapBounds}
      isActive
      onSegmentClick={onSegmentClick}
      onSegmentHover={onSegmentHover}
    />
  )
}

function SelectedRiverOverlay({ river, metric }) {
  if (!river) return null
  const colors = METRIC_OPTIONS.find(m => m.key === metric)
  const accent = colors?.gradient?.[Math.min(3, (colors.gradient.length - 1))] || '#1565c0'

  const polygons = river.water_polygons || []
  /* When a specific segment is selected, only highlight that one - the
     rest of the river stays visually represented by the underlying tile
     pyramid / vector layer, but the focus is on the clicked segment. */
  const allSegments = river.segments || []
  const segments = river.selectedSegment
    ? allSegments.filter(s => s.object_id === river.selectedSegment.object_id)
    : allSegments

  return (
    <>
      {polygons.map((rings, i) => (
        rings.map((ring, j) => (
          <LeafletPolygon
            key={`poly-${i}-${j}`}
            pane="selected-river"
            positions={ring}
            interactive={false}
            pathOptions={{
              color: accent, weight: 1.5,
              fillColor: accent, fillOpacity: 0.25,
              opacity: 0.9,
              interactive: false,
            }}
          />
        ))
      ))}
      {segments.map((seg) => (
        <Polyline
          key={`sel-${seg.object_id}`}
          pane="selected-river"
          positions={seg.coordinates || []}
          interactive={false}
          pathOptions={{
            color: seg.color || accent,
            weight: 6,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
          }}
        />
      ))}
    </>
  )
}

const ROMANIA_CENTER = [45.9432, 24.9668]
const ROMANIA_BOUNDS = [[43.5, 20.2], [48.3, 30.0]]

export default function MapView({ segmentLods, activeLod, selectedRiver, onRiverSelect, onZoomChange, metric, onMetricChange, initialRegion }) {
  const isMobile = useIsMobile()
  const [activeBaseMap, setActiveBaseMap] = useState('carto-light')
  const [hoveredSegment, setHoveredSegment] = useState(null)
  const [riverDetail, setRiverDetail] = useState(null)
  const [localZoom, setLocalZoom] = useState(8)
  const [mapBounds, setMapBounds] = useState(null)
  const current = BASEMAP_OPTIONS.find(b => b.id === activeBaseMap) || BASEMAP_OPTIONS[0]
  const selected = METRIC_OPTIONS.find(m => m.key === metric) || METRIC_OPTIONS[0]
  const inVectorMode = localZoom >= VECTOR_ZOOM_THRESHOLD
  const clickOverlayActive = localZoom >= CLICK_OVERLAY_ZOOM_THRESHOLD && !inVectorMode
  const polygonLayerActive = localZoom >= POLYGON_ZOOM_THRESHOLD

  /* Polygon set (water-body shapes) - shared between WaterPolygonLayer
     (renders) and DucksLayer (places little quackers on wide rivers). */
  const [polys, setPolys] = useState([])
  const polyReqIdRef = useRef(0)
  useEffect(() => {
    if (!polygonLayerActive || !mapBounds) {
      setPolys([])
      return
    }
    const myId = ++polyReqIdRef.current
    fetchPolygonsInBounds(mapBounds, metric).then((p) => {
      if (myId !== polyReqIdRef.current) return
      setPolys(p)
    })
  }, [polygonLayerActive, mapBounds, metric])

  /* When a segment is clicked, fetch the full river detail (incl. polygons)
     and merge in the clicked segment's data. We carry the LOD-5 bbox over
     onto the matched detail segment so RiverFocus can fly to the *segment*
     instead of the entire river. */
  const handleSegmentClick = useCallback(async (segment) => {
    if (!segment?.river_id) return
    const detail = await fetchRiver(segment.river_id, metric)
    if (!detail) return
    const matched = detail.segments?.find(s => s.object_id === segment.object_id)
    /* A single-segment river IS the whole river - there's nothing to compare
       a segment against, so select it as a whole river (no segment view).
       Also: if the clicked LOD object_id has no counterpart in the full
       river detail (LOD-3 simplified ids, polygon clicks with no
       object_id), select the whole river rather than an arbitrary segment. */
    const isSingleSegment = (detail.segments?.length || 0) <= 1
    const selected = (matched && !isSingleSegment)
      ? { ...matched, bbox: segment.bbox || matched.bbox }
      : null
    onRiverSelect({ ...detail, selectedSegment: selected })
  }, [metric, onRiverSelect])

  /* Sync the on-map highlight overlay with whatever river the user has
     selected. If `selectedRiver` already carries the full payload (handle-
     SegmentClick attaches it), reuse it; otherwise fetch the detail. */
  useEffect(() => {
    if (!selectedRiver?.id) { setRiverDetail(null); return }
    if (Array.isArray(selectedRiver.water_polygons) && selectedRiver.water_polygons.length > 0) {
      setRiverDetail(selectedRiver)
      return
    }
    let cancelled = false
    fetchRiver(selectedRiver.id, metric).then((d) => {
      if (cancelled || !d) return
      /* Only carry the selected segment over if it belongs to the river we
         just fetched - otherwise a stale segment from the previously
         selected river bleeds onto an unrelated river's highlight. */
      const keepSegment = d.id === selectedRiver.id ? selectedRiver.selectedSegment : null
      setRiverDetail({ ...d, selectedSegment: keepSegment })
    })
    return () => { cancelled = true }
  }, [selectedRiver, metric])

  return (
    <div className="map-container" style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      <MapContainer
        center={ROMANIA_CENTER}
        zoom={8}
        style={{ width: '100%', height: '100%', minHeight: 0 }}
        zoomControl={false}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        zoomSnap={ZOOM_SNAP}
        zoomDelta={ZOOM_DELTA}
        wheelPxPerZoomLevel={120}
        preferCanvas={false}
      >
        {/* On phones the +/- sits bottom-right so it clears the top-left
            "Rivers/Details" FAB; desktop keeps the usual top-left spot. */}
        <ZoomControl position={isMobile ? 'bottomright' : 'topleft'} />

        <TileLayer url={current.url} />

        {/* Precomputed metric tiles - the visual layer for z &lt; 12. Hidden
            when in vector mode so we don't show blurry upscaled rasters
            alongside the crisp vector polylines. */}
        <TileLayer
          key={`metric-${metric}`}
          url={`${API_BASE}/tiles/${metric}/{z}/{x}/{y}.png`}
          minNativeZoom={5}
          maxNativeZoom={11}
          minZoom={ZOOM_MIN}
          maxZoom={VECTOR_ZOOM_THRESHOLD - 1}
          keepBuffer={3}
          updateWhenZooming={false}
          opacity={inVectorMode ? 0 : 0.92}
          zIndex={400}
          crossOrigin="anonymous"
          className="metric-tile-layer"
        />

        <MapPanes />
        <FitBounds bounds={ROMANIA_BOUNDS} />
        <RiverFocus selectedRiver={selectedRiver} />
        <ZoomReporter onZoomChange={onZoomChange} onLocalZoomChange={setLocalZoom} />
        <ViewportReporter onBoundsChange={setMapBounds} />
        <InitialRegionSetter initialRegion={initialRegion} />

        {/* Listen to map events */}
        {/* <MapEventHandler onMapChange={onMapChange} /> */}

        <LodTransitioner
          segmentLods={segmentLods}
          activeLod={activeLod}
          mapBounds={mapBounds}
          mountThresholdReached={clickOverlayActive}
          onSegmentClick={handleSegmentClick}
          onSegmentHover={setHoveredSegment}
        />

        <WaterPolygonLayer
          isActive={polygonLayerActive}
          mapBounds={mapBounds}
          polys={polys}
          segments={segmentLods[5] || []}
          onSegmentClick={handleSegmentClick}
          onSegmentHover={setHoveredSegment}
        />

        <DucksLayer
          isActive={polygonLayerActive}
          polys={polys}
          segments={segmentLods[5] || []}
          mapBounds={mapBounds}
        />

        <HighZoomVectorLayer
          segments={segmentLods[5] || []}
          mapBounds={mapBounds}
          metric={metric}
          isActive={inVectorMode}
          onSegmentClick={handleSegmentClick}
          onSegmentHover={setHoveredSegment}
        />

        <SelectedRiverOverlay river={riverDetail} metric={metric} />
      </MapContainer>

      {/* Hover tooltip (DOM, not a Leaflet popup - avoids tile-layer flicker).
          Hidden on touch screens - there's no hover, and it would just sit
          on top of the legend. */}
      {hoveredSegment && !selectedRiver && !isMobile && (
        <div style={{
          position: 'absolute', bottom: 18, right: 18, zIndex: 1100,
          backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 8,
          padding: '10px 14px', boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          fontSize: 12, fontFamily: 'Inter, sans-serif', maxWidth: 240,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>
            {hoveredSegment.river_name || 'Unnamed river'}
          </div>
          <div style={{ color: '#666' }}>Segment {hoveredSegment.object_id}</div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>Click to view details</div>
        </div>
      )}

      {/* Metric Legend - compact on phones so it doesn't eat the map */}
      <div style={{ position: 'absolute', bottom: isMobile ? 10 : 20, left: isMobile ? 8 : 12, zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 8, padding: isMobile ? '7px 10px' : '12px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', minWidth: isMobile ? 130 : 200 }}>
        <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#333', marginBottom: isMobile ? 5 : 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>{selected.label}</div>
        <div style={{ height: isMobile ? 7 : 10, borderRadius: 5, background: `linear-gradient(to right, ${selected.gradient.join(', ')})`, marginBottom: isMobile ? 5 : 8 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: isMobile ? 9 : 11, color: '#666' }}>
          <span>Low</span><span>Moderate</span><span>High</span>
        </div>
      </div>

      {/* Basemap Selector */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 8, padding: isMobile ? '6px 8px' : '10px 14px', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
        {!isMobile && <label style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 6 }}>Basemap</label>}
        <select value={activeBaseMap} onChange={(e) => setActiveBaseMap(e.target.value)} aria-label="Basemap" style={{ width: '100%', padding: isMobile ? '6px 8px' : '8px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: isMobile ? 12 : 13, fontWeight: 600, color: '#333', backgroundColor: '#fafafa', cursor: 'pointer', outline: 'none' }}>
          {BASEMAP_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
      </div>
    </div>
  )
}
