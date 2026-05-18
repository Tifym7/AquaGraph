import { Box, Typography } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import MapIcon from '@mui/icons-material/Map'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import WaterIcon from '@mui/icons-material/Water'
import CampaignIcon from '@mui/icons-material/Campaign'
import EmailIcon from '@mui/icons-material/Email'
import LayersIcon from '@mui/icons-material/Layers'
import BubbleChartIcon from '@mui/icons-material/BubbleChart'
import DownloadIcon from '@mui/icons-material/Download'
import PeopleIcon from '@mui/icons-material/People'
import NotificationsIcon from '@mui/icons-material/Notifications'
import PublicIcon from '@mui/icons-material/Public'

const C = {
  dark1: '#240046',
  mid1: '#5a189a',
  mid2: '#7b2cbf',
  mid3: '#9d4edd',
}

const TOOLS = [
  { Icon: SatelliteAltIcon, label: 'Sentinel-1/2 satellite data' },
  { Icon: BubbleChartIcon, label: 'Spectral indices (NDWI, NDCI, turbidity)' },
  { Icon: MapIcon, label: 'Interactive map with LOD rendering' },
  { Icon: LayersIcon, label: 'Pregenerated raster tiles zoom 5–11' },
  { Icon: WarningAmberIcon, label: 'Automatic pollution alert' },
  { Icon: PublicIcon, label: 'Upstream/downstream propagation' },
  { Icon: WaterIcon, label: 'National coverage - all major basins' },
  { Icon: PeopleIcon, label: 'Community cleanup campaigns' },
  { Icon: EmailIcon, label: 'Water quality news newsletter' },
  { Icon: NotificationsIcon, label: 'Local incident reporting' },
  { Icon: DownloadIcon, label: 'Raw data export for researchers' },
  { Icon: CampaignIcon, label: 'Community Hub integrated in platform' },
]

export default function HowItWorksSection() {
  return (
    <Box sx={{ background: '#fff', py: { xs: 6, md: 9 }, px: { xs: 2.5, md: 8 } }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: C.dark1, letterSpacing: '-0.03em', mb: 5, fontSize: { xs: '1.6rem', md: '2rem' }, textAlign: 'center' }}>
          Tools and features
        </Typography>

        <Box sx={{ background: '#fff', borderRadius: 3, border: '1px solid rgba(90,24,154,0.12)', overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {TOOLS.map(({ Icon, label }, i) => {
              const isLastOdd = TOOLS.length % 2 !== 0 && i === TOOLS.length - 1
              const isRightCol = i % 2 === 1
              const isLastRow = i >= TOOLS.length - 2
              return (
                <Box key={label} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.75,
                  px: 3, py: 1.75,
                  borderBottom: isLastRow ? 'none' : '1px solid rgba(90,24,154,0.08)',
                  borderRight: { xs: 'none', md: isRightCol ? 'none' : '1px solid rgba(90,24,154,0.08)' },
                  gridColumn: isLastOdd ? { md: '1 / -1' } : 'auto',
                  transition: 'background 0.15s',
                  '&:hover': { background: '#f5f3ff' },
                }}>
                  <Icon sx={{ fontSize: 20, color: C.mid2, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.875rem', color: C.mid1, fontWeight: 500 }}>
                    {label}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}