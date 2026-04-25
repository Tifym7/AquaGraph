import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { Box, AppBar, Toolbar, Typography, Chip, Button } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import LoginIcon from '@mui/icons-material/Login'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import EmailIcon from '@mui/icons-material/Email'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import { fetchRivers } from './utils'
import Newsletter from "./Newsletter.jsx";

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
          background: 'linear-gradient(90deg, #100020 0%, #4c1d95 60%, #6d28d9 100%)',
          boxShadow: '0 2px 12px rgba(109,40,217,0.35)',
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
  const [rivers, setRivers] = useState([])
  const [page, setPage] = useState('map')
  const timeoutRef = useRef(null)


  // Handle map panning and zooming by debouncing requests
  const handleMapChange = useCallback((bounds, zoom) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      fetchRivers(zoom, bounds).then(setRivers).catch(console.error)
    }, 250) // 250ms debounce
  }, [])

  // Initial fetch before map bounds are ready
  useEffect(() => {
    fetchRivers(7, null).then(setRivers).catch(console.error)
  }, [])

  if (page === 'newsletter') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Newsletter onBack={() => setPage('map')} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="sticky" elevation={0} sx={{
        background: `linear-gradient(90deg, #10002b 0%, #3c096c 60%, #5a189a 100%)`,
        boxShadow: '0 2px 12px rgba(109,40,217,0.35)',
      }}>
          <Toolbar sx={{ gap: 1.5,  minHeight: '95px !important'}}>
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
              label="Live Monitoring — Romania"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.22)',
                '& .MuiChip-icon': { ml: 0.5 },
              }}
            />
            {/* Spațiu liber */}
            <Box sx={{ flexGrow: 1 }} />

            {/* Newsletter */}
            <Button
              startIcon={<EmailIcon/>}
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

            {/* Register */}
            <Button
              startIcon={<PersonAddIcon />}
              size="small"
              sx={{
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                px: 1.5,
              }}
            >
              Register
            </Button>

            {/* Login */}
            <Button
              startIcon={<LoginIcon />}
              variant="contained"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.35)',
                boxShadow: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)', boxShadow: 'none' },
                px: 1.5,
              }}
            >
              Login
            </Button>

          </Toolbar>
        </AppBar>

        {/* Body */}
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
          />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
