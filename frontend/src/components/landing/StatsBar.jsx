import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import WavesIcon from '@mui/icons-material/Waves'
import InsightsIcon from '@mui/icons-material/Insights'
import UpdateIcon from '@mui/icons-material/Update'
import { fetchPipelineStats, METRIC_KEYS } from '../../utils'

const C = {
  darkest: '#10002b',
  dark2: '#3c096c',
  mid1: '#5a189a',
  mid2: '#7b2cbf',
  mid3: '#9d4edd',
  lightest: '#e0aaff',
}

/* Eased count-up so the numbers feel alive when the live API returns. */
function useCountUp(target, duration = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) { setValue(0); return }
    let start = null
    let rafId
    const step = (ts) => {
      if (start == null) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration])
  return value
}

const fmt = (n) => (n == null ? '-' : n.toLocaleString())

function StatCard({ icon, value, label, sub }) {
  return (
    <Box sx={{
      p: { xs: 2, md: 2.5 },
      borderRadius: 3,
      background: '#ffffff',
      border: '1px solid rgba(122,44,191,0.12)',
      boxShadow: '0 4px 14px rgba(60,9,108,0.06)',
      transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 14px 36px rgba(90,24,154,0.16)',
        borderColor: 'rgba(122,44,191,0.32)',
      },
    }}>
      <Box sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${C.mid2} 0%, ${C.mid3} 100%)`,
        color: '#fff',
        mb: 1.25,
        boxShadow: '0 6px 16px rgba(122,44,191,0.28)',
      }}>
        {icon}
      </Box>

      <Typography sx={{
        fontSize: { xs: '1.7rem', md: '2.1rem' },
        fontWeight: 900,
        color: C.darkest,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        mb: 0.5,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </Typography>
      <Typography sx={{
        fontSize: '0.7rem',
        fontWeight: 700,
        color: C.mid2,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        mb: 0.5,
      }}>
        {label}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: '0.75rem', color: '#666', lineHeight: 1.45 }}>
          {sub}
        </Typography>
      )}
    </Box>
  )
}

export default function StatsBar() {
  const [stats, setStats] = useState(null)
  useEffect(() => { fetchPipelineStats().then(setStats) }, [])

  const s2 = stats?.sensors?.S2 || {}
  const s1 = stats?.sensors?.S1 || {}
  const segments = Math.max(s2.segments || 0, s1.segments || 0)
  const dates = (s2.dates || 0) + (s1.dates || 0)

  const segmentsAnim = useCountUp(segments)
  const datesAnim = useCountUp(dates)

  return (
    <Box sx={{
      background: '#ffffff',
      // Symmetric vertical padding so the stat cards float in a clear
      // white band - they used to butt directly against the next
      // section's tinted gradient (pb was 0).
      pt: { xs: 4, md: 5.5 },
      pb: { xs: 4, md: 5.5 },
      px: { xs: 2, md: 4 },
    }}>
      <Box sx={{
        position: 'relative',
        maxWidth: 1100, mx: 'auto',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        gap: { xs: 1.5, md: 2.5 },
      }}>
        <StatCard
          icon={<WavesIcon sx={{ fontSize: 22 }} />}
          value={segments ? fmt(segmentsAnim) : '-'}
          label="Monitored segments"
          sub="EU-Hydro segments under live satellite coverage"
        />
        <StatCard
          icon={<InsightsIcon sx={{ fontSize: 22 }} />}
          value={9}
          label="Satellite metrics"
          sub="NDWI, NDCI, turbidity, oil risk and more"
        />
        <StatCard
          icon={<UpdateIcon sx={{ fontSize: 22 }} />}
          value={dates ? fmt(datesAnim) : '<5h'}
          label={dates ? 'Satellite acquisitions' : 'Update cadence'}
          sub={dates ? 'Distinct S1 + S2 dates ingested so far' : 'New observations land within few hours'}
        />
        <StatCard
          icon={<SatelliteAltIcon sx={{ fontSize: 22 }} />}
          value="S1 / S2"
          label="ESA Sentinel data"
          sub="Sentinel-1 SAR + Sentinel-2 optical imagery"
        />
      </Box>
    </Box>
  )
}
