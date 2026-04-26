import { useEffect, useState } from 'react'
import {
  Box, Typography, Divider, List, ListItemButton, ListItemText,
  LinearProgress, Chip, Card, CardContent, Button, Stack, CircularProgress,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import WaterIcon from '@mui/icons-material/Water'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { fetchUpstream, fetchDownstream, getPollutionColor, fetchRiver, METRIC_LABELS, METRIC_KEYS } from '../utils'

const SIDEBAR_WIDTH = 360

function getSegmentNormalized(river) {
  if (river.selectedSegment?.normalized != null) return river.selectedSegment.normalized
  const segments = river.segments || []
  if (!segments.length) return 0
  const total = segments.reduce((sum, s) => sum + (s.normalized ?? 0), 0)
  return total / segments.length
}

function normalizeRisk(risk) {
  if (!risk) return { score: 0, level: 'LOW', water: 0, land: 0, is_water: false }
  return {
    score: risk.risk_score ?? risk.score ?? 0,
    level: risk.risk_level ?? risk.level ?? 'LOW',
    water: risk.water_risk ?? risk.water ?? 0,
    land: risk.land_risk ?? risk.land ?? 0,
    is_water: !!(risk.is_water),
  }
}

function getSegmentRisk(river) {
  if (river.selectedSegment?.risk) return normalizeRisk(river.selectedSegment.risk)
  const segments = river.segments || []
  if (!segments.length) return { score: 0, level: 'LOW', water: 0, land: 0, is_water: false }
  const mostPolluted = segments.reduce((worst, s) =>
    (s.risk?.risk_score ?? 0) > (worst.risk?.risk_score ?? 0) ? s : worst, segments[0])
  return normalizeRisk(mostPolluted.risk)
}

function getSegmentIndices(river) {
  if (river.selectedSegment?.indices) return river.selectedSegment.indices
  const segments = river.segments || []
  if (!segments.length) return {}
  const mostPolluted = segments.reduce((worst, s) =>
    (s.risk?.risk_score ?? 0) > (worst.risk?.risk_score ?? 0) ? s : worst, segments[0])
  return mostPolluted.indices || {}
}

const INDEX_LABELS = {
  NDVI: 'NDVI (vegetation)',
  MNDWI: 'MNDWI (water)',
  NDCI: 'NDCI (chlorophyll)',
  BSI: 'BSI (bare soil)',
  TURBIDITY: 'TURBIDITY (sediment)',
}

/* ---- MUI-compatible helpers ---- */
const ROW_STACK = { display: 'flex', alignItems: 'center', gap: 1 }
const ROW_STACK_SPB = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const UPPERCASE_CAPTION = { textTransform: 'uppercase', letterSpacing: 1 }
const CAPTION_LABEL = {
  variant: 'caption',
  color: 'text.secondary',
  fontWeight: 700,
  sx: { textTransform: 'uppercase', letterSpacing: 1 },
}

function FlowCard({ text, children }) {
  return (
    <Box mb={2}>
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={700}
        sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}
      >{text}</Typography>
      <Stack spacing={0.5}>{children}</Stack>
    </Box>
  )
}

function SectionLabel({ icon, text }) {
  return (
    <Stack sx={ROW_STACK}>
      {icon}
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{text}</Typography>
    </Stack>
  )
}

/* ---- Components ---- */

function FlowItem({ river, direction, color, onClick }) {
  const norm = getSegmentNormalized(river)
  const pct = Math.round(norm * 100)
  return (
    <Stack
      direction="row"
      spacing={1}
      onClick={() => onClick && onClick(river)}
      sx={{
        px: 1.5, py: 1, borderRadius: 1,
        bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { bgcolor: 'grey.100' } : {},
      }}
    >
      {direction === 'up'
        ? <ArrowUpwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        : <ArrowDownwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: 12 }} noWrap>{river.name}</Typography>
      <Typography variant="caption" fontWeight={700} sx={{ color, minWidth: 32, textAlign: 'right' }}>{pct}%</Typography>
    </Stack>
  )
}

function PropagationSection({ riverId, onRiverClick }) {
  const [upstream, setUpstream] = useState(null)
  const [downstream, setDownstream] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!riverId) return
    setLoading(true)
    /* Defensive dedupe by id — backend should already dedupe but a single
     * stray duplicate breaks React's keyed reconciliation. */
    const dedupe = (arr) => {
      const seen = new Set()
      return arr.filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
    }
    Promise.all([fetchUpstream(riverId), fetchDownstream(riverId)]).then(([up, down]) => {
      const filterFn = r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed')
      setUpstream(dedupe(up.filter(filterFn)).slice(0, 10))
      setDownstream(dedupe(down.filter(filterFn)).slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [riverId])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>

  const hasData = (upstream && upstream.length > 0) || (downstream && downstream.length > 0)
  if (!hasData)
    return <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>No connected rivers.</Typography>

  const filterName = n => !n.startsWith('Tributary') && !n.startsWith('Unnamed')
  /* Render-time dedupe — final safety net so even a stray duplicate id
     from any source (state ordering, race condition, malformed cache)
     can't trigger React's duplicate-key warning. */
  const uniq = (arr) => {
    const seen = new Set()
    return arr.filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
  }

  return (
    <Box>
      {upstream && upstream.length > 0 && (
        <FlowCard text="Feeds into">
          {uniq(upstream.filter(r => filterName(r.name))).map((r, i) => {
            const norm = getSegmentNormalized(r)
            return <FlowItem key={`up-${i}-${r.id}`} river={r} direction="up" color={getPollutionColor(norm)} onClick={onRiverClick} />
          })}
        </FlowCard>
      )}
      {downstream && downstream.length > 0 && (
        <FlowCard text="Flows downstream to">
          {uniq(downstream.filter(r => filterName(r.name))).map((r, i) => {
            const norm = getSegmentNormalized(r)
            return <FlowItem key={`down-${i}-${r.id}`} river={r} direction="down" color={getPollutionColor(norm)} onClick={onRiverClick} />
          })}
        </FlowCard>
      )}
    </Box>
  )
}

function SatelliteIndices({ indices }) {
  if (!indices || Object.keys(indices).length === 0) return null
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: '12px 14px !important' }}>
        <Stack spacing={0.5}>
          {Object.entries(indices).map(([key, value]) => (
            <Box key={key} sx={ROW_STACK_SPB}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>{INDEX_LABELS[key] || key}</Typography>
              <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{typeof value === 'number' ? value.toFixed(4) : value}</Typography>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

function SegmentRiskCards({ risk }) {
  if (!risk) return null
  const scoreVal = risk.score ?? 0
  const scoreColor = scoreVal > 3 ? '#e53935' : scoreVal > 1 ? '#ff9800' : '#4caf50'
  const waterVal = risk.water ?? 0
  const landVal = risk.land ?? 0
  const waterColor = waterVal > 0.5 ? '#1565c0' : '#999'
  const landColor = landVal > 0.5 ? '#ff9800' : '#999'
  const safe = v => typeof v === 'number' ? v.toFixed(3) : '—'

  return (
    <Stack direction="row" spacing={1}>
      <Card variant="outlined" sx={{ flex: 1 }}>
        <CardContent sx={{ p: '8px 12px !important' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', display: 'block', fontSize: 10 }}>Risk Score</Typography>
          <Typography variant="body1" fontWeight={800} sx={{ fontSize: 16, color: scoreColor }}>{scoreVal} / 5</Typography>
          <Typography variant="caption" fontWeight={600} sx={{ color: '#666' }}>{risk.level}</Typography>
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ flex: 1 }}>
        <CardContent sx={{ p: '8px 12px !important' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', display: 'block', fontSize: 10 }}>Water Index</Typography>
          <Typography variant="body1" fontWeight={800} sx={{ fontSize: 16, color: waterColor }}>{safe(waterVal)}</Typography>
          <Typography variant="caption" fontWeight={600} sx={{ color: '#666' }}>{risk.is_water ? 'Water' : 'Land'}</Typography>
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ flex: 1 }}>
        <CardContent sx={{ p: '8px 12px !important' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', display: 'block', fontSize: 10 }}>Land Index</Typography>
          <Typography variant="body1" fontWeight={800} sx={{ fontSize: 16, color: landColor }}>{safe(landVal)}</Typography>
          <Typography variant="caption" fontWeight={600} sx={{ color: '#666' }}>{landVal > 0.5 ? 'High' : 'Low'}</Typography>
        </CardContent>
      </Card>
    </Stack>
  )
}

function RiverDetail({ river, onClose, onRiverClick, metric }) {
  const norm = getSegmentNormalized(river)
  const color = getPollutionColor(norm)
  const risk = getSegmentRisk(river)
  const indices = getSegmentIndices(river)
  const percentage = Math.round(norm * 100)
  const isSegmentView = !!river.selectedSegment
  const metricLabel = METRIC_LABELS[metric] || 'Metric'

  /* Consistent vertical rhythm — every detail section spaced the same. */
  const SECTION_MB = 3

  return (
    <Box>
      <Box sx={{ p: 2.5 }}>
        <Button
          variant="text" size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onClose}
          sx={{ color: 'text.secondary', ml: -1, mb: 2, textTransform: 'none', fontWeight: 600 }}
        >Back to rivers</Button>
        <Stack sx={ROW_STACK} mb={SECTION_MB}>
          <WaterIcon sx={{ color, fontSize: 28 }} />
          <Box>
            <Typography variant="h5" fontWeight={800} letterSpacing={-0.5}>{river.name}</Typography>
            <Typography variant="caption" color="text.secondary">{isSegmentView ? `Segment ${river.selectedSegment.object_id}` : 'Full river overview'}</Typography>
          </Box>
        </Stack>
        <Card variant="outlined" sx={{ borderRadius: 2, mb: SECTION_MB }}>
          <CardContent sx={{ p: 2, pb: '16px !important' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5 }}>{metricLabel} Value</Typography>
            <LinearProgress
              variant="determinate" value={percentage}
              sx={{
                height: 10, borderRadius: 4, bgcolor: 'grey.200', mb: 2.5,
                '& .MuiLinearProgress-bar': { borderRadius: 4, background: `linear-gradient(to right, #4caf50, ${color})` },
              }}
            />
            <Stack sx={ROW_STACK_SPB}>
              <Typography variant="h3" fontWeight={800} letterSpacing={-1.5} sx={{ color, lineHeight: 1 }}>{Math.round(norm * 1000) / 10}</Typography>
              <Chip
                label={risk.level} size="small"
                sx={{
                  fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
                  textTransform: 'uppercase', color,
                  bgcolor: `${color}18`, border: `1px solid ${color}40`, borderRadius: 1,
                }}
              />
            </Stack>
          </CardContent>
        </Card>
        <Box mb={SECTION_MB}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5 }}>Satellite Indices</Typography>
          <SatelliteIndices indices={indices} />
        </Box>
        <Box mb={SECTION_MB}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5 }}>Risk Indicators</Typography>
          <SegmentRiskCards risk={risk} />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5 }}>Connected Rivers</Typography>
          <PropagationSection riverId={river.id} onRiverClick={onRiverClick} />
        </Box>
      </Box>
    </Box>
  )
}

function RiverListItem({ river, isSelected, onSelect }) {
  const norm = getSegmentNormalized(river)
  const color = getPollutionColor(norm)
  const percentage = Math.round(norm * 100)

  return (
    <ListItemButton selected={isSelected} onClick={() => onSelect(river)} sx={{ borderRadius: 2, mx: 1, mb: 0.5, '&.Mui-selected': { bgcolor: 'primary.50', borderLeft: '3px solid', borderColor: 'primary.main' } }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, mr: 1.5, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
      <ListItemText
        primary={<Typography variant="body2" fontWeight={600} noWrap>{river.name}</Typography>}
        secondary={<LinearProgress variant="determinate" value={percentage} sx={{ height: 4, borderRadius: 2, mt: 0.5, bgcolor: 'grey.200', '& .MuiLinearProgress-bar': { borderRadius: 2, bgcolor: color } }} />}
      />
      <Typography variant="body2" fontWeight={700} sx={{ color, ml: 1.5, minWidth: 38, textAlign: 'right' }}>{percentage}%</Typography>
    </ListItemButton>
  )
}

export default function Sidebar({ rivers, selectedRiver, onSelect, onClose, metric, onMetricChange }) {
  const handleFlowClick = async (clickedRiver) => {
    if (rivers) {
      const fullRiver = rivers.find(r => r.id === clickedRiver.id)
      if (fullRiver) { onSelect(fullRiver); return }
    }
    const fetched = await fetchRiver(clickedRiver.id)
    if (fetched) onSelect(fetched)
  }

  const namedRivers = (rivers || []).filter(r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed'))
  /* Dedupe top-10 too — same defensive pattern as PropagationSection. */
  const seenTop = new Set()
  const uniqueRivers = namedRivers.filter(r => {
    if (seenTop.has(r.id)) return false
    seenTop.add(r.id)
    return true
  })
  const sorted = [...uniqueRivers].sort((a, b) => getSegmentNormalized(b) - getSegmentNormalized(a))
  const top10 = sorted.slice(0, 10)

  return (
    <Box sx={{
      width: SIDEBAR_WIDTH, flexShrink: 0, bgcolor: 'background.paper',
      borderRight: '1px solid', borderColor: 'divider',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Metric selector — moved here from the map. */}
      {onMetricChange && (
        <Box sx={{ px: 2.5, pt: 2, pb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={700}
            sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.75 }}
          >Metric</Typography>
          <select
            value={metric}
            onChange={(e) => onMetricChange(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px',
              border: '1px solid #e0e0e0', borderRadius: 6,
              fontSize: 13, fontWeight: 600, color: '#333',
              backgroundColor: '#fafafa', cursor: 'pointer', outline: 'none',
            }}
          >
            {METRIC_KEYS.map((k) => (
              <option key={k} value={k}>{METRIC_LABELS[k]}</option>
            ))}
          </select>
        </Box>
      )}
      <Divider />
      {!selectedRiver && (
        <>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1} display="block">
              Top 10 highest values
            </Typography>
          </Box>
          <Divider />
        </>
      )}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {selectedRiver ? (
          <RiverDetail river={selectedRiver} metric={metric} onClose={() => { onSelect(null); onClose() }} onRiverClick={handleFlowClick} />
        ) : (
          <List disablePadding sx={{ pt: 1 }}>
            {top10.map((river, i) => (
              <RiverListItem key={`top-${i}-${river.id}`} river={river} isSelected={selectedRiver?.id === river.id} onSelect={onSelect} />
            ))}
          </List>
        )}
      </Box>
    </Box>
  )
}
