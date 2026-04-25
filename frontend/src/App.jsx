import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { Box, AppBar, Toolbar, Typography, Chip } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
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
            <Chip
              icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#69f0ae !important' }} />}
              label="Live Monitoring — Romania"
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                '& .MuiChip-icon': { ml: 0.5 },
              }}
            />
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
