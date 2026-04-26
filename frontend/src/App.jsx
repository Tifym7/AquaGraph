import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { Box, AppBar, Toolbar, Typography } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import { fetchRivers, fetchSegments, lodForZoom, CLICK_OVERLAY_ZOOM_THRESHOLD } from './utils'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1565c0' },
    secondary: { main: '#00897b' },
    background: { default: '#f0f4f8', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 4 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(90deg, #1565c0 0%, #0277bd 100%)',
          boxShadow: '0 2px 12px rgba(21,101,192,0.25)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 4,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
  },
})

export default function App() {
  const [selectedRiver, setSelectedRiver] = useState(null)
  // Sidebar's "top 10" list — fetched once per metric change at low zoom.
  const [topRivers, setTopRivers] = useState([])
  // LOD-tier-aware click overlay for the map.
  const [activeLod, setActiveLod] = useState(2)
  const [segmentLods, setSegmentLods] = useState({}) // { 1: [...], 2: [...], ... }
  const [activeMetric, setActiveMetric] = useState('pollution')
  const cancelledRef = useRef(false)

  /* Load click-overlay segments for a LOD tier (cached after first load). */
  const ensureLodLoaded = useCallback((lod) => {
    setSegmentLods((prev) => {
      if (prev[lod]) return prev
      // mark as loading to prevent duplicate fetches
      const next = { ...prev, [lod]: [] }
      fetchSegments(lod).then((segs) => {
        if (cancelledRef.current) return
        setSegmentLods((p) => ({ ...p, [lod]: segs }))
      })
      return next
    })
  }, [])

  /* React to map zoom changes — only fetch a LOD JSON when the user is
     zoomed in enough to actually use the click overlay. Below the
     threshold we don't load any segment data (saves RAM + per-frame work). */
  const handleZoomChange = useCallback((zoom) => {
    const lod = lodForZoom(zoom)
    setActiveLod((prev) => (prev === lod ? prev : lod))
    if (zoom >= CLICK_OVERLAY_ZOOM_THRESHOLD) {
      ensureLodLoaded(lod)
    }
  }, [ensureLodLoaded])

  /* Preload the LOD tiers the user is likely to need within ~1s — the
     country-wide click overlay (LOD 3) and the close-up vector layer
     (LOD 5). Fetching these eagerly avoids the "blank canvas" gap where
     the user zooms past the threshold but the segment JSON hasn't arrived
     yet, which leaves the metric tile layer hidden (z>=12 vector mode)
     while the vector layer has nothing to render. */
  useEffect(() => {
    cancelledRef.current = false
    ensureLodLoaded(3)
    ensureLodLoaded(5)
    return () => { cancelledRef.current = true }
  }, [ensureLodLoaded])

  /* Sidebar list — refresh on metric change. Uses /api/rivers at low zoom for
     a stable, ranked, country-wide top-N. The map visuals are unaffected. */
  useEffect(() => {
    fetchRivers(7, null, activeMetric).then((data) => {
      setTopRivers(data.rivers || data || [])
    }).catch(console.error)
  }, [activeMetric])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Header */}
        <AppBar position="static" elevation={0}>
          <Toolbar sx={{ gap: 1.5 }}>
            <SatelliteAltIcon sx={{ fontSize: 28 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" component="div" sx={{ lineHeight: 1.2, letterSpacing: '-0.3px' }}>
                AquaGraph
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.75, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Satellite Water Pollution Monitor
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Body */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar
            rivers={topRivers}
            selectedRiver={selectedRiver}
            metric={activeMetric}
            onMetricChange={setActiveMetric}
            onClose={() => setSelectedRiver(null)}
            /* Sidebar selections (top-10 list, upstream / downstream flow links)
               want the map to fly to the river. Tag the river object so
               RiverFocus knows to animate. Map clicks bypass this and call
               setSelectedRiver directly, leaving the camera in place. */
            onSelect={(r) => setSelectedRiver(r ? { ...r, _flyOnFocus: true } : null)}
          />
          <MapView
            segmentLods={segmentLods}
            activeLod={activeLod}
            selectedRiver={selectedRiver}
            onRiverSelect={setSelectedRiver}
            onZoomChange={handleZoomChange}
            metric={activeMetric}
            onMetricChange={setActiveMetric}
          />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
