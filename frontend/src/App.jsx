import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { fetchRivers, fetchSegments, lodForZoom, CLICK_OVERLAY_ZOOM_THRESHOLD } from './utils'
import {
  Box, AppBar, Toolbar, Typography, Chip,
  Button, Avatar, Menu, MenuItem, Divider, ListItemIcon,
} from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import LoginIcon from '@mui/icons-material/Login'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import LogoutIcon from '@mui/icons-material/Logout'
import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Register from './components/Register'
import Newsletter from './components/Newsletter'
import Campaigns from './components/Campaigns'
import { ROMANIA_REGIONS } from './constants/Regions'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#6d28d9' },
    secondary: { main: '#a855f7' },
    background: { default: '#f5f3ff', paper: '#ffffff' },
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
          background: 'linear-gradient(90deg, #10002b 0%, #3c096c 60%, #5a189a 100%)',
          boxShadow: '0 2px 12px rgba(109,40,217,0.35)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 4 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 4, textTransform: 'none', fontWeight: 600 },
      },
    },
  },
})

export default function App() {
  const [page, setPage] = useState('map')
  const [user, setUser] = useState(null)
  const [initialRegion, setInitialRegion] = useState(null)
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
  const [rivers, setRivers] = useState([])
  const [anchorEl, setAnchorEl] = useState(null)
  const menuOpen = Boolean(anchorEl)
  // const timeoutRef = useRef(null)


  // const handleMapChange = useCallback((bounds, zoom) => {
  // if (timeoutRef.current) clearTimeout(timeoutRef.current)
  // timeoutRef.current = setTimeout(() => {
  //   fetchRivers(zoom, null).then(setRivers).catch(console.error) // ← null, fără bbox
  // }, 250)
  // }, [])

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

useEffect(() => {
  if (initialRegion) {
    fetchRivers(initialRegion.zoom || 9, null).then(setRivers).catch(console.error)
  }
}, [initialRegion])

  const handleLogin = (userData) => {
    setUser(userData)
    if (userData?.region) {
      const regionData = ROMANIA_REGIONS.find(r => r.value === userData.region)
      if (regionData) setInitialRegion(regionData)
    }
    setPage('map')
  }

  const handleRegister = (userData) => {
    setUser(userData)
    if (userData?.region) {
      const regionData = ROMANIA_REGIONS.find(r => r.value === userData.region)
      if (regionData) setInitialRegion(regionData)
    }
    setPage('map')
  }

  const handleLogout = () => {
    setUser(null)
    setAnchorEl(null)
    setInitialRegion(null)
  }

  if (page === 'login') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Login
          onLogin={handleLogin}
          onGoToRegister={() => setPage('register')}
          onBack={() => setPage('map')}
        />
      </ThemeProvider>
    )
  }

  if (page === 'register') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Register
          onRegister={handleRegister}
          onGoToLogin={() => setPage('login')}
          onBack={() => setPage('map')}
        />
      </ThemeProvider>
    )
  }

  if (page === 'newsletter') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Newsletter
            onBack={() => setPage('map')}
            onGoToLogin={() => setPage('login')}
            onGoToRegister={() => setPage('register')}
            user={user}
            onLogout={handleLogout}
        />
      </ThemeProvider>
    )
  }

  if (page === 'campaigns') {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Campaigns
        onBack={() => setPage('map')}
        onGoToLogin={() => setPage('login')}
        onGoToRegister={() => setPage('register')}
        onGoToNewsletter={() => setPage('newsletter')}
        onGoToAddCampaign={() => setPage('add-campaign')}
        user={user}
        onLogout={handleLogout}
      />
    </ThemeProvider>
  )
}

  const regionLabel = user?.region
    ? ROMANIA_REGIONS.find(r => r.value === user.region)?.label
    : null

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="sticky" elevation={0}>
          <Toolbar sx={{ gap: 1.5, minHeight: '95px !important' }}>
            <SatelliteAltIcon sx={{ fontSize: 28 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" component="div" sx={{ lineHeight: 1.2, letterSpacing: '-0.3px' }}>
                AquaGraph
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.75, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Satellite Water Pollution Monitor
              </Typography>
            </Box>

            <Box sx={{ flexGrow: 1 }} />

            {/* Newsletter */}
            <Button
              startIcon={<EmailIcon />}
              size="small"
              onClick={() => setPage('newsletter')}
              sx={{
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                px: 1.5,
              }}
            >
              Newsletter

            </Button>

            <Button startIcon={<CampaignIcon />}
                        size="small"
                        onClick={() => setPage('campaigns')}
                        sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.25)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, px: 1.5 }}>
                  Campaigns
                </Button>

            {/* Login / Avatar */}
            {user ? (
              <>
                <Avatar
                  onClick={(e) => setAnchorEl(e.currentTarget)}
                  sx={{
                    width: 34, height: 34,
                    bgcolor: 'rgba(255,255,255,0.25)',
                    color: '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                    border: '2px solid rgba(255,255,255,0.4)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
                  }}
                >
                  {user.username?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <Menu
                  anchorEl={anchorEl}
                  open={menuOpen}
                  onClose={() => setAnchorEl(null)}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                  slotProps={{ paper: { sx: { mt: 1, minWidth: 180, borderRadius: 2 } } }}
                >
                  <Box sx={{ px: 2, py: 1 }}>
                    <Typography variant="body2" fontWeight={700}>{user.username}</Typography>
                    {user.email && (
                      <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                    )}
                  </Box>
                  <Divider />
                  <MenuItem onClick={handleLogout}>
                    <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                    Deconectare
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  startIcon={<LoginIcon />}
                  onClick={() => setPage('login')}
                  sx={{
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    px: 1.5,
                  }}
                >
                  Login
                </Button>
                <Button
                  size="small"
                  startIcon={<PersonAddIcon />}
                  onClick={() => setPage('register')}
                  sx={{
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    px: 1.5,
                  }}
                >
                  Register
                </Button>
              </Box>
            )}
          </Toolbar>
        </AppBar>

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
            initialRegion={initialRegion}
          />
        </Box>
      </Box>
    </ThemeProvider>
  )
}