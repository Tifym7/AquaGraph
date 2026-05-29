import { Box, Typography } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import InsightsIcon from '@mui/icons-material/Insights'
import MapIcon from '@mui/icons-material/Map'
import DownloadIcon from '@mui/icons-material/Download'
import PublicIcon from '@mui/icons-material/Public'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CampaignIcon from '@mui/icons-material/Campaign'
import NewspaperIcon from '@mui/icons-material/Newspaper'
import PetsIcon from '@mui/icons-material/Pets'

const C = {
  dark1: '#240046',
  mid1: '#5a189a',
  mid2: '#7b2cbf',
  mid3: '#9d4edd',
}

/* `icon` is a React component (not an element) so we can render it with
   per-card sizing/colour from the renderer below. Material Icons mirror
   each previous emoji, but read as professional UI rather than chat. */
const FEATURES = [
  {
    icon: SatelliteAltIcon,
    title: 'Copernicus Satellite Data',
    text: 'We process Sentinel-1 and Sentinel-2 imagery to extract water quality indices for every river segment.'
  },
  {
    icon: InsightsIcon,
    title: 'Multi-Metric Analysis',
    text: 'Switch between 7 satellite metrics - pollution risk, NDVI, MNDWI, NDCI, turbidity, oil leakage and discharge.'
  },
  {
    icon: MapIcon,
    title: 'Interactive LOD Map',
    text: 'Smooth navigation across Romania\'s river network with Level-of-Detail rendering and click on any individual segment.'
  },
  {
    icon: DownloadIcon,
    title: 'Report Export',
    text: 'Subscribed organizations can download Excel and PDF reports with our computed spectral indices - ready for analysis, audits or regulatory submissions.'
  },
  {
    icon: PublicIcon,
    title: 'National Coverage',
    text: 'We monitor Romania\'s entire river network - from the Danube to the smallest mountain tributaries.'
  },
  {
    icon: WarningAmberIcon,
    title: 'Pollution Propagation',
    text: 'Track how a pollution event moves upstream or downstream with automatic direction and intensity estimation.'
  },
  {
    icon: CampaignIcon,
    title: 'Community Campaigns',
    text: 'Citizens can report local issues and join cleanup campaigns directly from the platform.'
  },
  {
    icon: NewspaperIcon,
    title: 'Water Quality News Feed',
    text: 'Live feed of environmental news from Romania, correlated with locations on the map.'
  },
  {
    icon: PetsIcon,
    title: 'Ducks Layer',
    text: 'At high zoom, animated ducks float along rivers - a fun touch that makes environmental monitoring a little more joyful.'
  },
]

export default function FeaturesSection() {
  return (
    <Box sx={{ pt: { xs: 4, md: 5.5 }, pb: { xs: 5, md: 8 }, px: { xs: 2.5, md: 8 }, maxWidth: 1200, mx: 'auto', width: '100%' }}>
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
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <Box key={title} sx={{ textAlign: 'center' }}>
            <Box sx={{
              width: 64, height: 64, mx: 'auto', mb: 1.75,
              borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${C.mid1} 0%, ${C.mid2} 60%, ${C.mid3} 100%)`,
              boxShadow: '0 6px 18px rgba(90,24,154,0.20)',
            }}>
              <Icon sx={{ fontSize: 32, color: '#fff' }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: C.dark1, mb: 0.75 }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: C.mid1, lineHeight: 1.6 }}>{text}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
