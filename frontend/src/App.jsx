import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
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
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Register from './components/Register'
import Newsletter from './components/Newsletter'
import { ROMANIA_REGIONS } from './constants/regions'
import { fetchRivers } from './utils'

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
  const [rivers, setRivers] = useState([])
  const [anchorEl, setAnchorEl] = useState(null)
  const menuOpen = Boolean(anchorEl)
  const timeoutRef = useRef(null)

  const handleMapChange = useCallback((bounds, zoom) => {
  if (timeoutRef.current) clearTimeout(timeoutRef.current)
  timeoutRef.current = setTimeout(() => {
    fetchRivers(zoom, null).then(setRivers).catch(console.error) // ← null, fără bbox
  }, 250)
  }, [])

  useEffect(() => {
    fetchRivers(7, null).then(setRivers).catch(console.error)
  }, [])

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
        <Newsletter onBack={() => setPage('map')} />
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

            <Chip
              icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#69f0ae !important' }} />}
              label={regionLabel ? regionLabel : 'Live Monitoring — Romania'}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.22)',
                '& .MuiChip-icon': { ml: 0.5 },
              }}
            />

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
                  PaperProps={{ sx: { mt: 1, minWidth: 180, borderRadius: 2 } }}
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
            rivers={rivers}
            selectedRiver={selectedRiver}
            onClose={() => setSelectedRiver(null)}
            onSelect={setSelectedRiver}
          />
          <MapView
            rivers={rivers}
            selectedRiver={selectedRiver}
            onRiverSelect={setSelectedRiver}
            onMapChange={handleMapChange}
            initialRegion={initialRegion}
          />
        </Box>
      </Box>
    </ThemeProvider>
  )
}