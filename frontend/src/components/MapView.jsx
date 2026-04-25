import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getPollutionColor } from '../utils'


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


function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [map, bounds])
  return null
}

function RiverFocus({ selectedRiver }) {
  const map = useMap()
  useEffect(() => {
    if (selectedRiver && selectedRiver.bbox) {
      const b = selectedRiver.bbox
      const bounds = [
        [b.min_lat, b.min_lon],
        [b.max_lat, b.max_lon],
      ]
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 10, duration: 1.5 })
    }
  }, [map, selectedRiver])
  return null
}

/**
 * Handle zoom and pan events locally, notifying App.js
 */
function MapEventHandler({ onMapChange }) {
  const map = useMapEvents({
    moveend: () => {
      onMapChange(map.getBounds(), map.getZoom())
    },
    zoomend: () => {
      onMapChange(map.getBounds(), map.getZoom())
    },
  })
  
  // Trigger initial boundary report on mount
  useEffect(() => {
    onMapChange(map.getBounds(), map.getZoom())
  }, [map, onMapChange])

  return null
}

/**
 * Map Strahler order to line weight.
 * Bigger rivers = thicker lines.
 */
function strahlerWeight(strahler) {
  if (strahler >= 9) return 6
  if (strahler >= 7) return 5
  if (strahler >= 5) return 4
  if (strahler >= 4) return 3
  if (strahler >= 3) return 2.5
  return 2
}

function RiverLine({ river, onSelect }) {
  const color = getPollutionColor(river.pollution_level)
  const weight = strahlerWeight(river.strahler)

  // coordinates is an array of line segments, each segment is [[lat,lng], ...]
  const segments = river.coordinates

  return (
    <>
      {segments.map((segment, i) => (
        <Polyline
          key={`${river.id}-${i}`}
          positions={segment}
          pathOptions={{
            color,
            weight,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          }}
          eventHandlers={{
            click: () => onSelect(river),
            mouseover: (e) => {
              e.target.setStyle({ weight: weight + 3, opacity: 1 })
              e.target.openPopup()
            },
            mouseout: (e) => {
              e.target.setStyle({ weight, opacity: 0.85 })
              e.target.closePopup()
            },
          }}
        >
          {i === 0 && (
            <Popup>
              <div className="popup-content">
                <div className="popup-name">{river.name}</div>
                <div className="popup-level-bar">
                  <div
                    className="popup-level-fill"
                    style={{
                      width: `${river.pollution_level * 100}%`,
                      background: `linear-gradient(to right, #10b981, ${color})`,
                    }}
                  />
                </div>
                <div className="popup-stats">
                  <span className="popup-label">{river.pollution_label}</span>
                  <span className="popup-value" style={{ color }}>
                    {Math.round(river.pollution_level * 100)}%
                  </span>
                </div>
                <div className="popup-hint">Click for full report →</div>
              </div>
            </Popup>
          )}
        </Polyline>
      ))}
    </>
  )
}

const ROMANIA_CENTER = [45.9432, 24.9668]
const ROMANIA_BOUNDS = [
  [43.5, 20.2],
  [48.3, 30.0],
]

export default function MapView({ rivers, selectedRiver, onRiverSelect, onMapChange, initialRegion }) {
  return (
    <div className="map-container" style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      <MapContainer
        center={ROMANIA_CENTER}
        zoom={7}
        style={{ width: '100%', height: '100%', minHeight: 0 }}
        zoomControl={true}
        maxBounds={[
          [41, 18],
          [50, 32],
        ]}
        minZoom={6}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <InitialRegionSetter initialRegion={initialRegion} />

        <FitBounds bounds={ROMANIA_BOUNDS} />
        <RiverFocus selectedRiver={selectedRiver} />

        {/* Listen to map events */}
        <MapEventHandler onMapChange={onMapChange} />

        {rivers.map((river) => (
          <RiverLine
            key={river.id}
            river={river}
            onSelect={onRiverSelect}
          />
        ))}
      </MapContainer>

      {/* Pollution Legend */}
      <div className="map-legend">
        <div className="legend-title">Pollution Level</div>
        <div className="legend-gradient"></div>
        <div className="legend-labels">
          <span>Clean</span>
          <span>Moderate</span>
          <span>Critical</span>
        </div>
      </div>
    </div>
  )
}

