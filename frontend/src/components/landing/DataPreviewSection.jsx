import { Box, Typography, Button } from '@mui/material'
import mapPreview from '../../assets/harta.png'

const C = {
  dark1:   '#240046',
  mid1:    '#5a189a',
  mid2:    '#7b2cbf',
  mid3:    '#9d4edd',
}

export default function DataPreviewSection({ onGoToMap }) {
  return (
    <Box sx={{ py: { xs: 6, md: 9 }, px: { xs: 2.5, md: 8 }, background: '#f5f3ff' }}>
      <Box sx={{
        maxWidth: 1100, mx: 'auto',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1.5fr' },
        gap: { xs: 4, md: 7 },
        alignItems: 'center',
      }}>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: C.mid3, fontWeight: 700, mb: 0.5 }}>
            Interactive map
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, color: C.dark1, letterSpacing: '-0.03em', mb: 1.5, fontSize: { xs: '1.6rem', md: '2rem' } }}>
            Explore Romania's rivers
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: C.mid1, lineHeight: 1.75, mb: 3, maxWidth: 380 }}>
            Interactive map with satellite tiles, 7 water quality metrics and click on any river segment for full details.
          </Typography>
          <Button
            variant="contained"
            onClick={onGoToMap}
            sx={{ bgcolor: C.mid2, color: '#fff', fontWeight: 600, borderRadius: 1, textTransform: 'none', px: 3, py: 1.1, '&:hover': { bgcolor: C.mid1 }, boxShadow: 'none' }}
          >
            Open map →
          </Button>
        </Box>

        <Box
          onClick={onGoToMap}
          sx={{
            borderRadius: 2, overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(90,24,154,0.15)',
            border: '1px solid rgba(90,24,154,0.12)',
            cursor: 'pointer', position: 'relative',
            transition: 'transform 0.2s, box-shadow 0.2s',
            '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 16px 56px rgba(90,24,154,0.22)' },
            '&:hover .map-overlay': { opacity: 1 },
          }}
        >
          <Box component="img" src={mapPreview} alt="AquaGraph map preview" sx={{ width: '100%', display: 'block', objectFit: 'cover' }} />
          <Box className="map-overlay" sx={{
            position: 'absolute', inset: 0,
            background: 'rgba(60,9,108,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0, transition: 'opacity 0.2s',
          }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>Open map →</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}