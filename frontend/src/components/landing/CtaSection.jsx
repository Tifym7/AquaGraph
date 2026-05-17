import { Box, Typography, IconButton } from '@mui/material'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import GitHubIcon from '@mui/icons-material/GitHub'

const C = {
  darkest: '#10002b',
  dark1:   '#240046',
  dark2:   '#3c096c',
  mid1:    '#5a189a',
  mid2:    '#7b2cbf',
  lightest:'#e0aaff',
}

const LINKEDIN_URL = 'https://www.linkedin.com/company/aquagraph'
const GITHUB_URL   = 'https://github.com/Tifym7/AquaGraph'

const LINK_BTN = {
  border: '1px solid rgba(199,125,255,0.35)',
  bgcolor: 'rgba(199,125,255,0.1)',
  borderRadius: 1,
  px: 2, py: 1,
  gap: 0.75,
  display: 'flex',
  alignItems: 'center',
  '&:hover': { bgcolor: 'rgba(199,125,255,0.2)' },
}

export default function CTASection() {
  return (
    <Box sx={{
      background: `linear-gradient(160deg, ${C.darkest} 0%, ${C.dark1} 40%, ${C.dark2} 100%)`,
      px: { xs: 2.5, md: 5 }, py: { xs: 5, md: 7 },
      textAlign: 'center', position: 'relative', overflow: 'hidden',
      '&::before': {
        content: '""', position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 50% 60% at 50% 100%, rgba(157,78,221,0.2) 0%, transparent 70%)',
        pointerEvents: 'none',
      },
    }}>
      <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 560, mx: 'auto' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, mb: 1.5, fontSize: { xs: '1.8rem', md: '2.2rem' } }}>
          Monitor Romania's rivers
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', lineHeight: 1.7, mb: 3 }}>
          Access the interactive map and explore water quality in real time, based on ESA Copernicus satellite data.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          <IconButton href={GITHUB_URL} target="_blank" rel="noopener noreferrer" sx={{ ...LINK_BTN, color: C.lightest }}>
            <GitHubIcon sx={{ fontSize: 20 }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: C.lightest }}>GitHub</Typography>
          </IconButton>
          <IconButton href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" sx={{ ...LINK_BTN, color: C.lightest }}>
            <LinkedInIcon sx={{ fontSize: 20 }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: C.lightest }}>LinkedIn</Typography>
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}