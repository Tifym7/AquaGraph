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
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Register from './components/Register'
import { ROMANIA_REGIONS } from './constants/regions'
import { fetchRivers } from './utils'

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
  // 'map' = pagina principala (default), 'login' | 'register' = formularele
  const [page, setPage] = useState('map')
  const [user, setUser] = useState(null)
  const [initialRegion, setInitialRegion] = useState(null)

  const [selectedRiver, setSelectedRiver] = useState(null)
  const [rivers, setRivers] = useState([])
  const timeoutRef = useRef(null)

  // Meniu avatar (user logat)
  const [anchorEl, setAnchorEl] = useState(null)
  const menuOpen = Boolean(anchorEl)

  const handleMapChange = useCallback((bounds, zoom) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      fetchRivers(zoom, bounds).then(setRivers).catch(console.error)
    }, 250)
  }, [])

  // Fetch râuri la prima încărcare
  useEffect(() => {
    fetchRivers(7, null).then(setRivers).catch(console.error)
  }, [])

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

  // Dacă suntem pe login/register, afișăm formularele
  if (page === 'login') {
    return (
      <Login
        onLogin={handleLogin}
        onGoToRegister={() => setPage('register')}
        onBack={() => setPage('map')}
      />
    )
  }

  if (page === 'register') {
    return (
      <Register
        onRegister={handleRegister}
        onGoToLogin={() => setPage('login')}
        onBack={() => setPage('map')}
      />
    )
  }

  // Pagina principala cu harta (accesibila fara autentificare)
  const regionLabel = user?.region
    ? ROMANIA_REGIONS.find(r => r.value === user.region)?.label
    : null

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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

            <Chip
              icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#69f0ae !important' }} />}
              label={regionLabel ? regionLabel : 'Live Monitoring — Romania'}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                '& .MuiChip-icon': { ml: 0.5 },
              }}
            />

            {/* Butoane autentificare sau avatar user */}
            {user ? (
              <>
                <Avatar
                  onClick={(e) => setAnchorEl(e.currentTarget)}
                  sx={{
                    width: 34, height: 34,
                    bgcolor: 'rgba(255,255,255,0.25)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
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
                    bgcolor: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
                  }}
                >
                  Login
                </Button>
                <Button
                  size="small"
                  startIcon={<PersonAddIcon />}
                  onClick={() => setPage('register')}
                  sx={{
                    color: '#1565c0',
                    bgcolor: '#fff',
                    '&:hover': { bgcolor: '#e3f2fd' },
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