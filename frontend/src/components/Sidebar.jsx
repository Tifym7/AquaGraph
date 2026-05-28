import { useEffect, useState } from 'react'
import {
  Box, Typography, Divider, List, ListItemButton, ListItemText,
  LinearProgress, Chip, Card, CardContent, Button, Stack, CircularProgress,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import WaterIcon from '@mui/icons-material/Water'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { fetchUpstream, fetchDownstream, getMetricColor, fetchRiver, METRIC_LABELS, METRIC_KEYS } from '../utils'
import RiverEvolution from './RiverEvolution'

const SIDEBAR_WIDTH = 360

/* Purple/aubergine palette - kept consistent with the App-level theme
   (primary #6d28d9) and the AppBar gradient (#10002b → #3c096c → #5a189a). */
const C = {
  bgPaper: '#ffffff',
  bgTint: '#f5f3ff',
  bgTintHover: '#ede9fe',
  border: '#ddd6fe',
  borderStrong: '#c4b5fd',
  primary: '#6d28d9',
  primaryDeep: '#5a189a',
  textMuted: '#5a189a',
  selectedBg: 'rgba(109, 40, 217, 0.08)',
}

function getSegmentNormalized(river) {
  if (river.selectedSegment?.normalized != null) return river.selectedSegment.normalized
  /* Prefer the backend-computed average - it skips segments that have no
     data for the active metric, matching the ranking on /api/rivers. The
     naive client-side average dilutes a high-signal river with zero-padded
     no-data segments and the sidebar ends up reporting 0% for top-10 rivers. */
  if (river.avg_normalized != null) return river.avg_normalized
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

/* Whole-river rollups for the segment-vs-river comparison. The metric value
   reuses the backend average (avg_normalized); indices and risk have no
   precomputed river figure, so we mean them across every segment client-side
   - each key is averaged only over segments that actually report it. */
function getRiverNormalized(river) {
  if (river.avg_normalized != null) return river.avg_normalized
  const segs = river.segments || []
  if (!segs.length) return 0
  return segs.reduce((sum, s) => sum + (s.normalized ?? 0), 0) / segs.length
}

function getRiverIndices(river) {
  const segs = river.segments || []
  if (!segs.length) return {}
  const sums = {}
  const counts = {}
  for (const s of segs) {
    for (const [k, v] of Object.entries(s.indices || {})) {
      if (typeof v !== 'number' || Number.isNaN(v)) continue
      sums[k] = (sums[k] ?? 0) + v
      counts[k] = (counts[k] ?? 0) + 1
    }
  }
  const out = {}
  for (const k of Object.keys(sums)) out[k] = sums[k] / counts[k]
  return out
}

function getRiverRisk(river) {
  const segs = river.segments || []
  if (!segs.length) return { score: 0, level: 'LOW', water: 0, land: 0, is_water: false }
  let n = 0, score = 0, water = 0, land = 0, waterSeg = 0
  for (const s of segs) {
    const r = normalizeRisk(s.risk)
    n += 1; score += r.score; water += r.water; land += r.land
    if (r.is_water) waterSeg += 1
  }
  const avgScore = n ? score / n : 0
  return {
    score: Math.round(avgScore * 100) / 100,
    level: avgScore > 3 ? 'HIGH' : avgScore > 1 ? 'MEDIUM' : 'LOW',
    water: n ? water / n : 0,
    land: n ? land / n : 0,
    is_water: waterSeg * 2 >= n,
  }
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

function FlowCard({ text, icon, accentColor, children, sx }) {
  return (
    <Box mb={2} sx={sx}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ mb: 1, pl: 0.25 }}
      >
        {icon}
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: accentColor || 'text.secondary',
          }}
        >{text}</Typography>
      </Stack>
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
        bgcolor: '#ffffff', border: '1px solid', borderColor: C.border,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { bgcolor: C.bgTint } : {},
      }}
    >
      {direction === 'up'
        ? <ArrowUpwardIcon sx={{ fontSize: 14, color: C.primaryDeep }} />
        : <ArrowDownwardIcon sx={{ fontSize: 14, color: C.primaryDeep }} />}
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: 12 }} noWrap>{river.name}</Typography>
      <Typography variant="caption" fontWeight={700} sx={{ color, minWidth: 32, textAlign: 'right' }}>{pct}%</Typography>
    </Stack>
  )
}

function PropagationSection({ riverId, onRiverClick, metric }) {
  const [upstream, setUpstream] = useState(null)
  const [downstream, setDownstream] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!riverId) return
    setLoading(true)
    /* Defensive dedupe by id - backend should already dedupe but a single
     * stray duplicate breaks React's keyed reconciliation. */
    const dedupe = (arr) => {
      const seen = new Set()
      return arr.filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
    }
    Promise.all([fetchUpstream(riverId, metric), fetchDownstream(riverId, metric)]).then(([up, down]) => {
      const filterFn = r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed')
      setUpstream(dedupe(up.filter(filterFn)).slice(0, 10))
      setDownstream(dedupe(down.filter(filterFn)).slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [riverId, metric])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>

  const hasData = (upstream && upstream.length > 0) || (downstream && downstream.length > 0)
  if (!hasData)
    return <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>No connected rivers.</Typography>

  const filterName = n => !n.startsWith('Tributary') && !n.startsWith('Unnamed')
  /* Render-time dedupe - final safety net so even a stray duplicate id
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
        <FlowCard
          text="Feeds into"
          icon={<ArrowUpwardIcon sx={{ fontSize: 14, color: '#2e7d32' }} />}
          accentColor="#2e7d32"
        >
          {uniq(upstream.filter(r => filterName(r.name))).map((r, i) => {
            const norm = getSegmentNormalized(r)
            return <FlowItem key={`up-${i}-${r.id}`} river={r} direction="up" color={getMetricColor(norm, metric)} onClick={onRiverClick} />
          })}
        </FlowCard>
      )}
      {downstream && downstream.length > 0 && (
        <FlowCard
          text="Flows downstream to"
          icon={<ArrowDownwardIcon sx={{ fontSize: 14, color: '#c2410c' }} />}
          accentColor="#c2410c"
          sx={{ pt: '16px' }}
        >
          {uniq(downstream.filter(r => filterName(r.name))).map((r, i) => {
            const norm = getSegmentNormalized(r)
            return <FlowItem key={`down-${i}-${r.id}`} river={r} direction="down" color={getMetricColor(norm, metric)} onClick={onRiverClick} />
          })}
        </FlowCard>
      )}
    </Box>
  )
}

const fmtIdx = v => typeof v === 'number' ? v.toFixed(4) : (v ?? '-')

/* When `compare` is given, each index shows the selected segment's value
   next to the whole-river average in a second column. */
function SatelliteIndices({ indices, compare }) {
  if (!indices || Object.keys(indices).length === 0) return null
  const keys = compare
    ? Array.from(new Set([...Object.keys(indices), ...Object.keys(compare)]))
    : Object.keys(indices)
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: C.border }}>
      <CardContent sx={{ p: '12px 14px !important' }}>
        {compare && (
          <Box sx={{ ...ROW_STACK_SPB, mb: 0.75 }}>
            <Typography variant="caption" sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }} />
            <Stack direction="row" spacing={2}>
              <Typography variant="caption" sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', minWidth: 56, textAlign: 'right' }}>Segment</Typography>
              <Typography variant="caption" sx={{ color: C.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', minWidth: 56, textAlign: 'right' }}>River avg</Typography>
            </Stack>
          </Box>
        )}
        <Stack spacing={0.5}>
          {keys.map((key) => (
            <Box key={key} sx={ROW_STACK_SPB}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>{INDEX_LABELS[key] || key}</Typography>
              {compare ? (
                <Stack direction="row" spacing={2}>
                  <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace', minWidth: 56, textAlign: 'right' }}>{fmtIdx(indices[key])}</Typography>
                  <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace', minWidth: 56, textAlign: 'right', color: C.textMuted }}>{fmtIdx(compare[key])}</Typography>
                </Stack>
              ) : (
                <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{fmtIdx(indices[key])}</Typography>
              )}
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

/* `compare` (whole-river average risk) renders a muted "river avg" line
   under each card's primary segment figure. */
function SegmentRiskCards({ risk, compare }) {
  if (!risk) return null
  const scoreVal = risk.score ?? 0
  const scoreColor = scoreVal > 3 ? '#e53935' : scoreVal > 1 ? '#ff9800' : '#4caf50'
  const waterVal = risk.water ?? 0
  const landVal = risk.land ?? 0
  const waterColor = waterVal > 0.5 ? '#1565c0' : '#999'
  const landColor = landVal > 0.5 ? '#ff9800' : '#999'
  const safe = v => typeof v === 'number' ? v.toFixed(3) : '-'
  const RiverAvg = ({ children }) => (
    <Typography variant="caption" fontWeight={700} sx={{ color: C.textMuted, display: 'block', fontSize: 10, mt: 0.25 }}>
      River avg {children}
    </Typography>
  )

  return (
    <Stack direction="row" spacing={1}>
      <Card variant="outlined" sx={{ flex: 1, borderColor: C.border }}>
        <CardContent sx={{ p: '8px 12px !important' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', display: 'block', fontSize: 10 }}>Risk Score</Typography>
          <Typography variant="body1" fontWeight={800} sx={{ fontSize: 16, color: scoreColor }}>{scoreVal} / 5</Typography>
          <Typography variant="caption" fontWeight={600} sx={{ color: C.textMuted }}>{risk.level}</Typography>
          {compare && <RiverAvg>{compare.score} / 5</RiverAvg>}
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ flex: 1, borderColor: C.border }}>
        <CardContent sx={{ p: '8px 12px !important' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', display: 'block', fontSize: 10 }}>Water Index</Typography>
          <Typography variant="body1" fontWeight={800} sx={{ fontSize: 16, color: waterColor }}>{safe(waterVal)}</Typography>
          <Typography variant="caption" fontWeight={600} sx={{ color: C.textMuted }}>{risk.is_water ? 'Water' : 'Land'}</Typography>
          {compare && <RiverAvg>{safe(compare.water)}</RiverAvg>}
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ flex: 1, borderColor: C.border }}>
        <CardContent sx={{ p: '8px 12px !important' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', display: 'block', fontSize: 10 }}>Land Index</Typography>
          <Typography variant="body1" fontWeight={800} sx={{ fontSize: 16, color: landColor }}>{safe(landVal)}</Typography>
          <Typography variant="caption" fontWeight={600} sx={{ color: C.textMuted }}>{landVal > 0.5 ? 'High' : 'Low'}</Typography>
          {compare && <RiverAvg>{safe(compare.land)}</RiverAvg>}
        </CardContent>
      </Card>
    </Stack>
  )
}

function RiverDetail({ river, onClose, onRiverClick, metric, user }) {
  const norm = getSegmentNormalized(river)
  const color = getMetricColor(norm, metric)
  const risk = getSegmentRisk(river)
  const indices = getSegmentIndices(river)
  const percentage = Math.round(norm * 100)
  /* A single-segment river is the whole river - never show the segment
     breadcrumb / "Segment #id" view for it, regardless of how
     selectedSegment got set. */
  const isSegmentView = !!river.selectedSegment && (river.segments?.length || 0) > 1
  const metricLabel = METRIC_LABELS[metric] || 'Metric'

  /* Segment vs. whole-river comparison - only meaningful when a segment is
     selected on a multi-segment river. */
  const showCompare = isSegmentView
  const riverNorm = showCompare ? getRiverNormalized(river) : 0
  const riverColor = getMetricColor(riverNorm, metric)
  const riverPct = Math.round(riverNorm * 100)
  const riverIndices = showCompare ? getRiverIndices(river) : null
  const riverRisk = showCompare ? getRiverRisk(river) : null
  /* Clicking the river name in the breadcrumb drops back to the whole-river
     view (reuses the flow-click path, which clears selectedSegment). */
  const backToRiver = () => onRiverClick?.({ id: river.id, name: river.name })

  /* Consistent vertical rhythm - every detail section spaced the same. */
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
            {isSegmentView ? (
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                <Typography
                  variant="caption"
                  onClick={backToRiver}
                  sx={{ color: C.primary, fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >‹ {river.name}</Typography>
                <Typography variant="caption" sx={{ color: C.textMuted }}>/</Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Segment #{river.selectedSegment.object_id}</Typography>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">Full river overview</Typography>
            )}
          </Box>
        </Stack>
        <Card variant="outlined" sx={{ borderRadius: 2, mb: SECTION_MB, borderColor: C.border }}>
          <CardContent sx={{ p: 2, pb: '16px !important' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5, pl: 0.25 }}>{metricLabel} Value</Typography>
            <LinearProgress
              variant="determinate" value={percentage}
              sx={{
                height: 10, borderRadius: 4, bgcolor: C.bgTintHover, mb: showCompare ? 1 : 2.5,
                '& .MuiLinearProgress-bar': { borderRadius: 4, background: `linear-gradient(to right, #4caf50, ${color})` },
              }}
            />
            {showCompare && (
              <Box sx={{ mb: 2.5 }}>
                <Box sx={{ ...ROW_STACK_SPB, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: C.textMuted, fontWeight: 600 }}>Whole river ({river.segments.length} segments)</Typography>
                  <Typography variant="caption" sx={{ color: C.textMuted, fontWeight: 700 }}>{Math.round(riverNorm * 1000) / 10}</Typography>
                </Box>
                <LinearProgress
                  variant="determinate" value={riverPct}
                  sx={{
                    height: 6, borderRadius: 3, bgcolor: C.bgTintHover,
                    '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: riverColor },
                  }}
                />
              </Box>
            )}
            <Stack sx={ROW_STACK_SPB}>
              <Box>
                <Typography variant="h3" fontWeight={800} letterSpacing={-1.5} sx={{ color, lineHeight: 1 }}>{Math.round(norm * 1000) / 10}</Typography>
                {showCompare && <Typography variant="caption" sx={{ color: C.textMuted, fontWeight: 600 }}>This segment</Typography>}
              </Box>
              <Chip
                label={risk.level} size="small"
                sx={{
                  fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
                  textTransform: 'uppercase', color,
                  bgcolor: 'transparent', border: 'none',
                  '& .MuiChip-label': { px: 0 },
                }}
              />
            </Stack>
          </CardContent>
        </Card>
        <Box mb={SECTION_MB}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5, pl: 0.25 }}>Satellite Indices{showCompare ? ' - segment vs river' : ''}</Typography>
          <SatelliteIndices indices={indices} compare={riverIndices} />
        </Box>
        <Box mb={SECTION_MB} sx={{ pt: '16px' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5, pl: 0.25 }}>Risk Indicators{showCompare ? ' - segment vs river' : ''}</Typography>
          <SegmentRiskCards risk={risk} compare={riverRisk} />
        </Box>
        <Box mb={SECTION_MB} sx={{ pt: '16px' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5, pl: 0.25 }}>Evolution Over Time</Typography>
          <RiverEvolution
            riverId={river.id}
            riverName={river.name}
            objectId={isSegmentView ? river.selectedSegment.object_id : null}
            user={user}
          />
        </Box>
        <Box sx={{ pt: '16px' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1.5, pl: 0.25 }}>Connected Rivers</Typography>
          <PropagationSection riverId={river.id} onRiverClick={onRiverClick} metric={metric} />
        </Box>
      </Box>
    </Box>
  )
}

function RiverListItem({ river, isSelected, onSelect, metric }) {
  const norm = getSegmentNormalized(river)
  const color = getMetricColor(norm, metric)
  const percentage = Math.round(norm * 100)

  return (
    <ListItemButton selected={isSelected} onClick={() => onSelect(river)} sx={{ borderRadius: 2, mx: 1, mb: 0.5, '&:hover': { bgcolor: C.bgTint }, '&.Mui-selected': { bgcolor: C.selectedBg, borderLeft: '3px solid', borderColor: C.primary, '&:hover': { bgcolor: C.selectedBg } } }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, mr: 1.5, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
      <ListItemText
        primary={<Typography variant="body2" fontWeight={600} noWrap>{river.name}</Typography>}
        secondary={<LinearProgress variant="determinate" value={percentage} sx={{ height: 4, borderRadius: 2, mt: 0.5, bgcolor: C.bgTintHover, '& .MuiLinearProgress-bar': { borderRadius: 2, bgcolor: color } }} />}
      />
      <Typography variant="body2" fontWeight={700} sx={{ color, ml: 1.5, minWidth: 38, textAlign: 'right' }}>{percentage}%</Typography>
    </ListItemButton>
  )
}

export default function Sidebar({ rivers, selectedRiver, onSelect, onClose, metric, onMetricChange, user }) {
  const handleFlowClick = async (clickedRiver) => {
    /* Navigating to a connected river is a whole-river selection: clear any
       segment selected on the previous river and fetch under the active
       metric so the panel colours stay consistent with the connections. */
    if (rivers) {
      const fullRiver = rivers.find(r => r.id === clickedRiver.id)
      if (fullRiver) { onSelect({ ...fullRiver, selectedSegment: null }); return }
    }
    const fetched = await fetchRiver(clickedRiver.id, metric)
    if (fetched) onSelect({ ...fetched, selectedSegment: null })
  }

  const namedRivers = (rivers || []).filter(r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed'))
  /* Dedupe top-10 too - same defensive pattern as PropagationSection. */
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
      width: { xs: '100%', md: SIDEBAR_WIDTH }, flexShrink: 0, bgcolor: C.bgPaper,
      borderRight: '1px solid', borderColor: C.border,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      height: '100%',
    }}>
      {/* Metric selector - moved here from the map. */}
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
              border: `1px solid ${C.border}`, borderRadius: 6,
              fontSize: 13, fontWeight: 600, color: C.primaryDeep,
              backgroundColor: C.bgTint, cursor: 'pointer', outline: 'none',
            }}
          >
            {METRIC_KEYS.map((k) => (
              <option key={k} value={k}>{METRIC_LABELS[k]}</option>
            ))}
          </select>
        </Box>
      )}
      <Divider sx={{ borderColor: C.border }} />
      {!selectedRiver && (
        <>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1} display="block">
              Top 10 highest values
            </Typography>
          </Box>
          <Divider sx={{ borderColor: C.border }} />
        </>
      )}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {selectedRiver ? (
          <RiverDetail river={selectedRiver} metric={metric} onClose={() => { onSelect(null); onClose() }} onRiverClick={handleFlowClick} user={user} />
        ) : (
          <List disablePadding sx={{ pt: 1 }}>
            {top10.map((river, i) => (
              <RiverListItem key={`top-${i}-${river.id}`} river={river} isSelected={selectedRiver?.id === river.id} onSelect={onSelect} metric={metric} />
            ))}
          </List>
        )}
      </Box>
    </Box>
  )
}
