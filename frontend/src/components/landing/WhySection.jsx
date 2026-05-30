import { Box, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import WavesIcon from '@mui/icons-material/Waves'

const C = {
  darkest: '#10002b',
  dark1:   '#240046',
  dark2:   '#3c096c',
  mid1:    '#5a189a',
  mid2:    '#7b2cbf',
  mid3:    '#9d4edd',
  lightest:'#e0aaff',
  accent:  'rgba(199,125,255,0.18)',
}

/* `icon` is a React component (not an element) so the renderer can size
   and tint it per location. Material Icons mirror each previous emoji
   while reading as professional UI.

   The companion SOLUTIONS list that used to live here was merged into
   `CapabilitiesSection` to stop repeating the same value props three
   times across the landing page. */
const PROBLEMS = [
  {
    icon: SettingsInputAntennaIcon,
    stat: '~700',
    statLabel: 'national in-situ monitoring stations',
    problem: 'Coverage is sparse',
    detail: 'Romania\'s hydro-meteorological ground network is small relative to the size of the river system, leaving the vast majority of segments without real-time monitoring.',
  },
  {
    icon: AccessTimeIcon,
    stat: '72h+',
    statLabel: 'typical detection delay with field sampling',
    problem: 'Too slow to act',
    detail: 'Traditional sampling requires field teams, lab analysis, and reporting cycles. By then, a contamination event has already moved downstream.',
  },
  {
    icon: WavesIcon,
    stat: 'Few',
    statLabel: 'incidents make it into public records',
    problem: 'No unified early warning',
    detail: 'Industrial spills, agricultural runoff and sewage leaks often go unreported. There\'s no public platform to track them or alert the communities downstream.',
  },
]

export default function WhySection() {
  return (
    <Box sx={{ background: '#fff' }}>

      {/* ── Problem block ── */}
      <Box sx={{
        background: `linear-gradient(175deg, #faf5ff 0%, #f3e8ff 100%)`,
        px: { xs: 2.5, md: 8 },
        py: { xs: 6, md: 9 },
      }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <Typography sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: C.mid2,
            mb: 1.5,
          }}>
            The problem
          </Typography>
          <Typography variant="h3" sx={{
            fontWeight: 800,
            fontSize: { xs: '1.9rem', md: '2.6rem' },
            color: C.darkest,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            mb: 1.5,
            maxWidth: 620,
          }}>
            Romania's rivers are largely invisible to the people who depend on them.
          </Typography>
          <Typography sx={{ color: '#555', fontSize: '1rem', lineHeight: 1.8, mb: 5, maxWidth: 900 }}>
            Existing monitoring is too sparse, too slow, and too hard to access. We built AquaGraph to change that.
          </Typography>

          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'stretch',
            gap: { xs: 2, md: 0 },
          }}>
            {PROBLEMS.map((p, i) => {
              const Icon = p.icon
              return (
              <Box key={p.stat} sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: 'stretch',
                flex: 1,
                alignSelf: 'stretch',
              }}>
                {/* Card */}
                <Box sx={{
                  flex: 1,
                  height: '100%',
                  background: '#fff',
                  border: '1.5px solid rgba(122,44,191,0.13)',
                  borderRadius: 3,
                  p: { xs: 2, md: 2.5 },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  boxShadow: '0 2px 12px rgba(90,24,154,0.05)',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                  '&:hover': {
                    boxShadow: '0 6px 24px rgba(90,24,154,0.12)',
                    borderColor: 'rgba(122,44,191,0.28)',
                  },
                }}>
                  <Icon sx={{ fontSize: 26, color: C.mid2, mb: 0.5 }} />
                  <Typography sx={{
                    fontSize: '1.6rem', fontWeight: 900, color: C.mid2,
                    lineHeight: 1, letterSpacing: '-0.03em',
                  }}>
                    {p.stat}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#999', fontWeight: 500, mb: 0.75 }}>
                    {p.statLabel}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: C.darkest, mb: 0.4 }}>
                    {p.problem}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: '#777', lineHeight: 1.6 }}>
                    {p.detail}
                  </Typography>
                </Box>

                {/* Arrow shown only between cards, not after the last */}
                {i < PROBLEMS.length - 1 && (
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: { xs: 'auto', md: 36 },
                    height: { xs: 36, md: 'auto' },
                    color: C.mid3,
                    opacity: 0.35,
                  }}>
                    <ArrowForwardIcon sx={{
                      fontSize: 20,
                      transform: { xs: 'rotate(90deg)', md: 'none' },
                    }} />
                  </Box>
                )}
              </Box>
              )
            })}
          </Box>
        </Box>
      </Box>

      {/* The companion "Our approach" / SOLUTIONS block that used to
          render here is now in CapabilitiesSection (single source of
          truth for what AquaGraph does), so the landing reader sees
          the problem once and the solution once. */}
    </Box>
  )
}