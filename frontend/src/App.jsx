import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { fetchRivers, fetchSegments, lodForZoom, CLICK_OVERLAY_ZOOM_THRESHOLD } from './utils'
import { Box, Drawer, Fab } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import AppNavBar from './components/AppNavBar'
import useIsMobile from './hooks/useIsMobile'
import MapView from './components/MapView'
import PipelinePage from './components/PipelinePage'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Register from './components/Register'
import Newsletter from './components/Newsletter'
import Campaigns from './components/Campaigns'
import LandingPage from './components/landing/LandingPage'
import AboutPage from './components/AboutPage'
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
    MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 4 } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 4, textTransform: 'none', fontWeight: 600 } } },
  },
})

export default function App() {
  const [page, setPage] = useState('landing')
  const [user, setUser] = useState(null)
  const [initialRegion, setInitialRegion] = useState(null)
  const [selectedRiver, setSelectedRiver] = useState(null)
  const [topRivers, setTopRivers] = useState([])
  const [activeLod, setActiveLod] = useState(2)
  const [segmentLods, setSegmentLods] = useState({})
  const [activeMetric, setActiveMetric] = useState('pollution')
  const [rivers, setRivers] = useState([])
  const cancelledRef = useRef(false)
  const isMobile = useIsMobile()
  const [riverDrawerOpen, setRiverDrawerOpen] = useState(false)

  /* On phones the sidebar is a slide-over Drawer. A river picked from the
     map (no _flyOnFocus) opens the drawer to reveal its detail; a river
     picked from the list/flow links carries _flyOnFocus, so we close the
     drawer instead and let the map's fly-to animation play in full view. */
  useEffect(() => {
    if (!isMobile) return
    if (!selectedRiver) return
    setRiverDrawerOpen(!selectedRiver._flyOnFocus)
  }, [selectedRiver, isMobile])

  const ensureLodLoaded = useCallback((lod) => {
    setSegmentLods((prev) => {
      if (prev[lod]) return prev
      const next = { ...prev, [lod]: [] }
      fetchSegments(lod).then((segs) => {
        if (cancelledRef.current) return
        setSegmentLods((p) => ({ ...p, [lod]: segs }))
      })
      return next
    })
  }, [])

  const handleZoomChange = useCallback((zoom) => {
    const lod = lodForZoom(zoom)
    setActiveLod((prev) => (prev === lod ? prev : lod))
    if (zoom >= CLICK_OVERLAY_ZOOM_THRESHOLD) ensureLodLoaded(lod)
  }, [ensureLodLoaded])

  useEffect(() => {
    cancelledRef.current = false
    ensureLodLoaded(3)
    ensureLodLoaded(5)
    return () => { cancelledRef.current = true }
  }, [ensureLodLoaded])

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
    setInitialRegion(null)
    setPage('landing')
  }

  if (page === 'landing') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LandingPage
          user={user}
          onGoToMap={() => setPage('map')}
          onGoToLogin={() => setPage('login')}
          onGoToRegister={() => setPage('register')}
          onGoToNewsletter={() => setPage('newsletter')}
          onGoToCampaigns={() => setPage('campaigns')}
          onGoToPipeline={() => setPage('pipeline')}
          onGoToAbout={() => setPage('about')}
          onLogout={handleLogout}
        />
      </ThemeProvider>
    )
  }

  if (page === 'login') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Login
          onLogin={handleLogin}
          onGoToRegister={() => setPage('register')}
          onBack={() => setPage('landing')}
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
          onBack={() => setPage('landing')}
        />
      </ThemeProvider>
    )
  }

  if (page === 'newsletter') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Newsletter onGoToHome={() => setPage('landing')} onGoToMap={() => setPage('map')} onGoToCampaigns={() => setPage('campaigns')} onLogout={handleLogout}
          onBack={() => setPage('map')}
          onGoToLogin={() => setPage('login')}
          onGoToRegister={() => setPage('register')}
          onGoToAbout={() => setPage('about')}
          user={user}
        />
      </ThemeProvider>
    )
  }

  if (page === 'pipeline') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <PipelinePage
          user={user}
          onLogout={handleLogout}
          onGoToLanding={() => setPage('landing')}
          onGoToMap={() => setPage('map')}
          onGoToNewsletter={() => setPage('newsletter')}
          onGoToCampaigns={() => setPage('campaigns')}
          onGoToAbout={() => setPage('about')}
        />
      </ThemeProvider>
    )
  }

  if (page === 'campaigns') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Campaigns
            onGoToHome={() => setPage('landing')}
            onGoToMap={() => setPage('map')}
            onBack={() => setPage('map')}
            onGoToLogin={() => setPage('login')}
            onGoToRegister={() => setPage('register')}
            onGoToNewsletter={() => setPage('newsletter')}
            onGoToAddCampaign={() => setPage('add-campaign')}
            onGoToAbout={() => setPage('about')}
            user={user}
            onLogout={handleLogout}
        />
      </ThemeProvider>
    )
  }

  if (page === 'about') {
    return (
        <ThemeProvider theme={theme}>
          <CssBaseline/>
          <Box sx={{ overflowY: 'auto', height: '100vh' }}>
            <AboutPage
              user={user}
              onGoToHome={() => setPage('landing')}
              onGoToMap={() => setPage('map')}
              onGoToLogin={() => setPage('login')}
              onGoToRegister={() => setPage('register')}
              onGoToNewsletter={() => setPage('newsletter')}
              onGoToCampaigns={() => setPage('campaigns')}
              onGoToPipeline={() => setPage('pipeline')}
              onGoToAbout={() => setPage('about')}
              onLogout={handleLogout}
            />
        </Box>
        </ThemeProvider>
    )
  }


  // MAP (pagina principala dupa login)
  const sidebar = (
    <Sidebar
      rivers={topRivers}
      selectedRiver={selectedRiver}
      metric={activeMetric}
      onMetricChange={setActiveMetric}
      onClose={() => setSelectedRiver(null)}
      onSelect={(r) => setSelectedRiver(r ? { ...r, _flyOnFocus: true } : null)}
    />
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppNavBar
          links={[
            { label: 'Home', icon: <HomeIcon />, onClick: () => setPage('landing') },
            { label: 'Pipeline', icon: <AccountTreeIcon />, onClick: () => setPage('pipeline') },
            { label: 'Campaigns', icon: <CampaignIcon />, onClick: () => setPage('campaigns') },
            { label: 'Newsletter', icon: <EmailIcon />, onClick: () => setPage('newsletter') },
            { label: 'About', icon: <InfoOutlinedIcon />, onClick: () => setPage('about') },
          ]}
          user={user}
          onLogout={handleLogout}
          userMenuDetail
        />

        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Desktop: sidebar docked next to the map */}
          {!isMobile && sidebar}

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

          {/* Phone: sidebar slides over the map; FAB toggles it */}
          {isMobile && (
            <>
              {!riverDrawerOpen && (
                <Fab
                  variant="extended"
                  size="medium"
                  onClick={() => setRiverDrawerOpen(true)}
                  sx={(theme) => ({
                    position: 'absolute', top: 12, left: 12,
                    /* Below the sticky banner (appBar = 1100) so iOS Safari's
                       dynamic toolbar can't make the FAB bleed over it, but
                       still above the map overlays (zIndex 1000). */
                    zIndex: theme.zIndex.appBar - 1,
                    bgcolor: '#fff', color: '#5a189a', fontWeight: 700,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
                    '&:hover': { bgcolor: '#f5f3ff' },
                  })}
                >
                  <FormatListBulletedIcon sx={{ mr: 1, fontSize: 20 }} />
                  {selectedRiver ? 'Details' : 'Rivers'}
                </Fab>
              )}
              <Drawer
                anchor="left"
                open={riverDrawerOpen}
                onClose={() => setRiverDrawerOpen(false)}
                slotProps={{ paper: { sx: { width: '88vw', maxWidth: 380 } } }}
              >
                {sidebar}
              </Drawer>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  )
}