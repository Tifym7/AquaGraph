import { useEffect, useMemo, useState } from 'react'
import { Box, Typography, Button, CircularProgress } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { fetchRiverHistory, riverReportUrl, HISTORY_METRICS } from '../utils'

/* Purple palette - matches Sidebar's C constant. */
const C = {
  primary: '#6d28d9',
  primaryDeep: '#5a189a',
  border: '#ddd6fe',
  bgTint: '#f5f3ff',
  textMuted: '#5a189a',
}

const W = 312
const H = 140
const PAD = { l: 34, r: 8, t: 10, b: 22 }

/* Dependency-free SVG line chart of the average metric value over time, with
   a faint min/max band. No charting library is pulled into the bundle. */
function Chart({ points }) {
  const geom = useMemo(() => {
    const valued = points.filter((p) => p.avg != null)
    if (valued.length < 2) return null
    const ys = valued.flatMap((p) => [p.min ?? p.avg, p.max ?? p.avg, p.avg])
    let lo = Math.min(...ys)
    let hi = Math.max(...ys)
    if (lo === hi) { lo -= 1; hi += 1 }
    const iw = W - PAD.l - PAD.r
    const ih = H - PAD.t - PAD.b
    const x = (i) => PAD.l + (i / (valued.length - 1)) * iw
    const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih
    const line = valued.map((p, i) => `${x(i)},${y(p.avg)}`).join(' ')
    const band =
      valued.map((p, i) => `${x(i)},${y(p.max ?? p.avg)}`).join(' ') +
      ' ' +
      valued.map((p, i) => `${x(i)},${y(p.min ?? p.avg)}`).reverse().join(' ')
    return {
      line, band, lo, hi, valued,
      first: valued[0].date, last: valued[valued.length - 1].date,
    }
  }, [points])

  if (!geom) {
    return (
      <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', py: 3, textAlign: 'center' }}>
        Not enough observations yet to plot an evolution. History fills in as
        new satellite passes are ingested.
      </Typography>
    )
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="River metric evolution">
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke={C.border} />
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={C.border} />
      <polygon points={geom.band} fill={C.primary} fillOpacity={0.12} />
      <polyline points={geom.line} fill="none" stroke={C.primary} strokeWidth={2} />
      <text x={PAD.l - 4} y={PAD.t + 4} textAnchor="end" fontSize="9" fill={C.textMuted}>
        {geom.hi.toFixed(2)}
      </text>
      <text x={PAD.l - 4} y={H - PAD.b} textAnchor="end" fontSize="9" fill={C.textMuted}>
        {geom.lo.toFixed(2)}
      </text>
      <text x={PAD.l} y={H - 6} fontSize="9" fill={C.textMuted}>{geom.first}</text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="9" fill={C.textMuted}>
        {geom.last}
      </text>
    </svg>
  )
}

export default function RiverEvolution({ riverId, riverName }) {
  const [metric, setMetric] = useState('NDTI')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!riverId) return
    let alive = true
    setLoading(true)
    const s = HISTORY_METRICS[metric]?.sensor || 'S2'
    fetchRiverHistory(riverId, metric, s).then((res) => {
      if (alive) { setData(res); setLoading(false) }
    })
    return () => { alive = false }
  }, [riverId, metric])

  const points = data?.points || []
  const sensor = HISTORY_METRICS[metric]?.sensor || 'S2'
  const sensorMetrics = Object.keys(HISTORY_METRICS).filter(
    (k) => HISTORY_METRICS[k].sensor === sensor,
  )

  return (
    <Box>
      <Box
        component="select"
        value={metric}
        onChange={(e) => setMetric(e.target.value)}
        sx={{
          width: '100%', mb: 1.5, p: '8px 10px', borderRadius: 1.5,
          border: `1px solid ${C.border}`, bgcolor: C.bgTint,
          color: C.primaryDeep, fontWeight: 600, fontSize: 13,
          fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        {Object.entries(HISTORY_METRICS).map(([k, m]) => (
          <option key={k} value={k}>{m.label}</option>
        ))}
      </Box>

      <Box sx={{ minHeight: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {loading
          ? <CircularProgress size={22} sx={{ color: C.primary }} />
          : <Chart points={points} />}
      </Box>

      <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', mt: 1 }}>
        {points.length} observation{points.length === 1 ? '' : 's'}
      </Typography>
      <Box sx={{ mt: '0.5cm', display: 'flex', justifyContent: 'center' }}>
        <Button
          size="small"
          variant="contained"
          disableElevation
          startIcon={<DownloadIcon sx={{ fontSize: 17 }} />}
          href={riverReportUrl(riverId, { metrics: sensorMetrics, sensor })}
          target="_blank"
          rel="noopener"
          sx={{
            textTransform: 'none', fontWeight: 700, fontSize: 12.5,
            color: '#fff', borderRadius: 999, px: 2, py: 0.7,
            letterSpacing: 0.2,
            background: 'linear-gradient(135deg, #3c096c 0%, #5a189a 55%, #7b2cbf 100%)',
            boxShadow: '0 4px 14px rgba(90,24,154,0.35)',
            transition: 'transform .15s ease, box-shadow .15s ease',
            '&:hover': {
              background: 'linear-gradient(135deg, #2d0a52 0%, #5a189a 50%, #6d28d9 100%)',
              boxShadow: '0 6px 18px rgba(90,24,154,0.45)',
              transform: 'translateY(-1px)',
            },
            '&:active': { transform: 'translateY(0)' },
          }}
        >
          PDF report
        </Button>
      </Box>
    </Box>
  )
}
