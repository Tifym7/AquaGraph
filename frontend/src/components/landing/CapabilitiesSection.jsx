/* Single source of truth for "what AquaGraph does" on the landing page.
   Replaces the old FeaturesSection (9 cards) + HowItWorksSection (12-item
   list) + WhySection.SOLUTIONS (6 cards) which all repeated the same
   value props 2-3 times in slightly different framings.

   Six cards, each tied to a real capability documented on the Pipeline
   page or surfaced in the app. Numbers match /api/pipeline/stats so a
   curious visitor can sanity-check the claim by opening the Pipeline page. */

import { Box, Typography } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import InsightsIcon from '@mui/icons-material/Insights'
import MapIcon from '@mui/icons-material/Map'
import DownloadIcon from '@mui/icons-material/Download'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import CampaignIcon from '@mui/icons-material/Campaign'

const C = {
  dark1: '#240046',
  mid1:  '#5a189a',
  mid2:  '#7b2cbf',
  mid3:  '#9d4edd',
  tint:  '#faf5ff',
  border: '#ede9fe',
}

const CAPABILITIES = [
  {
    icon: SatelliteAltIcon,
    title: 'Live Sentinel coverage',
    text: 'Every Sentinel-1 (SAR) and Sentinel-2 (optical) pass over '
        + 'Romania is reduced down to per-segment numbers on Google '
        + 'Earth Engine, then ingested into our time-series store.',
  },
  {
    icon: InsightsIcon,
    title: 'Eight indices, one POLLUTION score',
    text: 'NDWI, MNDWI, NDVI, NDCI, NDTI, TURBIDITY, BSI and a '
        + 'Sentinel-1 oil-probability signal feed a 0-7 POLLUTION '
        + 'composite, per segment, per pass.',
  },
  {
    icon: AccountTreeIcon,
    title: 'Upstream / downstream queries',
    text: 'EU-Hydro\'s topology graph lets us light up everything '
        + 'upstream or downstream of a segment in one traversal - so '
        + 'a contamination signal can be traced both ways quickly.',
  },
  {
    icon: MapIcon,
    title: 'Interactive map with timeline',
    text: 'Pan the whole river network with level-of-detail rendering, '
        + 'scrub through every recorded date, and click any segment '
        + 'to see its full metric history.',
  },
  {
    icon: DownloadIcon,
    title: 'Reports on demand',
    text: 'Per-river PDF reports for stakeholders, plus a technical '
        + '"x-ray" PDF with live Sentinel imagery and an AI-synthesised '
        + 'conclusion - delivered to your inbox when ready.',
  },
  {
    icon: CampaignIcon,
    title: 'Community + newsletter',
    text: 'Citizens can report ground-truth incidents on the map, '
        + 'join cleanup campaigns, and subscribe to a water-quality '
        + 'newsletter. No login required to explore the map itself.',
  },
]

export default function CapabilitiesSection() {
  return (
    <Box sx={{
      // Match the py: 6/9 rhythm WhySection / DataPreviewSection use,
      // so the gap between the bottom of the capability cards and the
      // tinted DataPreviewSection band reads as breathing room rather
      // than a flush abut.
      py: { xs: 6, md: 9 },
      px: { xs: 2.5, md: 8 }, maxWidth: 1200, mx: 'auto', width: '100%',
    }}>
      <Typography sx={{
        fontSize: '0.7rem', textTransform: 'uppercase',
        letterSpacing: '0.1em', color: C.mid3, fontWeight: 700, mb: 0.5,
      }}>
        What AquaGraph does
      </Typography>
      <Typography variant="h4" sx={{
        fontWeight: 800, color: C.dark1, letterSpacing: '-0.03em',
        mb: 5, fontSize: { xs: '1.6rem', md: '2rem' },
      }}>
        Satellite-derived monitoring, end to end.
      </Typography>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
        gap: { xs: 2.5, md: 3 },
      }}>
        {CAPABILITIES.map(({ icon: Icon, title, text }) => (
          <Box key={title} sx={{
            p: { xs: 2.5, md: 3 }, borderRadius: 3,
            border: `1.5px solid ${C.border}`,
            background: '#fff',
            display: 'flex', flexDirection: 'column',
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
            '&:hover': {
              borderColor: 'rgba(122,44,191,0.32)',
              boxShadow: '0 12px 30px rgba(90,24,154,0.10)',
              transform: 'translateY(-2px)',
            },
          }}>
            <Box sx={{
              width: 52, height: 52, mb: 2,
              borderRadius: 2.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${C.mid1} 0%, ${C.mid2} 60%, ${C.mid3} 100%)`,
              boxShadow: '0 4px 14px rgba(90,24,154,0.22)',
            }}>
              <Icon sx={{ fontSize: 26, color: '#fff' }} />
            </Box>
            <Typography sx={{
              fontWeight: 800, fontSize: '1rem',
              color: C.dark1, mb: 0.75, letterSpacing: '-0.01em',
            }}>{title}</Typography>
            <Typography sx={{
              fontSize: '0.85rem', color: '#666',
              lineHeight: 1.65,
            }}>{text}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
