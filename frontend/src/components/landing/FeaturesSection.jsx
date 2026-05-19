import { Box, Typography } from '@mui/material'

const C = {
  dark1: '#240046',
  mid1: '#5a189a',
  mid2: '#7b2cbf',
  mid3: '#9d4edd',
}

const FEATURES = [
  {
    icon: '🛰️',
    title: 'Copernicus Satellite Data',
    text: 'We process Sentinel-1 and Sentinel-2 imagery to extract water quality indices for every river segment.'
  },
  {
    icon: '📊',
    title: 'Multi-Metric Analysis',
    text: 'Switch between 7 satellite metrics - pollution risk, NDVI, MNDWI, NDCI, turbidity, oil leakage and discharge.'
  },
  {
    icon: '🗺️',
    title: 'Interactive LOD Map',
    text: 'Smooth navigation across Romania\'s river network with Level-of-Detail rendering and click on any individual segment.'
  },
  {
    icon: '💾',
    title: 'Report Export',
    text: 'Subscribed organizations can download Excel and PDF reports with our computed spectral indices - ready for analysis, audits or regulatory submissions.'
  },
  {
    icon: '🌐',
    title: 'National Coverage',
    text: 'We monitor Romania\'s entire river network - from the Danube to the smallest mountain tributaries.'
  },
  {
    icon: '⚠️',
    title: 'Pollution Propagation',
    text: 'Track how a pollution event moves upstream or downstream with automatic direction and intensity estimation.'
  },
  {
    icon: '📢',
    title: 'Community Campaigns',
    text: 'Citizens can report local issues and join cleanup campaigns directly from the platform.'
  },
  {
    icon: '📰',
    title: 'Water Quality News Feed',
    text: 'Live feed of environmental news from Romania, correlated with locations on the map.'
  },
  {
    icon: '🦆',
    title: 'Ducks Layer',
    text: 'At high zoom, animated ducks float along rivers - a fun touch that makes environmental monitoring a little more joyful.'
  },
]

export default function FeaturesSection() {
  return (
    <Box sx={{ py: { xs: 5, md: 8 }, px: { xs: 2.5, md: 8 }, maxWidth: 1100, mx: 'auto', width: '100%' }}>
      <Typography sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: C.mid3, fontWeight: 700, mb: 0.5 }}>
        Features
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color: C.dark1, letterSpacing: '-0.03em', mb: 5, fontSize: { xs: '1.6rem', md: '2rem' } }}>
        Explore unique features of AquaGraph
      </Typography>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' },
        gap: { xs: 4, md: 6 },
      }}>
        {FEATURES.map(({ icon, title, text }) => (
          <Box key={title} sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2.8rem', mb: 1.5, lineHeight: 1 }}>{icon}</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: C.dark1, mb: 0.75 }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: C.mid1, lineHeight: 1.6 }}>{text}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}