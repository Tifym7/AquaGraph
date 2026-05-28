import { Box, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

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

const PROBLEMS = [
  {
    icon: '📡',
    stat: '882',
    statLabel: 'monitoring stations for the whole country',
    problem: 'Coverage is dangerously thin',
    detail: 'Romania\'s entire hydro-meteorological network has only 882 stations, leaving thousands of river segments with no real-time data at all.',
  },
  {
    icon: '⏱️',
    stat: '72h+',
    statLabel: 'average detection delay',
    problem: 'Too slow to act',
    detail: 'Traditional sampling requires field teams, lab analysis, and reporting cycles. By then, the damage has already spread downstream.',
  },
  {
    icon: '🌊',
    stat: '340+',
    statLabel: 'pollution incidents / year',
    problem: 'No early warning system',
    detail: 'Industrial spills, agricultural runoff, and sewage leaks often go unreported. There\'s no unified platform to track or alert affected communities.',
  },
]

const SOLUTIONS = [
  {
    icon: '🛰️',
    title: '3,500+ segments monitored',
    text: 'ESA Copernicus Sentinel-1 and Sentinel-2 imagery covers the entire country, giving AquaGraph continuous coverage that no ground sensor network could match.',
  },
  {
    icon: '⏱️',
    title: '24h detection duty cycle',
    text: 'Satellite revisit schedules mean AquaGraph can flag a new pollution event within 24 hours, 3× faster than traditional field sampling.',
  },
  {
    icon: '📊',
    title: '7 water-quality metrics',
    text: 'From NDWI and NDCI to turbidity, oil-leakage risk and discharge rate, each river segment is scored across multiple dimensions.',
  },
  {
    icon: '⚠️',
    title: 'Propagation modelling',
    text: 'Once a pollution source is detected, AquaGraph models how it moves upstream or downstream, so authorities can act before it reaches populated areas.',
  },
  {
    icon: '📢',
    title: 'Community layer',
    text: 'Citizens can report issues on the map and join local cleanup campaigns, connecting satellite data with ground truth.',
  },
  {
    icon: '🌍',
    title: 'Open to everyone',
    text: 'No login is required to explore the full map. We believe environmental data should be a public good, available to citizens, researchers, and local authorities alike.',
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
            {PROBLEMS.map((p, i) => (
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
                  <Typography sx={{ fontSize: '1.5rem', mb: 0.5 }}>{p.icon}</Typography>
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
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Solution block ── */}
      <Box sx={{
        background: '#fff',
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
            Our approach
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
            How AquaGraph makes a difference
          </Typography>
          <Typography sx={{ color: '#555', fontSize: '1rem', lineHeight: 1.8, mb: 6, maxWidth: 900 }}>
            By combining open satellite data with smart processing and a public interface, we give anyone the tools to see and act on water quality, in real time.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, pl: { xs: 0, md: 8 } }}>
            {SOLUTIONS.map((s, i) => (
              <Box key={s.title} sx={{ display: 'flex', gap: { xs: 2, md: 6 } }}>
                {/* Timeline spine */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
                  <Box sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.mid2}, ${C.mid3})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    zIndex: 1,
                  }}>
                    <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1 }}>
                      {String(i + 1).padStart(2, '0')}
                    </Typography>
                  </Box>
                  {i < SOLUTIONS.length - 1 && (
                    <Box sx={{
                      width: 2,
                      flex: 1,
                      background: `linear-gradient(${C.mid3}, ${C.mid2})`,
                      opacity: 0.25,
                      mt: 0.5,
                      mb: 0.5,
                    }} />
                  )}
                </Box>

                {/* Content */}
                <Box sx={{ pb: i < SOLUTIONS.length - 1 ? 4 : 0, pt: 0.5, pl: { xs: 1, md: 3 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Typography sx={{ fontSize: '1.4rem' }}>{s.icon}</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: C.darkest }}>
                      {s.title}
                    </Typography>
                  </Box>
                  <Typography sx={{ color: '#777', fontSize: '0.88rem', lineHeight: 1.7, maxWidth: 900 }}>
                    {s.text}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

    </Box>
  )
}