import { Box, Typography } from '@mui/material'

const C = {
  mid2: '#7b2cbf',
  mid3: '#9d4edd',
}

const STATS = [
  { num: '3,500+', label: 'Monitored segments' },
  { num: '7',      label: 'Satellite metrics' },
  { num: '24h',    label: 'Data update cycle' },
  { num: 'S1/S2',  label: 'ESA Sentinel data' },
]

export default function StatsBar() {
  return (
    <Box sx={{
      display: 'flex',
      background: '#f5f3ff',
      borderTop: '1px solid rgba(90,24,154,0.12)',
      borderBottom: '1px solid rgba(90,24,154,0.12)',
      flexWrap: 'wrap',
    }}>
      {STATS.map(({ num, label }, i) => (
        <Box key={label} sx={{
          flex: 1,
          minWidth: '25%',
          textAlign: 'center',
          py: { xs: 1.5, md: 2 },
          px: 1,
          borderRight: i < STATS.length - 1 ? '1px solid rgba(90,24,154,0.12)' : 'none',
        }}>
          <Typography sx={{ fontSize: { xs: '1.4rem', md: '1.8rem' }, fontWeight: 800, color: C.mid2, letterSpacing: '-0.03em', lineHeight: 1.1, mb: 0.25 }}>
            {num}
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: C.mid3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {label}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}