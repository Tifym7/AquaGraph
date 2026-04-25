import { useEffect, useState } from 'react'
import {
  Box, Typography, Divider, List, ListItemButton, ListItemText,
  LinearProgress, Chip, Card, CardContent, Button,
  Stack, CircularProgress,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import WaterIcon from '@mui/icons-material/Water'
import ScienceIcon from '@mui/icons-material/Science'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import CallMergeIcon from '@mui/icons-material/CallMerge'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { fetchUpstream, fetchDownstream, getPollutionColor, fetchRiver } from '../utils'

const SIDEBAR_WIDTH = 360

function PollutantCard({ label, value, unit }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: '12px 14px !important' }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.8} display="block" mb={0.5}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={800} letterSpacing={-0.5} lineHeight={1.2} color="text.primary">
          {value} {unit}
        </Typography>
      </CardContent>
    </Card>
  )
}

function FlowItem({ river, direction, onClick }) {
  const color = getPollutionColor(river.pollution_level)
  const pct = Math.round(river.pollution_level * 100)

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      onClick={() => onClick && onClick(river)}
      sx={{
        px: 1.5, py: 1,
        borderRadius: 1,
        bgcolor: 'grey.50',
        border: '1px solid',
        borderColor: 'grey.200',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { bgcolor: 'grey.100' } : {},
      }}
    >
      {direction === 'up' ? (
        <ArrowUpwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
      ) : (
        <ArrowDownwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
      )}
      <Box
        sx={{
          width: 8, height: 8, borderRadius: '50%',
          bgcolor: color, flexShrink: 0,
        }}
      />
      <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: 12 }} noWrap>
        {river.name}
      </Typography>
      <Typography variant="caption" fontWeight={700} sx={{ color, minWidth: 32, textAlign: 'right' }}>
        {pct}%
      </Typography>
    </Stack>
  )
}

function PropagationSection({ riverId, onRiverClick }) {
  const [upstream, setUpstream] = useState(null)
  const [downstream, setDownstream] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchUpstream(riverId),
      fetchDownstream(riverId),
    ]).then(([up, down]) => {
      // Only show named and significant rivers
      setUpstream(up.filter(r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed')).slice(0, 10))
      setDownstream(down.filter(r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed')).slice(0, 5))
      setLoading(false)
    })
  }, [riverId])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={2}>
        <CircularProgress size={20} />
      </Box>
    )
  }

  const hasData = (upstream && upstream.length > 0) || (downstream && downstream.length > 0)

  if (!hasData) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ px: 2.5, py: 1, display: 'block' }}>
        No connected rivers found in the dataset.
      </Typography>
    )
  }

  return (
    <Box sx={{ px: 2.5, pb: 2 }}>
      {/* Upstream */}
      {upstream && upstream.length > 0 && (
        <Box mb={2}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <CallMergeIcon sx={{ fontSize: 16, color: 'text.secondary', transform: 'rotate(180deg)' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={1}>
              Feeds into this river ({upstream.length})
            </Typography>
          </Box>
          <Stack spacing={0.5}>
            {upstream.map(r => (
              <FlowItem key={r.id} river={r} direction="up" onClick={onRiverClick} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Downstream */}
      {downstream && downstream.length > 0 && (
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <ArrowDownwardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={1}>
              Flows downstream to ({downstream.length})
            </Typography>
          </Box>
          <Stack spacing={0.5}>
            {downstream.map(r => (
              <FlowItem key={r.id} river={r} direction="down" onClick={onRiverClick} />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}

function RiverDetail({ river, onClose, onRiverClick }) {
  const color = getPollutionColor(river.pollution_level)
  const percentage = Math.round(river.pollution_level * 100)

  return (
    <Box sx={{ animation: 'fadeIn 0.25s ease' }}>
      <Box sx={{ p: 2.5 }}>
        {/* Back Button */}
        <Button
          variant="text"
          size="small"
          startIcon={<ArrowBackIcon fontSize="small" />}
          onClick={onClose}
          sx={{ color: 'text.secondary', ml: -1, mb: 1.5, textTransform: 'none', fontWeight: 600 }}
        >
          Back to rivers
        </Button>

        {/* Header row */}
        <Stack direction="row" alignItems="center" gap={1} mb={3}>
          <WaterIcon sx={{ color, fontSize: 28 }} />
          <Typography variant="h5" fontWeight={800} letterSpacing={-0.5}>{river.name}</Typography>
        </Stack>

        {/* Pollution gauge card */}
        <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
          <CardContent sx={{ p: 2, pb: '16px !important' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={1} display="block" mb={1.5}>
              Pollution Index
            </Typography>

            <LinearProgress
              variant="determinate"
              value={percentage}
              sx={{
                height: 10,
                borderRadius: 4,
                bgcolor: 'grey.200',
                mb: 2.5,
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  background: `linear-gradient(to right, #4caf50, ${color})`,
                },
              }}
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h3" fontWeight={800} letterSpacing={-1.5} sx={{ color, lineHeight: 1 }}>
                {percentage}%
              </Typography>
              <Chip
                label={river.pollution_label}
                size="small"
                sx={{
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color,
                  bgcolor: `${color}18`,
                  border: `1px solid ${color}40`,
                  borderRadius: 1,
                }}
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Pollutant breakdown */}
        <Box mb={1.5} display="flex" alignItems="center" gap={1}>
          <ScienceIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={1}>
            Pollutant Breakdown
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, mb: 3 }}>
          <PollutantCard label="Nitrates" value={river.pollutants.nitrates} unit="mg/L" />
          <PollutantCard label="Phosphates" value={river.pollutants.phosphates} unit="mg/L" />
          <PollutantCard label="Heavy Metals" value={river.pollutants.heavy_metals} unit="mg/L" />
          <PollutantCard label="Suspended" value={river.pollutants.suspended_solids} unit="mg/L" />
        </Box>
      </Box>

      <Divider />

      {/* Pollution Propagation */}
      <Box pt={2}>
        <Box display="flex" alignItems="center" gap={1} px={2.5} mb={1.5}>
          <CallMergeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={1}>
            Pollution Propagation
          </Typography>
        </Box>
        <PropagationSection riverId={river.id} onRiverClick={onRiverClick} />
      </Box>
    </Box>
  )
}

function RiverListItem({ river, isSelected, onSelect }) {
  const color = getPollutionColor(river.pollution_level)
  const percentage = Math.round(river.pollution_level * 100)

  return (
    <ListItemButton
      selected={isSelected}
      onClick={() => onSelect(river)}
      sx={{
        borderRadius: 2,
        mx: 1,
        mb: 0.5,
        '&.Mui-selected': {
          bgcolor: 'primary.50',
          borderLeft: '3px solid',
          borderColor: 'primary.main',
        },
      }}
    >
      <Box
        sx={{
          width: 10, height: 10, borderRadius: '50%',
          bgcolor: color, mr: 1.5, flexShrink: 0,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      <ListItemText
        primary={
          <Typography variant="body2" fontWeight={600} noWrap>{river.name}</Typography>
        }
        secondary={
          <LinearProgress
            variant="determinate"
            value={percentage}
            sx={{
              height: 4, borderRadius: 2, mt: 0.5,
              bgcolor: 'grey.200',
              '& .MuiLinearProgress-bar': {
                borderRadius: 2,
                bgcolor: color,
              },
            }}
          />
        }
      />
      <Typography variant="body2" fontWeight={700} sx={{ color, ml: 1.5, minWidth: 38, textAlign: 'right' }}>
        {percentage}%
      </Typography>
    </ListItemButton>
  )
}

export default function Sidebar({ rivers, selectedRiver, onSelect, onClose }) {
  // Handle click on a river in the flow logic - it might not be in the visible set!
  const handleFlowClick = async (clickedData) => {
    // Check if we happen to already have the full river loaded
    const fullRiver = (rivers || []).find(r => r.id === clickedData.id)
    if (fullRiver) {
      onSelect(fullRiver)
    } else {
      // Must fetch it directly from backend API
      const fetched = await fetchRiver(clickedData.id)
      if (fetched) {
        onSelect(fetched)
      }
    }
  }

  // 1. Filter unnamed
  const namedRivers = (rivers || []).filter(r => !r.name.startsWith('Tributary') && !r.name.startsWith('Unnamed'))
  
  // 2. Sort by pollution descending
  const sorted = [...namedRivers].sort((a, b) => b.pollution_level - a.pollution_level)
  
  // 3. Keep only top 10 for the Sidebar
  const top10 = sorted.slice(0, 10)
  
  const criticalCount = namedRivers.filter(r => r.pollution_level > 0.7).length

  const latestScanDate = rivers?.length > 0
    ? new Date(Math.max(...rivers.map(r => new Date(r.last_updated).getTime()))).toLocaleString()
    : 'None'

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar header */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1} display="block">
          Visible Map Area
        </Typography>
        <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
          <Chip label={`${namedRivers.length} rivers`} size="small" sx={{ fontWeight: 700 }} />
          {criticalCount > 0 && (
            <Chip label={`${criticalCount} critical`} size="small" color="error" variant="outlined" />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
          Top 10 highest pollution
        </Typography>
      </Box>
      <Divider />

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {selectedRiver ? (
          <RiverDetail
            river={selectedRiver}
            onClose={() => { onSelect(null); onClose() }}
            onRiverClick={handleFlowClick}
          />
        ) : (
          <List disablePadding sx={{ pt: 1 }}>
            {top10.map(river => (
              <RiverListItem
                key={river.id}
                river={river}
                isSelected={selectedRiver?.id === river.id}
                onSelect={onSelect}
              />
            ))}
          </List>
        )}
      </Box>

      <Divider />
      <Box sx={{ p: 1.5, bgcolor: 'grey.50', display: 'flex', alignItems: 'center', gap: 1 }}>
        <SatelliteAltIcon fontSize="small" color="primary" />
        <Typography variant="caption" color="text.secondary">
          Last global scan: <strong>{latestScanDate}</strong>
        </Typography>
      </Box>
    </Box>
  )
}
