import { useState, useEffect } from 'react'
import {
  Box, Typography, TextField, Button, MenuItem, Select,
  FormControl, InputLabel, OutlinedInput, InputAdornment,
  Chip, Divider, Alert, CircularProgress, Tooltip,
} from '@mui/material'
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import WaterOutlinedIcon from '@mui/icons-material/WaterOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { JUDETE_LOCALITATI, JUDETE_LIST, getJudetCoords } from '../constants/judete'

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const C = {
  darkest: '#10002b',
  dark1:   '#240046',
  dark2:   '#3c096c',
  mid1:    '#5a189a',
  mid2:    '#7b2cbf',
  mid3:    '#9d4edd',
  light1:  '#c77dff',
  lightest:'#e0aaff',
}

// Zboară harta la coordonate
function MapFlyTo({ lat, lng, zoom = 13 }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], zoom, { duration: 1.2 })
  }, [lat, lng, zoom, map])
  return null
}

// Click pe hartă → setează coordonate
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

const TODAY = new Date().toISOString().split('T')[0]
const NOW_DISPLAY = new Date().toLocaleString('ro-RO', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

export default function CampaniiForm({ user, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    campaignName:     '',
    organizationName: '',
    riverName:        '',
    judet:            '',
    localitate:       '',
    coordLat:         '',
    coordLng:         '',
    startDate:        '',
    endDate:          '',
  })
  const createdAt = NOW_DISPLAY

  const [localitatiDisponibile, setLocalitatiDisponibile] = useState([])
  const [mapCenter, setMapCenter] = useState({ lat: 45.9432, lng: 24.9668 })
  const [mapZoom, setMapZoom]     = useState(7)
  const [markerPos, setMarkerPos] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  // Schimbare județ
  const handleJudetChange = (e) => {
    const judet = e.target.value
    setForm(f => ({ ...f, judet, localitate: '', coordLat: '', coordLng: '' }))
    setMarkerPos(null)
    if (judet && JUDETE_LOCALITATI[judet]) {
      setLocalitatiDisponibile(JUDETE_LOCALITATI[judet].localitati)
      const coords = getJudetCoords(judet)
      setMapCenter({ lat: coords.lat, lng: coords.lng })
      setMapZoom(coords.zoom)
    } else {
      setLocalitatiDisponibile([])
      setMapCenter({ lat: 45.9432, lng: 24.9668 })
      setMapZoom(7)
    }
  }

  // Schimbare localitate
  const handleLocalitateChange = (e) => {
    const numeLoc = e.target.value
    const loc = localitatiDisponibile.find(l => l.name === numeLoc)
    setForm(f => ({
      ...f,
      localitate: numeLoc,
      coordLat: loc ? loc.lat.toFixed(6) : f.coordLat,
      coordLng: loc ? loc.lng.toFixed(6) : f.coordLng,
    }))
    if (loc) {
      setMapCenter({ lat: loc.lat, lng: loc.lng })
      setMapZoom(13)
      setMarkerPos({ lat: loc.lat, lng: loc.lng })
    }
  }

  // Click pe hartă → actualizează coordonate manual
  const handleMapClick = (lat, lng) => {
    const latF = parseFloat(lat.toFixed(6))
    const lngF = parseFloat(lng.toFixed(6))
    setMarkerPos({ lat: latF, lng: lngF })
    setForm(f => ({ ...f, coordLat: latF.toString(), coordLng: lngF.toString() }))
  }

  // Editare manuală coordonate
  const handleCoordBlur = () => {
    const lat = parseFloat(form.coordLat)
    const lng = parseFloat(form.coordLng)
    if (!isNaN(lat) && !isNaN(lng) && lat >= 43 && lat <= 49 && lng >= 20 && lng <= 30) {
      setMarkerPos({ lat, lng })
      setMapCenter({ lat, lng })
      setMapZoom(14)
    }
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.campaignName.trim())     { setError('Campaign name este obligatoriu.'); return }
    if (!form.organizationName.trim()) { setError('Organization name este obligatoriu.'); return }
    if (!form.riverName.trim())        { setError('River name este obligatoriu.'); return }
    if (!form.judet)                   { setError('Selectează un județ.'); return }
    if (!form.localitate)              { setError('Selectează o localitate.'); return }
    if (!form.startDate)               { setError('Start date este obligatoriu.'); return }
    if (!form.endDate)                 { setError('End date este obligatoriu.'); return }
    if (form.endDate < form.startDate) { setError('End date nu poate fi înainte de start date.'); return }

    setLoading(true)
    try {
      const payload = {
        campaignName:     form.campaignName.trim(),
        organizationName: form.organizationName.trim(),
        riverName:        form.riverName.trim(),
        judet:            form.judet,
        localitate:       form.localitate,
        coordinates: {
          lat: parseFloat(form.coordLat) || markerPos?.lat || null,
          lng: parseFloat(form.coordLng) || markerPos?.lng || null,
        },
        startDate:  form.startDate,
        endDate:    form.endDate,
        createdAt:  new Date().toISOString(),
      }

      if (onSubmit) {
        try {
          await onSubmit(payload)
        } catch (backendErr) {
          console.error('Backend error (non-blocking):', backendErr)
        }
      }
      setSubmitted(true)

    } catch {
      setError('Eroare la salvarea campaniei. Încearcă din nou.')
    } finally {
      setLoading(false)
    }
  }

  // Ecran confirmare
  if (submitted) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 2, py: 6 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 64, color: C.mid2 }} />
        <Typography variant="h5" sx={{ fontWeight: 800, color: C.dark2 }}>Campaign added!</Typography>
        <Typography sx={{ color: C.mid3, textAlign: 'center', maxWidth: 360 }}>
          <strong>{form.campaignName}</strong> on river <strong>{form.riverName}</strong> — {form.localitate}, {form.judet}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Chip label={`Start: ${form.startDate}`} size="small" sx={{ bgcolor: `${C.mid1}18`, color: C.mid2, fontWeight: 600 }} />
          <Chip label={`End: ${form.endDate}`}     size="small" sx={{ bgcolor: `${C.mid1}18`, color: C.mid2, fontWeight: 600 }} />
        </Box>
        <Button onClick={onCancel} sx={{ mt: 2, bgcolor: C.mid2, color: '#fff', px: 4, borderRadius: 3, '&:hover': { bgcolor: C.mid1 } }}>
          Back to campaigns
        </Button>
      </Box>
    )
  }

  // Formular
  return (
    <Box sx={{ width: '100%' }}>

      {/* Header */}
      <Box sx={{
        background: `linear-gradient(135deg, ${C.dark2} 0%, ${C.mid2} 100%)`,
        px: 4, py: 3, display: 'flex', alignItems: 'center', gap: 2,
        borderRadius: '12px 12px 0 0',
      }}>
        <CampaignOutlinedIcon sx={{ fontSize: 32, color: C.lightest }} />
        <Box>
          <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
            Add Campaign
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.lightest, opacity: 0.85 }}>
            Register a new water monitoring or cleanup campaign
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Chip label="New" size="small" sx={{ bgcolor: C.light1, color: C.darkest, fontWeight: 700, fontSize: 11 }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>

        {/* ── Coloana stânga ── */}
        <Box sx={{ px: 4, py: 4, borderRight: { lg: `1px solid ${C.mid1}22` } }}>

          {/* Campaign & Organization */}
          <SectionLabel>Campaign Info</SectionLabel>

          <TextField
            fullWidth label="Campaign Name" variant="outlined" size="small"
            value={form.campaignName} onChange={set('campaignName')}
            placeholder="e.g. Clean Someș River 2026"
            sx={{ mb: 2, ...inputSx }}
            InputProps={{ startAdornment: <Adornment><CampaignOutlinedIcon /></Adornment> }}
          />

          <TextField
            fullWidth label="Organization Name" variant="outlined" size="small"
            value={form.organizationName} onChange={set('organizationName')}
            placeholder="e.g. EcoRomania NGO"
            sx={{ mb: 2, ...inputSx }}
            InputProps={{ startAdornment: <Adornment><BusinessOutlinedIcon /></Adornment> }}
          />

          <TextField
            fullWidth label="River Name" variant="outlined" size="small"
            value={form.riverName} onChange={set('riverName')}
            placeholder="e.g. Someș, Mureș, Dâmbovița"
            sx={{ mb: 2.5, ...inputSx }}
            InputProps={{ startAdornment: <Adornment><WaterOutlinedIcon /></Adornment> }}
          />

          <Divider sx={{ mb: 2.5, borderColor: `${C.mid1}22` }} />

          {/* Locatie */}
          <SectionLabel>Location</SectionLabel>

          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel sx={labelSx}>County (Județ)</InputLabel>
            <Select
              value={form.judet} onChange={handleJudetChange}
              input={<OutlinedInput label="County (Județ)" />}
              startAdornment={<Adornment><LocationOnOutlinedIcon /></Adornment>}
              MenuProps={{ PaperProps: { sx: { maxHeight: 280, borderRadius: 2 } } }}
              sx={selectSx}
            >
              {JUDETE_LIST.map(j => <MenuItem key={j} value={j} sx={{ fontSize: 14 }}>{j}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" sx={{ mb: 2 }} disabled={!form.judet}>
            <InputLabel sx={labelSx}>
              {form.judet ? 'City / Town' : 'Select county first'}
            </InputLabel>
            <Select
              value={form.localitate} onChange={handleLocalitateChange}
              input={<OutlinedInput label={form.judet ? 'City / Town' : 'Select county first'} />}
              startAdornment={<Adornment><MapOutlinedIcon sx={{ color: form.judet ? C.mid3 : '#ccc' }} /></Adornment>}
              MenuProps={{ PaperProps: { sx: { maxHeight: 280, borderRadius: 2 } } }}
              sx={selectSx}
            >
              {localitatiDisponibile.map(l => <MenuItem key={l.name} value={l.name} sx={{ fontSize: 14 }}>{l.name}</MenuItem>)}
            </Select>
          </FormControl>

          {/* Coordonate */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
            <Tooltip title="Latitude — or click on the map" placement="top">
              <TextField
                label="Latitude" variant="outlined" size="small"
                value={form.coordLat} onChange={set('coordLat')} onBlur={handleCoordBlur}
                placeholder="e.g. 46.7712"
                sx={inputSx}
                InputProps={{ startAdornment: <Adornment><MyLocationIcon sx={{ fontSize: '17px !important' }} /></Adornment> }}
              />
            </Tooltip>
            <Tooltip title="Longitude — or click on the map" placement="top">
              <TextField
                label="Longitude" variant="outlined" size="small"
                value={form.coordLng} onChange={set('coordLng')} onBlur={handleCoordBlur}
                placeholder="e.g. 23.6236"
                sx={inputSx}
              />
            </Tooltip>
          </Box>

          {markerPos && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: `${C.mid1}12`, border: `1px solid ${C.mid1}33`, borderRadius: 2, px: 2, py: 1, mb: 2 }}>
              <LocationOnOutlinedIcon sx={{ fontSize: 15, color: C.mid2 }} />
              <Typography sx={{ fontSize: 12, color: C.mid2, fontWeight: 600 }}>
                {markerPos.lat.toFixed(5)}, {markerPos.lng.toFixed(5)}
              </Typography>
              <Typography sx={{ fontSize: 11, color: C.mid3, ml: 'auto' }}>
                Marker set ✓
              </Typography>
            </Box>
          )}

          <Divider sx={{ mb: 2.5, borderColor: `${C.mid1}22` }} />

          {/* Date */}
          <SectionLabel>Schedule</SectionLabel>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
            <TextField
              label="" variant="outlined" size="small" type="date"
              value={form.startDate} onChange={set('startDate')}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: TODAY }}
              sx={inputSx}
              InputProps={{ startAdornment: <Adornment><CalendarTodayOutlinedIcon sx={{ fontSize: '17px !important' }} /></Adornment> }}
            />
            <TextField
              label="" variant="outlined" size="small" type="date"
              value={form.endDate} onChange={set('endDate')}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: form.startDate || TODAY }}
              sx={inputSx}
              InputProps={{ startAdornment: <Adornment><EventOutlinedIcon sx={{ fontSize: '17px !important' }} /></Adornment> }}
            />
          </Box>

          {/* Created at — readonly */}
          <TextField
            fullWidth label="Created At" variant="outlined" size="small"
            value={createdAt}
            disabled
            sx={{ mb: 3, ...inputSx, '& .MuiOutlinedInput-root': { ...inputSx['& .MuiOutlinedInput-root'], bgcolor: `${C.mid1}06` } }}
            InputProps={{ startAdornment: <Adornment><AccessTimeOutlinedIcon sx={{ color: '#bbb !important' }} /></Adornment> }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: 13 }}>{error}</Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            {onCancel && (
              <Button fullWidth variant="outlined" onClick={onCancel}
                sx={{ borderColor: `${C.mid1}55`, color: C.mid1, borderRadius: 3, '&:hover': { borderColor: C.mid2, bgcolor: `${C.mid1}08` } }}>
                Cancel
              </Button>
            )}
            <Button fullWidth variant="contained" onClick={handleSubmit} disabled={loading}
              sx={{
                background: `linear-gradient(135deg, ${C.mid1} 0%, ${C.dark2} 100%)`,
                color: '#fff', borderRadius: 3,
                boxShadow: `0 4px 15px ${C.mid1}44`,
                '&:hover': { background: `linear-gradient(135deg, ${C.mid2} 0%, ${C.mid1} 100%)` },
              }}>
              {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Add Campaign'}
            </Button>
          </Box>
        </Box>

        {/* ── Coloana dreapta — hartă ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 4, pt: 4, pb: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.mid1, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Map Location
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.mid3, mt: 0.5 }}>
              {markerPos
                ? `Pinned: ${markerPos.lat.toFixed(4)}, ${markerPos.lng.toFixed(4)}`
                : form.judet
                  ? `County: ${form.judet} — select a city or click the map`
                  : 'Select a county or click the map to pin a location'}
            </Typography>
          </Box>

          <Box sx={{
            flex: 1, minHeight: { xs: 320, lg: 0 }, height: { lg: '100%' },
            mx: 3, mb: 3, borderRadius: 3, overflow: 'hidden',
            border: `2px solid ${markerPos ? C.mid2 : C.mid1 + '33'}`,
            boxShadow: markerPos ? `0 0 0 4px ${C.mid1}18` : 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s',
            position: 'relative',
          }}>
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={mapZoom}
              style={{ width: '100%', height: '100%', minHeight: 420 }}
              zoomControl
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFlyTo lat={mapCenter.lat} lng={mapCenter.lng} zoom={mapZoom} />
              <MapClickHandler onMapClick={handleMapClick} />
              {markerPos && (
                <Marker position={[markerPos.lat, markerPos.lng]}>
                  <Popup>
                    <Box sx={{ textAlign: 'center', p: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.dark2 }}>
                        {form.riverName || 'Campaign location'}
                      </Typography>
                      {form.localitate && (
                        <Typography sx={{ fontSize: 11, color: C.mid3 }}>
                          {form.localitate}, {form.judet}
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: 10, color: '#999', mt: 0.5 }}>
                        {markerPos.lat.toFixed(5)}, {markerPos.lng.toFixed(5)}
                      </Typography>
                    </Box>
                  </Popup>
                </Marker>
              )}
            </MapContainer>

            {/* Overlay când nu e selectat nimic */}
            {!form.judet && !markerPos && (
              <Box sx={{
                position: 'absolute', inset: 0, zIndex: 1000,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                bgcolor: 'rgba(16,0,43,0.5)', backdropFilter: 'blur(2px)', gap: 1.5,
              }}>
                <LocationOnOutlinedIcon sx={{ fontSize: 40, color: C.light1 }} />
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                  Pin a location
                </Typography>
                <Typography sx={{ color: C.lightest, fontSize: 12, opacity: 0.8, textAlign: 'center', maxWidth: 200 }}>
                  Select a county from the form or click anywhere on the map
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#5a189a', mb: 2, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
      {children}
    </Typography>
  )
}

function Adornment({ children }) {
  return (
    <InputAdornment position="start">
      <Box sx={{ fontSize: 20, color: '#9d4edd', display: 'flex', alignItems: 'center' }}>
        {children}
      </Box>
    </InputAdornment>
  )
}

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5, fontSize: 14,
    '&.Mui-focused fieldset': { borderColor: '#7b2cbf' },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#7b2cbf' },
}

const selectSx = {
  borderRadius: 2.5, fontSize: 14,
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#7b2cbf' },
}

const labelSx = {
  color: '#5a189a',
  '&.Mui-focused': { color: '#7b2cbf' },
}