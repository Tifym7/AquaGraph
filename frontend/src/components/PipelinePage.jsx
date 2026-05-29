import { useEffect, useRef, useState } from 'react'
import { Box, Typography, Container, Grid, Paper, Chip, Button } from '@mui/material'
import MapIcon from '@mui/icons-material/Map'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import CloudIcon from '@mui/icons-material/Cloud'
import StorageIcon from '@mui/icons-material/Storage'
import InsightsIcon from '@mui/icons-material/Insights'
import BoltIcon from '@mui/icons-material/Bolt'
import VerifiedIcon from '@mui/icons-material/Verified'
import RefreshIcon from '@mui/icons-material/Refresh'
import ShieldIcon from '@mui/icons-material/Shield'
import CheckIcon from '@mui/icons-material/Check'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import ForestIcon from '@mui/icons-material/Forest'
import SpaIcon from '@mui/icons-material/Spa'
import WavesIcon from '@mui/icons-material/Waves'
import TerrainIcon from '@mui/icons-material/Terrain'
import OilBarrelIcon from '@mui/icons-material/OilBarrel'
import LayersIcon from '@mui/icons-material/Layers'
import SyncAltIcon from '@mui/icons-material/SyncAlt'
import SchemaIcon from '@mui/icons-material/Schema'
import SiteNav from './SiteNav'
import { fetchPipelineStats } from '../utils'

/* Real Sentinel-2/1 thumbnails per example river (summer 2024), generated
   offline by `python -m backend.ingest.scripts.generate_metric_thumbs`.
   Vite bundles each as a fingerprinted asset URL, so the live page does
   zero EE calls. To add a new river: add it to RIVERS in the generator,
   re-run, then add the import + bbox + annotation entry below. */
import danubeTC   from '../assets/metric_thumbs/danube/TRUE_COLOR.png'
import danubeNDWI from '../assets/metric_thumbs/danube/NDWI.png'
import danubeMNDWI from '../assets/metric_thumbs/danube/MNDWI.png'
import danubeNDVI from '../assets/metric_thumbs/danube/NDVI.png'
import danubeNDCI from '../assets/metric_thumbs/danube/NDCI.png'
import danubeNDTI from '../assets/metric_thumbs/danube/NDTI.png'
import danubeTURB from '../assets/metric_thumbs/danube/TURBIDITY.png'
import danubeBSI  from '../assets/metric_thumbs/danube/BSI.png'
import danubeOIL  from '../assets/metric_thumbs/danube/OIL_PROBABILITY.png'
import danubePOLLUTION from '../assets/metric_thumbs/danube/POLLUTION.png'

import muresTC   from '../assets/metric_thumbs/mures/TRUE_COLOR.png'
import muresNDWI from '../assets/metric_thumbs/mures/NDWI.png'
import muresMNDWI from '../assets/metric_thumbs/mures/MNDWI.png'
import muresNDVI from '../assets/metric_thumbs/mures/NDVI.png'
import muresNDCI from '../assets/metric_thumbs/mures/NDCI.png'
import muresNDTI from '../assets/metric_thumbs/mures/NDTI.png'
import muresTURB from '../assets/metric_thumbs/mures/TURBIDITY.png'
import muresBSI  from '../assets/metric_thumbs/mures/BSI.png'
import muresOIL  from '../assets/metric_thumbs/mures/OIL_PROBABILITY.png'
import muresPOLLUTION from '../assets/metric_thumbs/mures/POLLUTION.png'

import oltTC   from '../assets/metric_thumbs/olt/TRUE_COLOR.png'
import oltNDWI from '../assets/metric_thumbs/olt/NDWI.png'
import oltMNDWI from '../assets/metric_thumbs/olt/MNDWI.png'
import oltNDVI from '../assets/metric_thumbs/olt/NDVI.png'
import oltNDCI from '../assets/metric_thumbs/olt/NDCI.png'
import oltNDTI from '../assets/metric_thumbs/olt/NDTI.png'
import oltTURB from '../assets/metric_thumbs/olt/TURBIDITY.png'
import oltBSI  from '../assets/metric_thumbs/olt/BSI.png'
import oltOIL  from '../assets/metric_thumbs/olt/OIL_PROBABILITY.png'
import oltPOLLUTION from '../assets/metric_thumbs/olt/POLLUTION.png'

/* Real Romania country boundary, simplified to ~300m tolerance from
   FAO/GAUL/2015/level0 by the same thumbnail generator. ~1.5k points,
   four polygons (mainland + small Danubian islands). */
import romaniaOutline from '../assets/romania_outline.json'

/* Brand palette - pulled from the AppBar gradient + sidebar accents. */
const C = {
  dark:   '#10002b',
  deep:   '#3c096c',
  brand:  '#5a189a',
  bright: '#6d28d9',
  pop:    '#7b2cbf',
  glow:   '#c77dff',
  soft:   '#e0aaff',
  tint:   '#f5f3ff',
  border: '#ddd6fe',
  ink:    '#1f1235',
  muted:  '#6b5c87',
}

/* ---------- small animation helpers (no deps) ---------- */
function useInView(threshold = 0.18) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!ref.current || seen) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect() }
    }, { threshold })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen, threshold])
  return [ref, seen]
}

function CountUp({ to, durationMs = 1200, format = (v) => v.toLocaleString() }) {
  const [ref, seen] = useInView()
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!seen) return
    const start = performance.now()
    let raf
    const tick = (t) => {
      const k = Math.min(1, (t - start) / durationMs)
      const eased = 1 - Math.pow(1 - k, 3)
      setVal(Math.round(to * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, to, durationMs])
  return <span ref={ref}>{format(val)}</span>
}

function Reveal({ children, delay = 0, sx }) {
  const [ref, seen] = useInView()
  return (
    <Box ref={ref} sx={{
      opacity: seen ? 1 : 0,
      transform: seen ? 'translateY(0)' : 'translateY(18px)',
      transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`,
      ...sx,
    }}>{children}</Box>
  )
}

/* ---------- hero: animated network background + title ---------- */
function Hero({ onGoToMap }) {
  return (
    <Box sx={{
      position: 'relative', overflow: 'hidden',
      pt: { xs: 9, md: 11 }, pb: { xs: 8, md: 12 },
      background: `radial-gradient(1100px 540px at 80% -10%, ${C.pop}55 0%, transparent 60%),
                   radial-gradient(900px 540px at 10% 110%, ${C.brand}55 0%, transparent 60%),
                   linear-gradient(160deg, ${C.dark} 0%, ${C.deep} 55%, ${C.brand} 100%)`,
      color: '#fff',
    }}>
      {/* subtle moving grid */}
      <Box aria-hidden sx={{
        position: 'absolute', inset: 0, opacity: 0.18,
        backgroundImage:
          `linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px),
           linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
        animation: 'gridDrift 28s linear infinite',
        '@keyframes gridDrift': {
          from: { transform: 'translate3d(0,0,0)' },
          to:   { transform: 'translate3d(-48px,-48px,0)' },
        },
      }} />
      {/* drifting glow blobs */}
      <Box aria-hidden sx={{
        position: 'absolute', width: 380, height: 380, borderRadius: '50%',
        top: -100, right: '12%',
        background: `radial-gradient(closest-side, ${C.glow}66, transparent 70%)`,
        filter: 'blur(6px)',
        animation: 'blobA 16s ease-in-out infinite alternate',
        '@keyframes blobA': { to: { transform: 'translate(-40px, 40px)' } },
      }} />
      <Box aria-hidden sx={{
        position: 'absolute', width: 320, height: 320, borderRadius: '50%',
        bottom: -80, left: '8%',
        background: `radial-gradient(closest-side, ${C.bright}66, transparent 70%)`,
        filter: 'blur(8px)',
        animation: 'blobB 22s ease-in-out infinite alternate',
        '@keyframes blobB': { to: { transform: 'translate(40px, -30px)' } },
      }} />

      <Container maxWidth="lg" sx={{ position: 'relative', textAlign: 'center' }}>
        <Chip
          icon={<AccountTreeIcon sx={{ color: '#fff !important', fontSize: 16 }} />}
          label="Data pipeline"
          sx={{
            color: '#fff', borderColor: 'rgba(255,255,255,0.35)',
            bgcolor: 'rgba(255,255,255,0.06)', fontWeight: 700,
            letterSpacing: 1.2, mb: 2.5, px: 1.5, height: 30,
          }}
          variant="outlined"
        />
        <Typography variant="h2" sx={{
          fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05,
          fontSize: { xs: 38, sm: 48, md: 62 },
        }}>
          From orbit to insight.
        </Typography>
        <Typography sx={{
          maxWidth: 760, mx: 'auto', mt: 2, fontSize: { xs: 15, md: 18 },
          color: 'rgba(255,255,255,0.85)',
        }}>
          How AquaGraph turns the Sentinel-1 & -2 archive into a live, per-river,
          per-pass intelligence layer - server-side reductions on Google Earth
          Engine, staged through a managed object store into our time-series
          store, and served live to the map, charts and PDF reports.
        </Typography>
        <Box sx={{ mt: 4, display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button onClick={onGoToMap} startIcon={<MapIcon />} variant="contained"
            sx={{
              textTransform: 'none', fontWeight: 700, px: 2.5, py: 1.1,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${C.deep} 0%, ${C.brand} 60%, ${C.pop} 100%)`,
              boxShadow: '0 8px 24px rgba(123,44,191,0.45)',
              '&:hover': { background: `linear-gradient(135deg, ${C.dark} 0%, ${C.brand} 60%, ${C.bright} 100%)` },
            }}>Open the live map</Button>
          <Button href="#how" variant="outlined"
            sx={{
              textTransform: 'none', fontWeight: 700, px: 2.5, py: 1.1, borderRadius: 999,
              color: '#fff', borderColor: 'rgba(255,255,255,0.45)',
              '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
            }}>See the pipeline</Button>
        </Box>

        {/* live status pill */}
        <Box sx={{ mt: 5, display: 'inline-flex', alignItems: 'center', gap: 1,
                   px: 2, py: 0.9, borderRadius: 999,
                   bgcolor: 'rgba(255,255,255,0.08)',
                   border: '1px solid rgba(255,255,255,0.18)' }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#7CFFCB',
                     boxShadow: '0 0 0 0 #7CFFCB',
                     animation: 'livePulse 1.8s ease-out infinite',
                     '@keyframes livePulse': {
                       '0%':   { boxShadow: '0 0 0 0 rgba(124,255,203,0.75)' },
                       '100%': { boxShadow: '0 0 0 12px rgba(124,255,203,0)' },
                     } }} />
          <Typography sx={{ fontSize: 12.5, letterSpacing: 1, fontWeight: 700,
                            color: 'rgba(255,255,255,0.92)' }}>
            INGESTION RUNNING · LIVE NUMBERS BELOW
          </Typography>
        </Box>
      </Container>
    </Box>
  )
}

/* ---------- KPI strip with live numbers ---------- */
/* Human-readable "as of" tag for a UTC ISO timestamp. Returns a short
   "Xm ago" / "Xh ago" / "Xd ago" for the last 30 days, then falls back to
   the ISO date. Pipeline stats are cached at the tile-rebuild epoch, so
   surfacing this answers "are these numbers fresh?" without us hand-waving. */
function _formatAsOf(iso) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const dMin = Math.max(0, (Date.now() - t) / 60000)
  if (dMin < 1)    return 'just now'
  if (dMin < 60)   return `${Math.round(dMin)}m ago`
  if (dMin < 1440) return `${Math.round(dMin / 60)}h ago`
  if (dMin < 30 * 1440) return `${Math.round(dMin / 1440)}d ago`
  return iso.slice(0, 10)
}

function Stats({ stats }) {
  const s2 = stats?.sensors?.S2 || {}
  const s1 = stats?.sensors?.S1 || {}
  const total = stats?.total_rows || 0
  const dates = (s2.dates || 0) + (s1.dates || 0)
  const rivers = Math.max(s2.rivers || 0, s1.rivers || 0)
  const segments = Math.max(s2.segments || 0, s1.segments || 0)
  const asOf = _formatAsOf(stats?.cached_at)

  const items = [
    { v: total, label: 'Per-segment observations', sub: 'in the time-series store right now' },
    { v: dates, label: 'Distinct satellite dates', sub: 'S1 + S2 acquisitions' },
    { v: rivers, label: 'Rivers covered', sub: 'EU-Hydro named & Strahler ≥ 3' },
    { v: segments, label: 'River segments', sub: 'reduced at 10 m native' },
  ]
  return (
    <Container maxWidth="lg" sx={{ mt: -7, position: 'relative', zIndex: 2 }}>
      <Paper elevation={0} sx={{
        borderRadius: 4, p: { xs: 2, md: 3 },
        background: '#fff',
        border: `1px solid ${C.border}`,
        boxShadow: '0 20px 60px rgba(60,9,108,0.18)',
        position: 'relative',
      }}>
        {asOf && (
          <Box sx={{
            position: 'absolute', top: 10, right: 14,
            display: 'inline-flex', alignItems: 'center', gap: 0.75,
            fontSize: 10.5, fontWeight: 600,
            color: C.muted, letterSpacing: 0.4, textTransform: 'uppercase',
          }} title={`Pipeline stats cache refreshed at ${stats.cached_at}`}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.brand,
                       boxShadow: `0 0 0 3px ${C.tint}` }} />
            Data as of {asOf}
          </Box>
        )}
        <Grid container spacing={2}>
          {items.map((it, i) => (
            <Grid size={{ xs: 6, md: 3 }} key={i}>
              <Reveal delay={i * 80}>
                <Box sx={{
                  px: 2, py: 1.5,
                  borderLeft: { xs: 'none', md: i > 0 ? `1px solid ${C.border}` : 'none' },
                }}>
                  <Typography sx={{
                    fontSize: { xs: 24, md: 32 }, fontWeight: 800, color: C.brand,
                    letterSpacing: -0.5, lineHeight: 1.1,
                  }}>
                    <CountUp to={it.v} />
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.ink,
                                     textTransform: 'uppercase', letterSpacing: 0.6, mt: 0.5 }}>
                    {it.label}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: C.muted }}>{it.sub}</Typography>
                </Box>
              </Reveal>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Container>
  )
}

/* ---------- animated pipeline flow (SVG) ---------- */
function FlowDiagram() {
  // four stage nodes connected by curved paths with dots moving along them.
  const STAGES = [
    { x: 120,  y: 130, icon: 'sat',    title: 'Earth Engine', sub: 'reduceRegions @ 10 m' },
    { x: 400,  y: 130, icon: 'bucket', title: 'Object store', sub: 'staging · CSV shards' },
    { x: 680,  y: 130, icon: 'db',     title: 'Time-series store', sub: 'per-segment, per-pass' },
    { x: 960,  y: 130, icon: 'serve',  title: 'AquaGraph app', sub: 'map · charts · PDF' },
  ]
  const path = (a, b) =>
    `M ${a.x + 50} ${a.y} C ${a.x + 130} ${a.y - 40}, ${b.x - 130} ${b.y + 40}, ${b.x - 50} ${b.y}`
  const ICON = {
    sat: <g><circle cx="0" cy="0" r="22" fill={C.brand} /><rect x="-30" y="-3" width="60" height="6" rx="2" fill={C.glow} /><rect x="-3" y="-30" width="6" height="60" rx="2" fill={C.glow} /></g>,
    bucket: <g><path d="M -22 -16 L 22 -16 L 18 24 L -18 24 Z" fill={C.deep} stroke={C.glow} strokeWidth="2" /><path d="M -22 -16 Q 0 -28 22 -16" fill="none" stroke={C.glow} strokeWidth="2" /></g>,
    db: <g><ellipse cx="0" cy="-14" rx="22" ry="6" fill={C.brand} /><rect x="-22" y="-14" width="44" height="28" fill={C.brand} /><ellipse cx="0" cy="14" rx="22" ry="6" fill={C.deep} /><ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke={C.glow} strokeWidth="1" /></g>,
    serve: <g><rect x="-22" y="-16" width="44" height="32" rx="4" fill={C.deep} stroke={C.glow} strokeWidth="2" /><path d="M -14 6 L -4 -4 L 4 4 L 14 -10" fill="none" stroke={C.glow} strokeWidth="2.5" strokeLinecap="round" /></g>,
  }
  return (
    <Box sx={{ overflow: 'hidden', borderRadius: 4, position: 'relative',
               background: `linear-gradient(160deg, #fff 0%, ${C.tint} 100%)`,
               border: `1px solid ${C.border}`, py: 3 }}>
      <Box component="svg" viewBox="0 0 1080 260" sx={{ width: '100%', height: { xs: 220, md: 260 } }}>
        {/* connectors */}
        {STAGES.slice(0, -1).map((a, i) => {
          const b = STAGES[i + 1]
          const d = path(a, b)
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={C.border} strokeWidth="2.5" />
              {/* three dots, staggered, traveling along the path */}
              {[0, 0.66, 1.33].map((offset, k) => (
                <circle key={k} r="4.5" fill={C.bright}>
                  <animateMotion dur="3.4s" repeatCount="indefinite" begin={`${offset}s`} path={d} />
                </circle>
              ))}
            </g>
          )
        })}
        {/* nodes */}
        {STAGES.map((s, i) => (
          <g key={i} transform={`translate(${s.x}, ${s.y})`}>
            <circle r="44" fill="#fff" stroke={C.border} strokeWidth="2" />
            <circle r="44" fill="none" stroke={C.brand} strokeWidth="2"
                    strokeDasharray="3 5" style={{ animation: `dashSpin${i} 22s linear infinite` }} />
            {ICON[s.icon]}
            <text y="74" textAnchor="middle" fontFamily="Inter, sans-serif"
                  fontSize="14" fontWeight="800" fill={C.ink}>{s.title}</text>
            <text y="92" textAnchor="middle" fontFamily="Inter, sans-serif"
                  fontSize="11" fill={C.muted}>{s.sub}</text>
          </g>
        ))}
        <defs>
          <style>{`
            @keyframes dashSpin0 { to { stroke-dashoffset: -120 } }
            @keyframes dashSpin1 { to { stroke-dashoffset: -120 } }
            @keyframes dashSpin2 { to { stroke-dashoffset: -120 } }
            @keyframes dashSpin3 { to { stroke-dashoffset: -120 } }
          `}</style>
        </defs>
      </Box>
    </Box>
  )
}

/* ---------- vertical end-of-page pipeline summary ----------
   Same four-node animation as FlowDiagram, but tipped 90° so it fits on
   one side of a 2-col grid; the other column carries a short caption per
   node. Used as the closing "how it flows" summary at the end of the
   page, replacing the four verbose Stage cards. */
const _FLOW_NODES = [
  { name: 'Acquisition', sub: 'Petabytes reduced, zero downloaded', icon: 'sat',
    body: 'The Sentinel archive lives on someone else\'s cluster. We send a small graph, get back a few numbers per river segment - never a single raw image, never any storage cost for imagery.' },
  { name: 'Staging',     sub: 'Multi-year backfills in hours',      icon: 'bucket',
    body: 'Many parallel export tasks pour CSV shards into a staging area; the ingest worker drains them as they finish, then deletes the blob. Steady-state cost: pennies.' },
  { name: 'Storage',     sub: 'Safe to re-run, safe to crash',      icon: 'db',
    body: 'One row per (segment, sensor, pass), idempotent on its key. Partial syncs, crashes, schema additions - all benign. The store is the system of record; everything else is derived.' },
  { name: 'Serving',     sub: 'New pass on the map next cycle',     icon: 'serve',
    body: 'Map, charts and PDF query the same store live. No caching layer, no rebuild step, no deploy - every new ingest cycle widens what users can see on the next page load.' },
]
const _FLOW_NODE_YS = [90, 270, 450, 630]   // matches 4 captions of 180px each
const _FLOW_W = 200
const _FLOW_H = 720

function FlowDiagramVertical() {
  const ICON = {
    sat: <g><circle cx="0" cy="0" r="22" fill={C.brand} /><rect x="-30" y="-3" width="60" height="6" rx="2" fill={C.glow} /><rect x="-3" y="-30" width="6" height="60" rx="2" fill={C.glow} /></g>,
    bucket: <g><path d="M -22 -16 L 22 -16 L 18 24 L -18 24 Z" fill={C.deep} stroke={C.glow} strokeWidth="2" /><path d="M -22 -16 Q 0 -28 22 -16" fill="none" stroke={C.glow} strokeWidth="2" /></g>,
    db: <g><ellipse cx="0" cy="-14" rx="22" ry="6" fill={C.brand} /><rect x="-22" y="-14" width="44" height="28" fill={C.brand} /><ellipse cx="0" cy="14" rx="22" ry="6" fill={C.deep} /><ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke={C.glow} strokeWidth="1" /></g>,
    serve: <g><rect x="-22" y="-16" width="44" height="32" rx="4" fill={C.deep} stroke={C.glow} strokeWidth="2" /><path d="M -14 6 L -4 -4 L 4 4 L 14 -10" fill="none" stroke={C.glow} strokeWidth="2.5" strokeLinecap="round" /></g>,
  }
  const cx = _FLOW_W / 2
  // S-curve going down from one node's bottom to the next node's top,
  // with a sideways jiggle for a friendlier line than a straight pipe.
  const vpath = (yA, yB) =>
    `M ${cx} ${yA + 50} C ${cx - 40} ${yA + 130}, ${cx + 40} ${yB - 130}, ${cx} ${yB - 50}`

  return (
    <Box sx={{
      borderRadius: 4, position: 'relative',
      background: `linear-gradient(180deg, #fff 0%, ${C.tint} 100%)`,
      border: `1px solid ${C.border}`,
      p: 1.5,
      height: '100%',
    }}>
      <Box component="svg" viewBox={`0 0 ${_FLOW_W} ${_FLOW_H}`}
           preserveAspectRatio="xMidYMid meet"
           sx={{ width: '100%', height: '100%', display: 'block',
                  maxHeight: { xs: 480, md: 720 } }}>
        {/* connectors with travelling dots */}
        {_FLOW_NODE_YS.slice(0, -1).map((y, i) => {
          const d = vpath(y, _FLOW_NODE_YS[i + 1])
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={C.border} strokeWidth="2.5" />
              {[0, 0.85, 1.7].map((offset, k) => (
                <circle key={k} r="4.5" fill={C.bright}>
                  <animateMotion dur="3.4s" repeatCount="indefinite"
                                 begin={`${offset}s`} path={d} />
                </circle>
              ))}
            </g>
          )
        })}
        {/* nodes */}
        {_FLOW_NODES.map((n, i) => (
          <g key={i} transform={`translate(${cx}, ${_FLOW_NODE_YS[i]})`}>
            <circle r="44" fill="#fff" stroke={C.border} strokeWidth="2" />
            <circle r="44" fill="none" stroke={C.brand} strokeWidth="2"
                    strokeDasharray="3 5"
                    style={{ animation: `vDashSpin${i} 22s linear infinite` }} />
            {ICON[n.icon]}
          </g>
        ))}
        <defs>
          <style>{`
            @keyframes vDashSpin0 { to { stroke-dashoffset: -120 } }
            @keyframes vDashSpin1 { to { stroke-dashoffset: -120 } }
            @keyframes vDashSpin2 { to { stroke-dashoffset: -120 } }
            @keyframes vDashSpin3 { to { stroke-dashoffset: -120 } }
          `}</style>
        </defs>
      </Box>
    </Box>
  )
}

/* End-of-page "how it flows" - the only place this summary lives now
   (the verbose Stage 1-4 cards used to sit here). */
function PipelineFlowSection() {
  return (
    <Container id="how" maxWidth="lg" sx={{ mt: 6, mb: 6 }}>
      <Reveal>
        <Typography sx={{ fontSize: 13, fontWeight: 800, letterSpacing: 2,
                           color: C.brand, mb: 1, textTransform: 'uppercase' }}>
          How it flows
        </Typography>
        <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 800,
                           color: C.ink, mb: 1, letterSpacing: -0.5 }}>
          The whole pipeline, end to end.
        </Typography>
        <Typography sx={{ color: C.muted, fontSize: 15, maxWidth: 760, mb: 3 }}>
          Four architectural levels, four short jobs. Each one swappable
          without touching the others.
        </Typography>
      </Reveal>

      <Grid container spacing={{ xs: 2, md: 3 }} alignItems="stretch"
            sx={{ minHeight: { xs: 'auto', sm: 600, md: 720 } }}>
        {/* Vertical animation on the left */}
        <Grid size={{ xs: 12, sm: 4, md: 3 }}>
          <Reveal sx={{ height: '100%' }}>
            <FlowDiagramVertical />
          </Reveal>
        </Grid>
        {/* Aligned captions on the right - one tall Paper card holding
            four equal-flex sections. Each section is `flex: 1` so the
            four together fill the column height symmetrically; content
            inside each section is vertically centred so the visible
            block lines up with its SVG node centre on desktop. */}
        <Grid size={{ xs: 12, sm: 8, md: 9 }}>
          <Paper elevation={0} sx={{
            height: '100%', borderRadius: 3,
            background: '#fff', border: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {_FLOW_NODES.map((n, i) => (
              <Reveal key={i} delay={i * 80}
                      sx={{
                        flex: 1,
                        display: 'flex', flexDirection: 'column',
                        justifyContent: 'center',
                        px: { xs: 2, md: 2.5 },
                        py: { xs: 1.5, md: 1.75 },
                        borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                      }}>
                <Typography sx={{
                  fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4,
                  color: C.brand, textTransform: 'uppercase',
                }}>
                  Stage {String(i + 1).padStart(2, '0')} · {n.name}
                </Typography>
                <Typography sx={{
                  fontSize: { xs: 15, md: 17 }, fontWeight: 800,
                  color: C.ink, lineHeight: 1.2, mt: 0.25,
                }}>
                  {n.sub}
                </Typography>
                <Typography sx={{
                  fontSize: 13, color: C.muted, mt: 0.5, lineHeight: 1.45,
                }}>
                  {n.body}
                </Typography>
              </Reveal>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}

/* ---------- one stage card (icon + title + body + optional code) ---------- */
function Stage({ n, icon, title, kicker, children, code }) {
  return (
    <Reveal>
      <Paper elevation={0} sx={{
        borderRadius: 4, p: { xs: 3, md: 4 }, mb: 3,
        background: '#fff',
        border: `1px solid ${C.border}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{
          position: 'absolute', top: -60, right: -60, width: 220, height: 220,
          background: `radial-gradient(closest-side, ${C.tint}, transparent 70%)`,
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Box sx={{
              width: 44, height: 44, borderRadius: 2.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              background: `linear-gradient(135deg, ${C.deep}, ${C.brand} 60%, ${C.pop})`,
              boxShadow: `0 8px 18px ${C.brand}40`,
            }}>{icon}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
                                 color: C.brand, textTransform: 'uppercase' }}>
                Stage {n} · {kicker}
              </Typography>
              <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 800,
                                 color: C.ink, lineHeight: 1.2 }}>
                {title}
              </Typography>
            </Box>
          </Box>
          <Grid container spacing={3} alignItems="flex-start">
            <Grid size={{ xs: 12, md: code ? 7 : 12 }}>
              <Box sx={{ color: C.ink, fontSize: 15, lineHeight: 1.65,
                          '& strong': { color: C.deep } }}>
                {children}
              </Box>
            </Grid>
            {code && (
              <Grid size={{ xs: 12, md: 5 }}>
                <Paper elevation={0} sx={{
                  borderRadius: 2, p: 2, fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12.5, lineHeight: 1.55,
                  background: `linear-gradient(180deg, ${C.dark}, ${C.deep})`,
                  color: '#e0d8ff',
                  border: `1px solid ${C.deep}`,
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                }}>
                  {code}
                </Paper>
              </Grid>
            )}
          </Grid>
        </Box>
      </Paper>
    </Reveal>
  )
}

/* ---------- the bucket deep-dive: an animated illustration ---------- */
function BucketAnim() {
  return (
    <Box component="svg" viewBox="0 0 520 220" sx={{ width: '100%', height: 220 }}>
      {/* incoming arrows from EE */}
      {[0, 1, 2].map(i => (
        <g key={i}>
          <line x1="0" y1={50 + i * 25} x2="200" y2={50 + i * 25}
                stroke={C.border} strokeWidth="2" strokeDasharray="2 4" />
          <circle r="4" fill={C.bright}>
            <animateMotion dur="2.6s" begin={`${i * 0.4}s`} repeatCount="indefinite"
                           path={`M0,${50 + i * 25} L200,${50 + i * 25}`} />
          </circle>
        </g>
      ))}
      <text x="0" y="38" fontFamily="Inter, sans-serif" fontSize="11"
            fontWeight="700" fill={C.muted}>Sentinel-1 / -2 export tasks</text>

      {/* the bucket */}
      <g transform="translate(260,110)">
        <path d="M -68 -42 L 68 -42 L 56 70 L -56 70 Z"
              fill={C.deep} stroke={C.glow} strokeWidth="2" />
        <path d="M -68 -42 Q 0 -64 68 -42" fill={C.brand} stroke={C.glow} strokeWidth="2" />
        <text textAnchor="middle" y="-50" fontFamily="Inter, sans-serif"
              fontSize="12" fontWeight="800" fill={C.ink}>staging store</text>
        <text textAnchor="middle" y="20" fontFamily="Inter, sans-serif"
              fontSize="11" fill="#e0d8ff">CSV shards</text>
        <text textAnchor="middle" y="40" fontFamily="Inter, sans-serif"
              fontSize="10" fill={C.soft}>auto-deleted after ingest</text>
      </g>

      {/* outgoing arrows to ingestor */}
      {[0, 1, 2].map(i => (
        <g key={i}>
          <line x1="328" y1={50 + i * 25} x2="520" y2={50 + i * 25}
                stroke={C.border} strokeWidth="2" strokeDasharray="2 4" />
          <circle r="4" fill={C.pop}>
            <animateMotion dur="2.6s" begin={`${i * 0.4 + 0.8}s`} repeatCount="indefinite"
                           path={`M328,${50 + i * 25} L520,${50 + i * 25}`} />
          </circle>
        </g>
      ))}
      <text x="520" y="38" textAnchor="end" fontFamily="Inter, sans-serif"
            fontSize="11" fontWeight="700" fill={C.muted}>Concurrent ingestor → time-series store</text>
    </Box>
  )
}

/* ---------- extensibility capsule ----------
   Made of one card per pluggable axis (sensor / transport / source-schema).
   Each card lists what's wired today (filled check) and what plugs in
   next (empty circle), so the reader leaves understanding that the
   architecture is not GEE-shaped - GEE just happens to be its first
   backend. */
function ChipRow({ items, active }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.7, mt: 1 }}>
      {items.map((s, i) => (
        <Box key={i} sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          px: 0.9, py: 0.3, borderRadius: 999,
          fontSize: 11.5, fontWeight: 700,
          color: active ? '#fff' : C.deep,
          background: active
            ? `linear-gradient(135deg, ${C.brand}, ${C.pop})`
            : '#fff',
          border: active ? 'none' : `1px dashed ${C.border}`,
        }}>
          {active
            ? <CheckIcon sx={{ fontSize: 13 }} />
            : <RadioButtonUncheckedIcon sx={{ fontSize: 12 }} />}
          {s}
        </Box>
      ))}
    </Box>
  )
}

/* Compact "what runs today" tile - one per architectural level. Sits in
   the Extensibility row so the reader leaves with two things in hand:
   what we picked for the demo deployment, and what each piece could be
   swapped for. */
function StackTile({ icon, name, body }) {
  return (
    <Paper elevation={0} sx={{
      p: 2, height: '100%', borderRadius: 3,
      background: `linear-gradient(160deg, #fff 0%, ${C.tint} 100%)`,
      border: `1px solid ${C.border}`,
    }}>
      <Box sx={{
        display: 'inline-flex', p: 0.9, borderRadius: 1.5, mb: 1.25,
        color: '#fff',
        background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
      }}>{icon}</Box>
      <Typography sx={{
        fontSize: 14.5, fontWeight: 800, color: C.ink, mb: 0.5,
        letterSpacing: -0.2, lineHeight: 1.2,
      }}>{name}</Typography>
      <Typography sx={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
        {body}
      </Typography>
    </Paper>
  )
}

function Extensibility() {
  const stack = [
    {
      icon: <SatelliteAltIcon sx={{ fontSize: 20 }} />,
      name: 'Google Earth Engine',
      body: (
        <>
          Free cloud platform with the entire Sentinel-1/-2 archive online.
          We send a small compute graph (filter, mask, median,{' '}
          <em>reduceRegions</em>); the cluster runs it on petabytes of
          imagery and returns a few-MB CSV. No raw image ever lands on
          our infrastructure.
        </>
      ),
    },
    {
      icon: <CloudIcon sx={{ fontSize: 20 }} />,
      name: 'Managed object store',
      body: (
        <>
          A short-lived staging area between Earth Engine and the ingest
          worker. Each batch task drops CSV shards here; the worker
          drains and deletes them within seconds. Steady-state cost:
          pennies.
        </>
      ),
    },
    {
      icon: <StorageIcon sx={{ fontSize: 20 }} />,
      name: 'Relational time-series store',
      body: (
        <>
          One row per (segment, sensor, acquisition), with the per-index
          numbers and computed risk stored as nested JSON. The store is
          the system of record - everything else (map, charts, PDF) is a
          query on top.
        </>
      ),
    },
    {
      icon: <InsightsIcon sx={{ fontSize: 20 }} />,
      name: 'AquaGraph web app',
      body: (
        <>
          React + MUI front-end serving the live map, timeline scrubber,
          per-river evolution charts and PDF reports. Reads directly
          from the store on every request - no caching layer, no rebuild
          step, no extra deploy on new ingest.
        </>
      ),
    },
  ]

  const cards = [
    {
      icon: <LayersIcon />,
      title: 'One class per sensor',
      body: (
        <>
          A <code>Sensor</code> subclass implements{' '}
          <code>indices_image</code>, <code>add_risk</code>,{' '}
          <code>discover_dates</code> and <code>window_time_ms</code>. The
          orchestration, storage schema, map layer, charts and PDF report
          never change.
        </>
      ),
      activeLabel: 'wired today',
      active: ['Sentinel-2 · spectral indices', 'Sentinel-1 · SAR oil'],
      nextLabel: 'plug-in candidates',
      next: ['Landsat 8/9', 'MODIS daily', 'EnMAP hyperspectral', 'in-situ buoys / loggers'],
    },
    {
      icon: <SyncAltIcon />,
      title: 'One env var to switch transport',
      body: (
        <>
          <code>INGEST_TRANSPORT=sync</code> uses the free chunked download;{' '}
          <code>=gcs</code> uses batch export through an object store. Both
          coexist, both yield identical rows; the orchestrator picks lazily
          so a <code>sync</code> deploy doesn't even import the object-store
          client.
        </>
      ),
      activeLabel: 'wired today',
      active: ['Synchronous chunked download', 'Batch export → object store'],
      nextLabel: 'plug-in candidates',
      next: ['AWS S3 + STAC', 'Copernicus openEO', 'DLR EOWEB', 'internal HTTP / SFTP'],
    },
    {
      icon: <SchemaIcon />,
      title: 'One row schema, any data source',
      body: (
        <>
          Every observation is one row keyed by{' '}
          <code>(segment, sensor, acquisition)</code> with{' '}
          <code>metrics</code> and <code>risk</code> stored as nested JSON.
          New indices or sensor variables = new JSON keys.{' '}
          <strong>No schema migration, no API change.</strong> The same
          row shape works in any relational or document store.
        </>
      ),
      activeLabel: 'reads from today',
      active: ['Earth Engine'],
      nextLabel: 'reads-from candidates',
      next: ['Microsoft Planetary Computer', 'AWS Sentinel-2 COGs', 'DLR EnMAP portal', 'NASA AppEEARS'],
    },
  ]
  return (
    <Container maxWidth="lg" sx={{ mt: 6, mb: 4 }}>
      <Reveal>
        <Typography sx={{
          fontSize: 13, fontWeight: 800, letterSpacing: 2,
          color: C.brand, mb: 1, textTransform: 'uppercase',
        }}>Built to plug in more</Typography>
        <Typography sx={{
          fontSize: { xs: 24, md: 30 }, fontWeight: 800,
          color: C.ink, letterSpacing: -0.5, mb: 1,
        }}>
          Sentinel is the start, not the limit.
        </Typography>
        <Typography sx={{ color: C.muted, fontSize: 15, maxWidth: 820, mb: 3 }}>
          Today's deployment stitches together four pieces of technology
          - one per architectural level. None of them is hard-wired into
          the pipeline: every piece sits behind a clean interface, and
          the next section shows what each can be swapped for.
        </Typography>
      </Reveal>

      {/* What runs today - one tile per architectural level. */}
      <Typography sx={{
        fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
        color: C.brand, textTransform: 'uppercase', mb: 1,
      }}>What's wired today</Typography>
      <Grid container spacing={2} sx={{ mb: 3.5 }}>
        {stack.map((t, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Reveal delay={i * 60} sx={{ height: '100%' }}>
              <StackTile icon={t.icon} name={t.name} body={t.body} />
            </Reveal>
          </Grid>
        ))}
      </Grid>

      {/* How it extends - the three pluggable axes. */}
      <Typography sx={{
        fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
        color: C.brand, textTransform: 'uppercase', mb: 1,
      }}>How it adapts</Typography>
      <Grid container spacing={2}>
        {cards.map((c, i) => (
          <Grid size={{ xs: 12, md: 4 }} key={i}>
            <Reveal delay={i * 90}>
              <Paper elevation={0} sx={{
                p: 2.5, height: '100%', borderRadius: 3,
                background: '#fff', border: `1px solid ${C.border}`,
                transition: 'transform .25s ease, box-shadow .25s ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: '0 12px 28px rgba(90,24,154,0.18)',
                },
              }}>
                <Box sx={{
                  display: 'inline-flex', p: 1, borderRadius: 2, mb: 1.5,
                  color: '#fff',
                  background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
                }}>{c.icon}</Box>
                <Typography sx={{ fontSize: 15.5, fontWeight: 800,
                                   color: C.ink, mb: 0.7 }}>
                  {c.title}
                </Typography>
                <Typography sx={{ fontSize: 13, color: C.muted,
                                   lineHeight: 1.6, mb: 1 }}>
                  {c.body}
                </Typography>
                <Typography sx={{ fontSize: 10.5, fontWeight: 800,
                                   color: C.brand, letterSpacing: 1.2,
                                   textTransform: 'uppercase', mt: 1.5 }}>
                  {c.activeLabel}
                </Typography>
                <ChipRow items={c.active} active />
                <Typography sx={{ fontSize: 10.5, fontWeight: 800,
                                   color: C.muted, letterSpacing: 1.2,
                                   textTransform: 'uppercase', mt: 1.5 }}>
                  {c.nextLabel}
                </Typography>
                <ChipRow items={c.next} />
              </Paper>
            </Reveal>
          </Grid>
        ))}
      </Grid>
    </Container>
  )
}


/* ---------- resilience / production-readiness capsule ----------
   Each card leads with the *benefit* (what you can stop worrying about)
   and follows with one short sentence on the mechanism. Reads as a
   pitch for "this pipeline is safe to leave running", not a list of
   implementation tricks. */
function Resilience() {
  const items = [
    {
      icon: <BoltIcon />,
      title: 'Years backfilled in hours, not days',
      kicker: 'Speed at scale',
      body:
        'Heavy compute runs in parallel on the cluster while our worker keeps the queue full. ' +
        'Three years of Sentinel-2 over Romania backfills in roughly an afternoon, not a week.',
    },
    {
      icon: <VerifiedIcon />,
      title: 'Crashes are non-events',
      kicker: 'No state to corrupt',
      body:
        'Every operation is keyed and idempotent. Network drops, partial syncs, hard crashes - ' +
        'the next run picks up where the last one stopped. Nothing duplicates, nothing corrupts.',
    },
    {
      icon: <RefreshIcon />,
      title: 'Pays once for each scene',
      kicker: 'No wasted compute',
      body:
        'If a server-side task finishes after our client times out, the next run finds the result ' +
        'in the staging area and ingests it - no re-running the same export, no double cost.',
    },
    {
      icon: <ShieldIcon />,
      title: 'Runs without a babysitter',
      kicker: 'Self-healing ops',
      body:
        'Schema migrations apply on boot. Stats cache refreshes when tiles do. Heavy windows halve ' +
        'themselves and retry under load. The pipeline stays current without operator action.',
    },
  ]
  return (
    <Container maxWidth="lg" sx={{ mt: 6, mb: 8 }}>
      <Reveal>
        <Typography sx={{ fontSize: 13, fontWeight: 800, letterSpacing: 2,
                           color: C.brand, mb: 1, textTransform: 'uppercase' }}>
          Built for production
        </Typography>
        <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 800,
                           color: C.ink, letterSpacing: -0.4, mb: 1 }}>
          Safe to leave running.
        </Typography>
        <Typography sx={{ color: C.muted, fontSize: 15, maxWidth: 760, mb: 3 }}>
          A production pipeline isn't a pipeline if you have to babysit it.
          Four properties make this one boring to operate - in the best
          possible sense.
        </Typography>
      </Reveal>
      <Grid container spacing={2}>
        {items.map((it, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Reveal delay={i * 80} sx={{ height: '100%' }}>
              <Paper elevation={0} sx={{
                p: 2.5, height: '100%', borderRadius: 3,
                background: '#fff', border: `1px solid ${C.border}`,
                transition: 'transform .25s ease, box-shadow .25s ease',
                display: 'flex', flexDirection: 'column',
                '&:hover': { transform: 'translateY(-3px)',
                              boxShadow: '0 12px 28px rgba(90,24,154,0.18)' },
              }}>
                <Box sx={{
                  display: 'inline-flex', p: 1, borderRadius: 2, mb: 1.5,
                  color: '#fff', alignSelf: 'flex-start',
                  background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
                }}>{it.icon}</Box>
                <Typography sx={{
                  fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2,
                  color: C.brand, textTransform: 'uppercase',
                }}>{it.kicker}</Typography>
                <Typography sx={{
                  fontSize: 15.5, fontWeight: 800, color: C.ink,
                  lineHeight: 1.25, mt: 0.4, mb: 0.75,
                }}>
                  {it.title}
                </Typography>
                <Typography sx={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
                  {it.body}
                </Typography>
              </Paper>
            </Reveal>
          </Grid>
        ))}
      </Grid>
    </Container>
  )
}

/* ---------- nice math rendering (band badges + real fractions) ---------- */

/* Each Sentinel-2 band gets a small coloured pill in the formulas, so the
   reader can tie a "B5" in (B5 − B4)/(B5 + B4) back to the red-edge band on
   the spectrum chart above. Colours mirror SpectrumBar's BANDS array. */
const BAND_COLOR = {
  B2: '#3b82f6', B3: '#22c55e', B4: '#ef4444',
  B5: '#a855f7', B8: '#6d28d9', B11: '#1e1b4b',
}

/* Pill flavours used by renderTokens so the same colour follows an
   entity end-to-end: bands (B2..B11) get the spectrum colour, indices
   (NDTI, NDCI, ...) get their dedicated colour matching the metric
   cards, and the S1 darkening components get the brand-purple pill. */
const INDEX_COLOR = {
  NDWI:            '#2563eb',  // water - blue
  MNDWI:           '#1e40af',  // water (refined) - deeper blue
  NDVI:            '#16a34a',  // vegetation - vivid green
  NDCI:            '#059669',  // chlorophyll - teal/emerald
  NDTI:            '#b45309',  // turbidity index - amber/brown
  TURBIDITY:       '#ca8a04',  // raw turbidity - yellow-amber
  BSI:             '#b91c1c',  // bare soil - red
  OIL_PROBABILITY: '#5a189a',  // oil (S1) - brand purple
}
const IDENT_TOKENS = new Set([
  ...Object.keys(INDEX_COLOR),
  'DARK_PIXEL', 'WATER_PIXEL',
  'VV_drop', 'VH_drop', 'abs_dark', 'texture',
])
const _ALL_TOKENS = [...Object.keys(BAND_COLOR), ...IDENT_TOKENS]
  .sort((a, b) => b.length - a.length)         // longest-first
const _TOKEN_RE = new RegExp(`\\b(${_ALL_TOKENS.join('|')})\\b`)

function renderTokens(text) {
  const parts = String(text).split(_TOKEN_RE)
  return parts.map((p, i) => {
    if (BAND_COLOR[p]) {
      return (
        <Box key={i} component="span" sx={{
          display: 'inline-block', mx: 0.2,
          px: 0.7, py: 0, borderRadius: 0.75,
          color: '#fff', bgcolor: BAND_COLOR[p],
          fontWeight: 800, fontSize: '0.92em',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          verticalAlign: 'baseline',
        }}>{p}</Box>
      )
    }
    if (IDENT_TOKENS.has(p)) {
      const bg = INDEX_COLOR[p] || C.brand
      return (
        <Box key={i} component="span" sx={{
          display: 'inline-block', mx: 0.2,
          px: 0.7, py: 0, borderRadius: 0.75,
          color: '#fff', bgcolor: bg,
          fontWeight: 800, fontSize: '0.84em',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          verticalAlign: 'baseline',
          letterSpacing: 0.2,
        }}>{p}</Box>
      )
    }
    return <span key={i}>{p}</span>
  })
}

/* Try to interpret "(NUM) / (DENOM)" as a real stacked fraction, honouring
   balanced nested parens so "((B11+B4) − (B8+B2)) / ((B11+B4) + (B8+B2))"
   still splits correctly. Returns [num, denom] or null. */
function splitFraction(formula) {
  const s = String(formula).trim()
  if (!s.startsWith('(')) return null
  let depth = 0, i = 0
  for (; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') { depth--; if (depth === 0) break }
  }
  if (i >= s.length - 1) return null
  const num = s.slice(1, i)
  const rest = s.slice(i + 1).trim()
  if (!rest.startsWith('/')) return null
  const denStr = rest.slice(1).trim()
  if (!denStr.startsWith('(') || !denStr.endsWith(')')) return null
  // confirm the outer parens balance to the very end
  let d2 = 0
  for (let j = 0; j < denStr.length; j++) {
    if (denStr[j] === '(') d2++
    else if (denStr[j] === ')') {
      d2--
      if (d2 === 0 && j !== denStr.length - 1) return null
    }
  }
  return [num, denStr.slice(1, -1)]
}

function MathChip({ formula, tint }) {
  const FONT = 'ui-serif, Georgia, "Cambria Math", "Times New Roman", serif'
  const frac = splitFraction(formula)
  if (frac) {
    return (
      <Box sx={{
        p: 1.4, my: 1, background: tint, borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT, fontSize: 15, color: C.deep,
      }}>
        <Box sx={{
          display: 'inline-flex', flexDirection: 'column',
          alignItems: 'stretch', lineHeight: 1.35,
        }}>
          <Box sx={{ textAlign: 'center', px: 1.5 }}>
            {renderTokens(frac[0])}
          </Box>
          <Box sx={{ borderTop: `1.5px solid ${C.deep}`, my: 0.4 }} />
          <Box sx={{ textAlign: 'center', px: 1.5 }}>
            {renderTokens(frac[1])}
          </Box>
        </Box>
      </Box>
    )
  }
  return (
    <Box sx={{
      p: 1.4, my: 1, background: tint, borderRadius: 2,
      textAlign: 'center', wordBreak: 'break-word',
      fontFamily: FONT, fontSize: 14, color: C.deep,
    }}>{renderTokens(formula)}</Box>
  )
}

/* ---------- Sentinel-2 spectrum: which bands we read ---------- */
function SpectrumBar() {
  /* `row` staggers the index list vertically so neighbouring bands (the
     visible ones cluster in 490–705 nm) never share a baseline. */
  const BANDS = [
    { name: 'B2',  wl: 490,  use: 'BSI',                     color: '#3b82f6', row: 0 },
    { name: 'B3',  wl: 560,  use: 'NDWI · MNDWI',            color: '#22c55e', row: 1 },
    { name: 'B4',  wl: 665,  use: 'NDVI · NDTI · TURBIDITY', color: '#ef4444', row: 0 },
    { name: 'B5',  wl: 705,  use: 'NDCI',                    color: '#a855f7', row: 1 },
    { name: 'B8',  wl: 842,  use: 'NDVI · NDWI · BSI',       color: '#6d28d9', row: 2 },
    { name: 'B11', wl: 1610, use: 'MNDWI · BSI',             color: '#1e1b4b', row: 0 },
  ]
  const W = 980, padL = 50, padR = 30, axisY = 130
  /* Piecewise x scale: the visible window (380–700 nm) is ¼ of the data
     range but holds 4 of our 6 bands, so a linear axis would crush them.
     Give the visible 50% of the width, NIR 20%, SWIR 30% - B4 and B5
     end up ~50 px apart, so their long index labels never collide. */
  const innerW = W - padL - padR
  const SEGMENTS = [
    { from: 380,  to: 700,  start: 0.00, end: 0.50 },
    { from: 700,  to: 1300, start: 0.50, end: 0.70 },
    { from: 1300, to: 2500, start: 0.70, end: 1.00 },
  ]
  const x = (wl) => {
    const s = SEGMENTS.find(s => wl <= s.to) || SEGMENTS[SEGMENTS.length - 1]
    const frac = (Math.max(s.from, wl) - s.from) / (s.to - s.from)
    return padL + (s.start + frac * (s.end - s.start)) * innerW
  }
  const ticks = [400, 500, 600, 700, 1000, 1300, 1600, 1900, 2200, 2500]
  return (
    <Box sx={{
      borderRadius: 4, p: { xs: 2, md: 3 }, mt: 2,
      background: '#fff', border: `1px solid ${C.border}`,
    }}>
      <Typography sx={{
        fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
        color: C.brand, textTransform: 'uppercase', mb: 1,
      }}>Sentinel-2 bands · the indices each one feeds</Typography>
      <Box component="svg" viewBox={`0 0 ${W} 232`} sx={{ width: '100%' }}>
        <defs>
          <linearGradient id="visGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0"    stopColor="#7c3aed" />
            <stop offset="0.15" stopColor="#3b82f6" />
            <stop offset="0.4"  stopColor="#22c55e" />
            <stop offset="0.65" stopColor="#eab308" />
            <stop offset="0.85" stopColor="#ef4444" />
            <stop offset="1"    stopColor="#7f1d1d" />
          </linearGradient>
        </defs>
        {/* visible rainbow */}
        <rect x={x(380)} y={axisY - 24} width={x(700) - x(380)} height={24}
              fill="url(#visGrad)" opacity={0.65} />
        <text x={(x(380) + x(700)) / 2} y={axisY - 28}
              textAnchor="middle" fontSize="10" fill={C.muted}>Visible</text>
        {/* NIR band shading */}
        <rect x={x(700)} y={axisY - 24} width={x(1300) - x(700)} height={24}
              fill={C.brand} opacity={0.22} />
        <text x={(x(700) + x(1300)) / 2} y={axisY - 28}
              textAnchor="middle" fontSize="10" fill={C.muted}>Near-infrared</text>
        {/* SWIR shading */}
        <rect x={x(1300)} y={axisY - 24} width={x(2500) - x(1300)} height={24}
              fill={C.deep} opacity={0.30} />
        <text x={(x(1300) + x(2500)) / 2} y={axisY - 28}
              textAnchor="middle" fontSize="10" fill={C.muted}>Short-wave IR</text>
        {/* axis */}
        <line x1={padL} y1={axisY} x2={W - padR} y2={axisY}
              stroke={C.border} strokeWidth={1} />
        {ticks.map(t => (
          <g key={t}>
            <line x1={x(t)} y1={axisY} x2={x(t)} y2={axisY + 5} stroke={C.muted} />
            <text x={x(t)} y={axisY + 18} textAnchor="middle"
                  fontSize="10" fill={C.muted}>{t}</text>
          </g>
        ))}
        <text x={W - padR + 4} y={axisY + 18} fontSize="10" fill={C.muted}>nm</text>
        {/* bands. The band identity is the code in the circle + its colour;
            the redundant colour-name label ("Blue/Red/...") was removed because
            B4/B5 sit too close in wavelength for a centred text label.
            Index lists are staggered into 2 rows BELOW the axis tick numbers
            so they never overlap with "400 / 700 / 1000 ..." nor with each
            other. A thin leader connects each label back to its band stem. */}
        {BANDS.map(b => {
          const useY = axisY + 38 + b.row * 16     // 168 (row 0) / 184 (row 1)
          return (
            <g key={b.name} transform={`translate(${x(b.wl)}, 0)`}>
              <line x1={0} y1={36} x2={0} y2={axisY - 24}
                    stroke={b.color} strokeWidth={2.5} />
              <circle r={11} cy={36} fill={b.color} />
              <text textAnchor="middle" y={40} fontSize="9.5"
                    fontWeight="800" fill="#fff">{b.name}</text>
              {/* leader from below the axis ticks down to the staggered index label */}
              <line x1={0} y1={axisY + 24} x2={0} y2={useY - 9}
                    stroke={C.border} strokeWidth={0.8} />
              <text textAnchor="middle" y={useY} fontSize="9.5"
                    fill={C.muted}>{b.use}</text>
            </g>
          )
        })}
      </Box>
      <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 1, fontStyle: 'italic' }}>
        Each Sentinel-2 band sees a specific wavelength range. We average each
        band's pixels per river segment, then combine them into the indices below.
      </Typography>
    </Box>
  )
}

/* ---------- the indices: formulas + what they "see" ---------- */
/* ---------- metric specimens (real Sentinel imagery per river) -----------
   Each metric card pulls a 480x270 PNG generated offline by
   `python -m backend.ingest.scripts.generate_metric_thumbs` over a tight
   bbox around the *selected* example river. Annotations are SVG overlays
   whose coordinates point to real features inside each image. The reader
   picks the river from a tab strip above the grid and all 8 metric cards
   re-render together with a TRUE_COLOR reference and a Romania locator. */

/* All thumbnails are rendered at 480x270; annotations live in the same
   coordinate space and are overlaid as an absolutely-positioned SVG. */
const _IMG_W = 480
const _IMG_H = 270

function _Annot({ x, y, lx, ly, text, color = '#0f172a' }) {
  const w = Math.max(60, text.length * 6.2 + 14)
  return (
    <g>
      <line x1={x} y1={y} x2={lx} y2={ly} stroke={color}
            strokeWidth="1.1" strokeDasharray="3 2" />
      <circle cx={x} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="1.6" />
      <rect x={lx - w / 2} y={ly - 10} width={w} height={18} rx={4}
            fill="#fff" stroke={color} strokeWidth="1" opacity="0.97" />
      <text x={lx} y={ly + 3} fontSize="11" fontWeight="700"
            fill={color} textAnchor="middle"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        {text}
      </text>
    </g>
  )
}

/* ---- per-river config: bbox, period, all 8 thumbs + TRUE_COLOR + per-metric
   annotation lists pointing to real features in each image. Adding a river
   = run the generator with the new bbox, add a block here, and the rest of
   the page (selector, locator, grid) wires up automatically. */
const _RIVERS = {
  danube: {
    key: 'danube',
    label: 'Danube Delta',
    sublabel: 'Tulcea + Razim lagoon',
    bbox: [28.60, 44.85, 29.85, 45.45],
    period: 'Jul-Aug 2024',
    trueColor: danubeTC,
    thumbs: {
      NDWI: danubeNDWI, MNDWI: danubeMNDWI, NDVI: danubeNDVI,
      NDCI: danubeNDCI, NDTI: danubeNDTI, TURBIDITY: danubeTURB,
      BSI: danubeBSI, OIL_PROBABILITY: danubeOIL,
      POLLUTION: danubePOLLUTION,
    },
    sensors: {
      default: 'Sentinel-2',
      OIL_PROBABILITY: 'Sentinel-1 SAR',
      POLLUTION: 'Composite · S2 indices',
    },
    annots: {
      NDWI: [
        { x: 300, y: 130, lx: 380, ly:  30, text: 'channel network', color: '#1e3a8a' },
        { x:  95, y: 215, lx:  90, ly: 250, text: 'Razim lagoon',    color: '#1e3a8a' },
      ],
      MNDWI: [
        { x: 250, y: 110, lx: 360, ly:  30, text: 'clean water mask', color: '#0c4a6e' },
        { x: 110, y:  50, lx: 110, ly:  20, text: 'land rejected',    color: '#0c4a6e' },
      ],
      NDVI: [
        { x: 220, y:  60, lx: 320, ly:  25, text: 'dense reed beds', color: '#14532d' },
        { x:  90, y: 230, lx:  90, ly: 250, text: 'bare sand bars',  color: '#7c2d12' },
      ],
      NDCI: [
        { x: 220, y: 120, lx: 320, ly:  30, text: 'chlorophyll hotspot', color: '#7f1d1d' },
        { x:  60, y: 200, lx:  70, ly: 250, text: 'clearer lagoon',      color: '#155e75' },
      ],
      NDTI: [
        { x: 110, y: 130, lx: 110, ly:  20, text: 'sediment-rich edges', color: '#78350f' },
        { x: 320, y: 150, lx: 380, ly: 250, text: 'clearer mainstem',    color: '#1e3a8a' },
      ],
      TURBIDITY: [
        { x: 110, y:  80, lx: 130, ly:  20, text: 'silty shoreline',  color: '#78350f' },
        { x: 320, y: 130, lx: 360, ly: 250, text: 'clearer channels', color: '#1e3a8a' },
      ],
      BSI: [
        { x:  60, y: 200, lx:  80, ly: 250, text: 'bare deltaic soil', color: '#7f1d1d' },
        { x: 280, y:  90, lx: 330, ly:  20, text: 'vegetated levees',  color: '#14532d' },
      ],
      OIL_PROBABILITY: [
        { x: 170, y: 130, lx: 220, ly:  30, text: 'dark calm patches', color: '#3c096c' },
        { x: 100, y: 215, lx:  90, ly: 250, text: 'lagoon hotspot',    color: '#3c096c' },
      ],
      POLLUTION: [
        { x: 220, y:  90, lx: 300, ly:  30, text: 'turbid lagoon = MEDIUM', color: '#7f1d1d' },
        { x:  90, y: 200, lx:  90, ly: 250, text: 'mostly LOW background', color: '#14532d' },
      ],
    },
  },

  mures: {
    key: 'mures',
    label: 'Mureș',
    sublabel: 'Ocna Mureș meanders',
    bbox: [23.70, 46.28, 24.05, 46.48],
    period: 'Jul-Aug 2024',
    trueColor: muresTC,
    thumbs: {
      NDWI: muresNDWI, MNDWI: muresMNDWI, NDVI: muresNDVI,
      NDCI: muresNDCI, NDTI: muresNDTI, TURBIDITY: muresTURB,
      BSI: muresBSI, OIL_PROBABILITY: muresOIL,
      POLLUTION: muresPOLLUTION,
    },
    sensors: {
      default: 'Sentinel-2',
      OIL_PROBABILITY: 'Sentinel-1 SAR',
      POLLUTION: 'Composite · S2 indices',
    },
    annots: {
      NDWI: [
        { x: 240, y: 130, lx: 250, ly:  20, text: 'Mureș meanders',    color: '#1e3a8a' },
        { x: 420, y:  60, lx: 410, ly: 250, text: 'side reservoir',    color: '#1e3a8a' },
      ],
      MNDWI: [
        { x: 240, y: 130, lx: 250, ly:  20, text: 'thin river thread', color: '#0c4a6e' },
        { x:  40, y: 220, lx:  90, ly: 250, text: 'tributary',         color: '#0c4a6e' },
      ],
      NDVI: [
        { x: 280, y: 110, lx: 350, ly:  20, text: 'crop fields',       color: '#14532d' },
        { x:  90, y:  40, lx:  90, ly:  20, text: 'harvested patches', color: '#7c2d12' },
      ],
      NDCI: [
        { x: 240, y: 130, lx: 240, ly:  20, text: 'low chlorophyll',   color: '#155e75' },
        { x: 420, y:  60, lx: 410, ly: 250, text: 'still water = bloom', color: '#7f1d1d' },
      ],
      NDTI: [
        { x: 240, y: 130, lx: 240, ly:  20, text: 'agricultural runoff', color: '#78350f' },
        { x: 380, y: 220, lx: 380, ly: 250, text: 'silt-laden tributary', color: '#78350f' },
      ],
      TURBIDITY: [
        { x: 240, y: 130, lx: 240, ly:  20, text: 'turbid mainstem',   color: '#78350f' },
        { x: 420, y:  60, lx: 410, ly: 250, text: 'clearer reservoir', color: '#1e3a8a' },
      ],
      BSI: [
        { x: 160, y: 200, lx: 160, ly: 250, text: 'bare farm fields',  color: '#7f1d1d' },
        { x: 320, y:  60, lx: 340, ly:  20, text: 'crop canopy',       color: '#14532d' },
      ],
      OIL_PROBABILITY: [
        { x: 240, y: 130, lx: 240, ly:  20, text: 'no SAR oil signal', color: '#3c096c' },
        { x: 100, y: 200, lx: 110, ly: 250, text: 'JRC water mask sparse inland', color: '#3c096c' },
      ],
      POLLUTION: [
        { x: 240, y: 130, lx: 250, ly:  20, text: 'agricultural turbidity hotspots', color: '#7f1d1d' },
        { x: 160, y: 220, lx: 160, ly: 250, text: 'forested catchment = LOW',   color: '#14532d' },
      ],
    },
  },

  olt: {
    key: 'olt',
    label: 'Olt',
    sublabel: 'Călimănești - Cozia gorge',
    bbox: [24.20, 45.20, 24.95, 45.65],
    period: 'Jul-Aug 2024',
    trueColor: oltTC,
    thumbs: {
      NDWI: oltNDWI, MNDWI: oltMNDWI, NDVI: oltNDVI,
      NDCI: oltNDCI, NDTI: oltNDTI, TURBIDITY: oltTURB,
      BSI: oltBSI, OIL_PROBABILITY: oltOIL,
      POLLUTION: oltPOLLUTION,
    },
    sensors: {
      default: 'Sentinel-2',
      OIL_PROBABILITY: 'Sentinel-1 SAR',
      POLLUTION: 'Composite · S2 indices',
    },
    annots: {
      NDWI: [
        { x: 270, y: 130, lx: 370, ly:  30, text: 'Călimănești reservoir', color: '#1e3a8a' },
        { x:  60, y: 200, lx:  90, ly: 250, text: 'side channels',         color: '#1e3a8a' },
      ],
      MNDWI: [
        { x: 270, y: 130, lx: 370, ly:  30, text: 'reservoir mask', color: '#0c4a6e' },
        { x:  60, y: 200, lx:  90, ly: 250, text: 'tight gorges',   color: '#0c4a6e' },
      ],
      NDVI: [
        { x: 380, y:  60, lx: 400, ly:  20, text: 'Carpathian forest',  color: '#14532d' },
        { x: 270, y: 130, lx: 140, ly: 250, text: 'reservoir surface',  color: '#7c2d12' },
      ],
      NDCI: [
        { x: 270, y: 130, lx: 370, ly:  30, text: 'low chlorophyll',  color: '#155e75' },
        { x:  90, y: 200, lx:  90, ly: 250, text: 'mountain runoff',  color: '#155e75' },
      ],
      NDTI: [
        { x: 270, y: 130, lx: 370, ly:  30, text: 'low turbidity reservoir', color: '#1e3a8a' },
        { x: 100, y:  40, lx: 130, ly:  20, text: 'cloud-shadow speckle',    color: '#78350f' },
      ],
      TURBIDITY: [
        { x: 270, y: 130, lx: 370, ly:  30, text: 'reservoir-controlled', color: '#1e3a8a' },
        { x: 100, y: 200, lx: 110, ly: 250, text: 'forest shadows',       color: '#78350f' },
      ],
      BSI: [
        { x: 380, y:  60, lx: 400, ly:  20, text: 'fully vegetated', color: '#14532d' },
        { x: 100, y: 200, lx: 110, ly: 250, text: 'no bare patches', color: '#14532d' },
      ],
      OIL_PROBABILITY: [
        { x: 270, y: 130, lx: 370, ly:  30, text: 'reservoir surface', color: '#3c096c' },
        { x: 100, y: 200, lx: 110, ly: 250, text: 'limited inland water mask', color: '#3c096c' },
      ],
      POLLUTION: [
        { x: 280, y: 130, lx: 360, ly:  30, text: 'reservoir = LOW score',  color: '#14532d' },
        { x: 100, y: 220, lx: 110, ly: 250, text: 'Carpathian forest = LOW', color: '#14532d' },
      ],
    },
  },
}

/* ---- Romania locator: real FAO/GAUL silhouette + highlighted bbox ----
   The polygon data comes from `frontend/src/assets/romania_outline.json`
   generated by the thumbnail script. Multiple polygons (mainland + a few
   Danubian islets) are stitched into one SVG path with `evenodd` fill
   so any future holes are handled correctly. */
const _RO_BOUNDS = (() => {
  // Compute the bounding box from the actual polygon data so we never
  // drift if the source dataset is updated.
  let lon0 = +Infinity, lon1 = -Infinity, lat0 = +Infinity, lat1 = -Infinity
  for (const p of romaniaOutline.polygons) {
    for (const [lo, la] of p.outer) {
      if (lo < lon0) lon0 = lo
      if (lo > lon1) lon1 = lo
      if (la < lat0) lat0 = la
      if (la > lat1) lat1 = la
    }
  }
  return { lon0, lon1, lat0, lat1 }
})()

function _ringToPath(ring, lon2x, lat2y) {
  if (!ring || ring.length === 0) return ''
  return ring
    .map(([lo, la], i) =>
      `${i === 0 ? 'M' : 'L'} ${lon2x(lo).toFixed(1)} ${lat2y(la).toFixed(1)}`)
    .join(' ') + ' Z'
}

function RomaniaLocator({ bbox, accent = C.brand }) {
  const W = 280, H = 175
  const PAD = 6
  // Fit the country bbox into the panel while preserving the lon/lat
  // aspect at Romania's latitude. cos(45.5°) ≈ 0.70 keeps the country
  // looking right (degrees of longitude are shorter than latitude this
  // far north). Center horizontally and vertically.
  const dLon = _RO_BOUNDS.lon1 - _RO_BOUNDS.lon0
  const dLat = _RO_BOUNDS.lat1 - _RO_BOUNDS.lat0
  const cosLat = Math.cos(((_RO_BOUNDS.lat0 + _RO_BOUNDS.lat1) / 2) * Math.PI / 180)
  const innerW = W - 2 * PAD, innerH = H - 2 * PAD
  const scale = Math.min(innerW / (dLon * cosLat), innerH / dLat)
  const drawW = dLon * cosLat * scale
  const drawH = dLat * scale
  const offsetX = (W - drawW) / 2
  const offsetY = (H - drawH) / 2
  const lon2x = (lon) => offsetX + (lon - _RO_BOUNDS.lon0) * cosLat * scale
  const lat2y = (lat) => offsetY + (_RO_BOUNDS.lat1 - lat) * scale

  // Stitch every polygon (mainland + islets) into a single path so we
  // can apply one fill/stroke + drop-shadow.
  const outlineD = romaniaOutline.polygons
    .flatMap((p) => [_ringToPath(p.outer, lon2x, lat2y),
                     ...(p.holes || []).map((h) => _ringToPath(h, lon2x, lat2y))])
    .join(' ')

  // Highlighted viewing rectangle for the selected bbox.
  const [lon0, lat0, lon1, lat1] = bbox
  const rx = lon2x(lon0)
  const ry = lat2y(lat1)
  const rw = lon2x(lon1) - lon2x(lon0)
  const rh = lat2y(lat0) - lat2y(lat1)

  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`}
         sx={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="ro-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"  stopColor="#faf5ff" />
          <stop offset="1"  stopColor="#ede9fe" />
        </linearGradient>
        <filter id="ro-drop" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.3" />
          <feOffset dx="0" dy="1" />
          <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="bbox-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      {/* country silhouette - real GAUL polygons */}
      <path d={outlineD} fill="url(#ro-fill)" stroke={C.glow}
            strokeWidth="0.9" strokeLinejoin="round" fillRule="evenodd"
            filter="url(#ro-drop)" />
      {/* highlighted bbox - soft glow underneath, sharp outline on top */}
      <rect x={rx - 1} y={ry - 1} width={rw + 2} height={rh + 2}
            fill={accent} opacity="0.4" filter="url(#bbox-glow)" />
      <rect x={rx} y={ry} width={rw} height={rh}
            fill={accent} fillOpacity="0.22"
            stroke={accent} strokeWidth="1.4" />
      {/* tiny center dot for emphasis */}
      <circle cx={rx + rw / 2} cy={ry + rh / 2} r="2.4"
              fill={accent} stroke="#fff" strokeWidth="1.3" />
    </Box>
  )
}

/* ---- River selector tabs ----
   Brand-styled pill row, sticky inside its Paper so it stays visible
   while the user scrolls down through the eight metric cards. */
function RiverSelector({ value, onChange }) {
  const rivers = Object.values(_RIVERS)
  return (
    <Box sx={{
      display: 'inline-flex', gap: 0.5, p: 0.5,
      borderRadius: 999, bgcolor: C.tint, border: `1px solid ${C.border}`,
    }}>
      {rivers.map((r) => {
        const active = r.key === value
        return (
          <Box
            key={r.key}
            component="button"
            onClick={() => onChange(r.key)}
            sx={{
              cursor: 'pointer', border: 'none',
              px: 1.75, py: 0.75, borderRadius: 999,
              fontSize: 13, fontWeight: 700, letterSpacing: 0.2,
              fontFamily: 'inherit',
              color: active ? '#fff' : C.deep,
              background: active
                ? `linear-gradient(135deg, ${C.deep} 0%, ${C.brand} 100%)`
                : 'transparent',
              transition: 'all .15s ease',
              '&:hover': { background: active
                ? `linear-gradient(135deg, ${C.deep} 0%, ${C.brand} 100%)`
                : 'rgba(199,125,255,0.18)' },
            }}
          >
            {r.label}
          </Box>
        )
      })}
    </Box>
  )
}

/* ---- Hero panel above the grid ----
   River selector (top) + Romania locator (left) + true-colour reference
   (right), with bbox / period caption. Sets the geographic context so
   every card below reads as "same scene, different metric, different
   signal". */
function MetricsHero({ riverKey, onRiverChange }) {
  const r = _RIVERS[riverKey]
  const [lon0, lat0, lon1, lat1] = r.bbox
  const bboxFmt = `${lon0.toFixed(2)}-${lon1.toFixed(2)}°E · ${lat0.toFixed(2)}-${lat1.toFixed(2)}°N`
  return (
    <Paper elevation={0} sx={{
      p: { xs: 2, md: 2.5 }, mb: 2.5,
      borderRadius: 3,
      background: '#fff', border: `1px solid ${C.border}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Box>
          <Typography sx={{
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}>Pick an example river</Typography>
          <Typography sx={{
            fontSize: 17, fontWeight: 800, color: C.ink,
            letterSpacing: -0.2, lineHeight: 1.2, mt: 0.25,
          }}>
            {r.label} <Box component="span" sx={{ color: C.muted, fontWeight: 600 }}>· {r.sublabel}</Box>
          </Typography>
        </Box>
        <RiverSelector value={riverKey} onChange={onRiverChange} />
      </Box>

      <Grid container spacing={2} alignItems="stretch">
        {/* Romania locator (small) */}
        <Grid size={{ xs: 12, sm: 5, md: 4 }}>
          <Box sx={{
            borderRadius: 2, p: 1.25, height: '100%',
            background: `linear-gradient(160deg, #fff 0%, ${C.tint} 100%)`,
            border: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <Typography sx={{
              fontSize: 10, fontWeight: 700, color: C.muted,
              textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5,
            }}>Location in Romania</Typography>
            <RomaniaLocator bbox={r.bbox} />
            <Typography sx={{
              fontSize: 10.5, color: C.muted, mt: 0.75, lineHeight: 1.4,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            }}>{bboxFmt}</Typography>
          </Box>
        </Grid>
        {/* True-colour Sentinel-2 reference */}
        <Grid size={{ xs: 12, sm: 7, md: 8 }}>
          <Box sx={{
            borderRadius: 2, overflow: 'hidden',
            border: `1px solid ${C.border}`, lineHeight: 0,
            height: '100%', display: 'flex', flexDirection: 'column',
          }}>
            <Box sx={{
              px: 1.25, py: 0.6,
              fontSize: 10, color: C.muted, fontWeight: 700,
              letterSpacing: 0.6, textTransform: 'uppercase',
              bgcolor: '#fff', borderBottom: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', gap: 1, lineHeight: 1.4,
            }}>
              <Box component="span">Satellite view · what we're looking at</Box>
              <Box component="span" sx={{ color: C.brand }}>Sentinel-2 RGB · {r.period}</Box>
            </Box>
            <Box sx={{ position: 'relative', width: '100%', flex: 1, minHeight: 0,
                        aspectRatio: `${_IMG_W} / ${_IMG_H}` }}>
              <Box component="img" src={r.trueColor}
                   alt={`Sentinel-2 RGB over ${r.label}, ${r.period}`}
                   sx={{ position: 'absolute', inset: 0,
                          width: '100%', height: '100%', objectFit: 'cover' }} />
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  )
}

function MetricSpecimen({ metric, riverKey }) {
  const r = _RIVERS[riverKey]
  if (!r) return null
  const img = r.thumbs[metric]
  const annots = r.annots[metric] || []
  const sensor = r.sensors[metric] || r.sensors.default
  if (!img) return null
  return (
    <Box sx={{
      mt: 1.25, mb: 1.5,
      borderRadius: 1.75,
      overflow: 'hidden',
      border: `1px solid ${C.border}`,
      bgcolor: '#fafafa',
      lineHeight: 0,
    }}>
      <Box sx={{ position: 'relative', width: '100%',
                  aspectRatio: `${_IMG_W} / ${_IMG_H}` }}>
        <Box
          component="img"
          src={img}
          alt={`${metric} over ${r.label}, ${r.period} (${sensor})`}
          sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          loading="lazy"
        />
        <Box
          component="svg"
          viewBox={`0 0 ${_IMG_W} ${_IMG_H}`}
          preserveAspectRatio="xMidYMid meet"
          sx={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
          }}
        >
          {annots.map((a, i) => <_Annot key={i} {...a} />)}
        </Box>
      </Box>
      <Box sx={{
        px: 1.25, py: 0.6,
        fontSize: 10, color: C.muted,
        letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700,
        borderTop: `1px solid ${C.border}`, bgcolor: '#fff',
        lineHeight: 1.4,
        display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap',
      }}>
        <Box component="span">{r.label} · {r.period}</Box>
        <Box component="span" sx={{ color: C.brand }}>{sensor}</Box>
      </Box>
    </Box>
  )
}

/* The eight metrics split by source sensor. The S1 SAR oil signal and
   the S2 optical indices answer different questions with different
   physics, so they're presented as two separate subsections on the page,
   followed by the combined pollution-and-risk derivation. */
const _IC = {
  water:   <WaterDropIcon sx={{ fontSize: 22, color: '#2563eb' }} />,
  forest:  <ForestIcon    sx={{ fontSize: 22, color: '#16a34a' }} />,
  spa:     <SpaIcon       sx={{ fontSize: 22, color: '#059669' }} />,
  waves:   <WavesIcon     sx={{ fontSize: 22, color: '#b45309' }} />,
  terrain: <TerrainIcon   sx={{ fontSize: 22, color: '#b91c1c' }} />,
  oil:     <OilBarrelIcon sx={{ fontSize: 22, color: C.brand }} />,
}

const _S2_ITEMS = [
  {
    name: 'NDWI', icon: 'water', tint: '#dbeafe',
    formula: '(B3 − B8) / (B3 + B8)',
    sees: 'Water bodies (McFeeters 1996)',
    range: '−1 … +1',
    reads:
      'Higher in standing water because water absorbs NIR. Classic but '
      + 'imperfect: built-up surfaces can falsely score positive - which '
      + 'is exactly why MNDWI was invented.',
  },
  {
    name: 'MNDWI', icon: 'water', tint: '#bfdbfe',
    formula: '(B3 − B11) / (B3 + B11)',
    sees: 'Refined water mask (Xu 2006)',
    range: '−1 … +1 · water ≳ 0.2',
    reads:
      'Replaces NIR with SWIR (B11) - much cleaner against built-up '
      + 'areas, snow, and bright soil. We use it as the water mask that '
      + 'gates the rest of the pollution computation.',
  },
  {
    name: 'NDVI', icon: 'forest', tint: '#dcfce7',
    formula: '(B8 − B4) / (B8 + B4)',
    sees: 'Vegetation density · canopy health',
    range: '−1 … +1',
    reads:
      '≈ 0.3 sparse, 0.6+ dense canopy. On river banks low NDVI means '
      + 'exposed soil - one of the bank/catchment signals our pollution '
      + 'model considers.',
  },
  {
    name: 'NDCI', icon: 'spa', tint: '#d1fae5',
    formula: '(B5 − B4) / (B5 + B4)',
    sees: 'Chlorophyll-a in water · algal blooms',
    range: '−0.2 … +0.4',
    reads:
      'Uses the red-edge band B5 (only Sentinel-2 has this at native '
      + '20 m). High values = phytoplankton biomass → eutrophication / '
      + 'potential harmful algal bloom signal in the water column.',
  },
  {
    name: 'NDTI', icon: 'waves', tint: '#fef3c7',
    formula: '(B4 − B3) / (B4 + B3)',
    sees: 'Turbidity index (Lacaux 2007)',
    range: '−0.5 … +0.5',
    reads:
      'Positive = water reflects more red than green → suspended '
      + 'sediment, cloudy water column. A primary input on the water-side '
      + 'of our pollution model because it tracks acute pollution events.',
  },
  {
    name: 'TURBIDITY', icon: 'waves', tint: '#fde68a',
    formula: 'B4 (raw red reflectance)',
    sees: 'Sediment proxy',
    range: '0 … ~2000 (scaled)',
    reads:
      'A simpler complement to NDTI: brighter water in the red channel '
      + '≈ siltier / more disturbed water. Used as a cross-check when '
      + 'NDTI looks noisy near banks.',
  },
  {
    name: 'BSI', icon: 'terrain', tint: '#fee2e2',
    formula: '((B11+B4) − (B8+B2)) / ((B11+B4) + (B8+B2))',
    sees: 'Bare soil · erosion · land-use change',
    range: '−1 … +1 · soil ≳ 0.3',
    reads:
      'Highlights exposed soil along catchment and banks - a proxy '
      + 'for erosion pressure and land-use change, which translate into '
      + 'longer-term water-quality risk downstream.',
  },
]

const _S1_ITEMS = [
  {
    name: 'OIL_PROBABILITY', icon: 'oil', tint: '#ede9fe',
    formula: '0.45·VV_drop + 0.25·VH_drop + 0.20·abs_dark + 0.10·(1 − texture)',
    sees: 'Oil-slick likelihood (Sentinel-1 SAR)',
    range: '0 … 1 · DARK_PIXEL ≥ 0.55',
    reads:
      'Combines how much darker the pass is vs the multi-year baseline '
      + '(VV + VH polarizations), absolute darkness, and surface '
      + 'smoothness (low texture). Masked to permanent water bodies '
      + '(JRC Global Surface Water occurrence ≥ 20 %).',
  },
]

function MetricCard({ item, riverKey, delay = 0 }) {
  return (
    <Reveal delay={delay}>
      <Paper elevation={0} sx={{
        p: 2.25, height: '100%', borderRadius: 3,
        background: '#fff', border: `1px solid ${C.border}`,
        transition: 'transform .2s ease, box-shadow .2s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 12px 24px rgba(90,24,154,0.16)',
        },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box sx={{
            width: 42, height: 42, borderRadius: 1.75, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: item.tint,
          }}>{_IC[item.icon]}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 800,
                               color: C.ink, lineHeight: 1.15 }}>
              {item.name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.muted, lineHeight: 1.2 }}>
              {item.sees}
            </Typography>
          </Box>
          <Box sx={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 700,
            color: C.deep, px: 1, py: 0.35, borderRadius: 999,
            bgcolor: item.tint,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}>{item.range}</Box>
        </Box>
        <MathChip formula={item.formula} tint={item.tint} />
        <MetricSpecimen metric={item.name} riverKey={riverKey} />
        <Typography sx={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
          {item.reads}
        </Typography>
      </Paper>
    </Reveal>
  )
}

/* Visual divider between the SAR / Optical / Risk subsections. The
   gradient changes per axis so the eye can land on either section
   without re-reading the kicker. */
function SensorSectionHeader({ kicker, title, subtitle, icon, gradient }) {
  return (
    <Box sx={{
      mt: 4, mb: 2.25,
      p: { xs: 1.75, md: 2.25 },
      borderRadius: 3,
      background: gradient,
      color: '#fff',
      display: 'flex', alignItems: 'center', gap: 2,
      boxShadow: '0 8px 20px rgba(60,9,108,0.15)',
    }}>
      <Box sx={{
        width: 50, height: 50, flexShrink: 0,
        borderRadius: 2,
        bgcolor: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
          textTransform: 'uppercase', opacity: 0.85,
        }}>{kicker}</Typography>
        <Typography sx={{
          fontSize: { xs: 17, md: 20 }, fontWeight: 800,
          letterSpacing: -0.3, lineHeight: 1.2, mt: 0.2,
        }}>{title}</Typography>
        <Typography sx={{
          fontSize: 13, opacity: 0.9, mt: 0.5, lineHeight: 1.45,
        }}>{subtitle}</Typography>
      </Box>
    </Box>
  )
}

/* Whole "What we read from every pass" section: one river selector
   driving both the S1 and S2 subsections, then the pollution+risk
   derivation that combines them. Order is sensor-first: SAR (one
   strong card + the radar-physics animation), then optical (band
   spectrum + 7 cards), then the risk classifier. */
function MetricsSection() {
  const [riverKey, setRiverKey] = useState('danube')
  return (
    <>
      <MetricsHero riverKey={riverKey} onRiverChange={setRiverKey} />

      {/* === Sentinel-1 SAR === */}
      <SensorSectionHeader
        kicker="Sentinel-1"
        title="SAR · clouds-and-night radar"
        subtitle="Active C-band microwave bounces off the water surface and measures its roughness. Oil dampens ripples, so slicks show up as darker patches than the multi-year same-month baseline."
        icon={<SatelliteAltIcon sx={{ fontSize: 28, color: '#fff' }} />}
        gradient={`linear-gradient(135deg, ${C.deep} 0%, ${C.brand} 60%, ${C.bright} 100%)`}
      />
      {/* The SAR story now lives in two parallel panels:
          left = S1Concept (VV/VH primer + baseline→event→Δ animation +
                 drop equation, all in one card)
          right = OIL_PROBABILITY metric card (formula + thumbnail) */}
      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, md: 6 }}>
          <Reveal sx={{ height: '100%' }}>
            <S1Concept />
          </Reveal>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <MetricCard item={_S1_ITEMS[0]} riverKey={riverKey} delay={80} />
        </Grid>
      </Grid>

      {/* === Sentinel-2 optical === */}
      <SensorSectionHeader
        kicker="Sentinel-2"
        title="Optical · 13 spectral bands"
        subtitle="Passive multispectral imager from visible through SWIR. Different bands answer different questions: chlorophyll-a (red-edge), turbidity (red), exposed soil (SWIR), water mask (NIR/SWIR)."
        icon={<SatelliteAltIcon sx={{ fontSize: 28, color: '#fff' }} />}
        gradient="linear-gradient(135deg, #0c4a6e 0%, #0369a1 60%, #0284c7 100%)"
      />
      <Reveal delay={40}><SpectrumBar /></Reveal>
      <Grid container spacing={2} sx={{ mt: 2 }}>
        {_S2_ITEMS.map((it, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 6 }} key={it.name}>
            <MetricCard item={it} riverKey={riverKey} delay={i * 40} />
          </Grid>
        ))}
      </Grid>

      {/* === Spatial unit · EU-Hydro ===
          The "where do we measure" subsection. Sits between the metric
          definitions (above) and the verdict that combines them (below).
          The reader has just learnt which signals we read; before we show
          how they roll up into a risk level, we explain where each
          reading is bound to - one segment of the EU-Hydro topology. */}
      <SpatialUnitSection />

      {/* === Pollution + risk derivation === */}
      <SensorSectionHeader
        kicker="Pollution + risk"
        title="All the signals, one composite per segment"
        subtitle="A weighted blend of the water-side and bank-side indices into a single POLLUTION score in the 0 - 7 range. The score is computed at ingest time and stored alongside the metrics, so the map and charts read it straight from the time-series store - no re-classification at read time."
        icon={<ShieldIcon sx={{ fontSize: 28, color: '#fff' }} />}
        gradient="linear-gradient(135deg, #92400e 0%, #b45309 55%, #d97706 100%)"
      />
      <Reveal delay={60} sx={{ width: '100%' }}>
        <RiskFlow riverKey={riverKey} />
      </Reveal>
    </>
  )
}

/* ---- Spatial unit · EU-Hydro -------------------------------------------
   The "where do we measure" panel: kicker + headline + 2-col content
   (SegmentCloseup pixel-grid visual on the left, EU-Hydro depth on the
   right), with a 3-chip stat strip below. Lives inside <MetricsSection />
   so the reader sees what we read (sensors) -> where we read it (segment)
   -> what we conclude (risk) in one continuous scroll. */
function _EUHydroStat({ value, label, sub }) {
  return (
    <Paper elevation={0} sx={{
      p: 1.75, height: '100%', borderRadius: 2.5,
      background: `linear-gradient(160deg, #fff 0%, ${C.tint} 100%)`,
      border: `1px solid ${C.border}`,
    }}>
      <Typography sx={{
        fontSize: 22, fontWeight: 800, color: C.brand,
        letterSpacing: -0.4, lineHeight: 1.1,
      }}>{value}</Typography>
      <Typography sx={{
        fontSize: 11.5, fontWeight: 800, color: C.ink,
        textTransform: 'uppercase', letterSpacing: 0.5, mt: 0.4,
      }}>{label}</Typography>
      <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 0.2, lineHeight: 1.4 }}>
        {sub}
      </Typography>
    </Paper>
  )
}

function SpatialUnitSection() {
  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
          color: C.brand, textTransform: 'uppercase',
        }}>Spatial unit · EU-Hydro</Typography>
        <Typography sx={{
          fontSize: { xs: 20, md: 24 }, fontWeight: 800,
          color: C.ink, letterSpacing: -0.3, lineHeight: 1.2, mt: 0.5,
        }}>
          One river segment, one value per pass.
        </Typography>
        <Typography sx={{ color: C.muted, fontSize: 14, maxWidth: 820, mt: 0.75 }}>
          Every observation in the store is bound to a single segment of the
          EU-Hydro river network - the smallest unit we measure, store and
          query.
        </Typography>
      </Box>

      <Grid container spacing={2.5} alignItems="stretch">
        <Grid size={{ xs: 12, md: 7 }}>
          <Reveal sx={{ height: '100%' }}>
            <SegmentCloseup />
          </Reveal>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Reveal delay={120} sx={{ height: '100%' }}>
            <Paper elevation={0} sx={{
              p: { xs: 2, md: 2.5 }, height: '100%', borderRadius: 3,
              background: '#fff', border: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', gap: 1.5,
            }}>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>
                  What is EU-Hydro?
                </Typography>
                <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.4,
                                   lineHeight: 1.55 }}>
                  The European Environment Agency's hydrography dataset,
                  distributed through Copernicus Land Monitoring. One
                  harmonised river network across every member state -
                  same scale, same naming convention, same topology -
                  derived from satellite imagery + reference Digital
                  Elevation Models.
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>
                  Topology-aware, not just lines on a map
                </Typography>
                <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.4,
                                   lineHeight: 1.55 }}>
                  Every segment knows its predecessors and successors via
                  the Strahler stream-order graph. That's what powers our
                  "everything upstream of this point" queries - a single
                  graph traversal lights up the whole catchment. We
                  filter to Strahler order ≥ 3 to skip the smallest
                  headwater trickles and focus on rivers that drain
                  meaningful catchments.
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>
                  Polylines, not polygons
                </Typography>
                <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.4,
                                   lineHeight: 1.55 }}>
                  A segment is a 1-3 km polyline broken at confluences
                  and named-river boundaries. Earth Engine intersects
                  each polyline with the 10 m Sentinel pixel grid and
                  averages the overlapping pixels into a single value
                  per index - that's the "one number per (segment,
                  sensor, pass)" every chart, map and PDF queries
                  downstream.
                </Typography>
              </Box>
            </Paper>
          </Reveal>
        </Grid>
      </Grid>

      <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <_EUHydroStat value="5,144"
                        label="Rivers covered"
                        sub="EU-Hydro · Romanian subset" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <_EUHydroStat value="34,654"
                        label="Segments"
                        sub="Topology nodes we ingest" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <_EUHydroStat value="≥ 3"
                        label="Strahler filter"
                        sub="Smaller headwaters skipped" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <_EUHydroStat value="1 - 3 km"
                        label="Segment length"
                        sub="Polylines, not areas" />
        </Grid>
      </Grid>
    </Box>
  )
}

/* ---------- POLLUTION composite + risk levels ----------
   The page now positions POLLUTION as a natural composite of the indices
   above (water-side + bank-side), with an explicit numeric range and the
   3 bucket boundaries shown plainly. A real EE-computed POLLUTION raster
   over the selected river sits on the right so the reader sees what the
   composite actually looks like in pixels.

   The exact weights and per-index thresholds stay on the backend (not on
   the marketing surface) but the framing is no longer "secret model" -
   just "our composite". */
function RiskFlow({ riverKey = 'danube' }) {
  return (
    <Box sx={{
      borderRadius: 4, p: { xs: 2.5, md: 3 }, mt: 3,
      background: '#fff', border: `1px solid ${C.border}`,
    }}>
      <Grid container spacing={2}>
        {/* Left: water-side + bank-side groups, then the 0-7 range bar */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{
            p: 2.25, height: '100%', borderRadius: 3,
            background: `linear-gradient(160deg, #fff, ${C.tint})`,
            border: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', gap: 2.25,
          }}>
            {/* Water-side */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 800,
                                 letterSpacing: 1.2, color: C.brand, mb: 0.5 }}>
                Water-side · in the water column
              </Typography>
              <Typography sx={{ fontSize: 13, color: C.ink,
                                 lineHeight: 1.55, mb: 1 }}>
                Turbidity, sediment brightness and chlorophyll-a inside
                the river itself. An MNDWI water mask gates the whole
                sub-score so land pixels never bleed into a river's
                reading.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {['NDTI', 'TURBIDITY', 'NDCI', 'MNDWI gate'].map((t) => (
                  <SignalChip key={t} label={t} />
                ))}
              </Box>
            </Box>

            {/* Bank-side */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 800,
                                 letterSpacing: 1.2, color: C.brand, mb: 0.5 }}>
                Bank-side · on the banks &amp; catchment
              </Typography>
              <Typography sx={{ fontSize: 13, color: C.ink,
                                 lineHeight: 1.55, mb: 1 }}>
                Vegetation cover and exposed soil on the riparian zone
                around the segment - the slow drivers of long-term
                downstream water quality.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {['NDVI', 'BSI'].map((t) => (
                  <SignalChip key={t} label={t} />
                ))}
              </Box>
            </Box>

            {/* Range / binning */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 800,
                                 letterSpacing: 1.2, color: C.brand, mb: 0.5 }}>
                Range
              </Typography>
              <Typography sx={{ fontSize: 13, color: C.ink, lineHeight: 1.55, mb: 1 }}>
                Integer in <strong>0 - 7</strong> per segment, binned into
                three levels:
              </Typography>
              <RangeBar />
            </Box>
          </Paper>
        </Grid>

        {/* Right: real EE-computed POLLUTION raster over the selected river */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{
            p: 2.25, height: '100%', borderRadius: 3,
            background: `linear-gradient(160deg, #fff, ${C.tint})`,
            border: `1px solid ${C.border}`,
          }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800,
                               letterSpacing: 1.2, color: C.brand, mb: 0.5 }}>
              POLLUTION on a real Sentinel scene
            </Typography>
            <Typography sx={{ fontSize: 13, color: C.ink, mb: 1.25, lineHeight: 1.5 }}>
              The composite, computed pixel-by-pixel from the same
              indices and rendered with the same green → amber → red
              palette as the map.
            </Typography>
            <MetricSpecimen metric="POLLUTION" riverKey={riverKey} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

/* Continuous 0-7 range bar with LOW / MEDIUM / HIGH bands. The cells
   carry the numeric integers; the labels beneath name each band and its
   user-facing intent (calm / watch / act). */
function RangeBar() {
  // 8 cells for integers 0..7, each ~12.5% of the bar
  const palette = ['#16a34a', '#22c55e', '#65a30d',
                   '#eab308', '#f59e0b',
                   '#ea580c', '#dc2626', '#7f1d1d']
  const bands = [
    { flex: 3, label: 'LOW',    sub: 'calm',  color: '#15803d' },
    { flex: 2, label: 'MEDIUM', sub: 'watch', color: '#a16207' },
    { flex: 3, label: 'HIGH',   sub: 'act',   color: '#991b1b' },
  ]
  return (
    <Box>
      <Box sx={{
        display: 'flex', borderRadius: 999, overflow: 'hidden',
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04) inset',
      }}>
        {palette.map((c, i) => (
          <Box key={i} sx={{
            flex: 1, height: 18, bgcolor: c,
            position: 'relative',
          }}>
            <Box sx={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 800, color: '#fff',
              textShadow: '0 1px 1px rgba(0,0,0,0.3)',
            }}>{i}</Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', mt: 0.75 }}>
        {bands.map((b, i) => (
          <Box key={i} sx={{
            flex: b.flex, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <Typography sx={{
              fontSize: 11, fontWeight: 800, letterSpacing: 0.6,
              color: b.color, textTransform: 'uppercase', lineHeight: 1.1,
            }}>{b.label}</Typography>
            <Typography sx={{
              fontSize: 11, color: C.muted, fontStyle: 'italic', lineHeight: 1.2,
            }}>{b.sub}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/* Pill chip that renders a single named signal (uses the existing
   per-index colour palette so chips here visually match the metric
   cards above). */
function SignalChip({ label }) {
  // Use the metric-name colour if available (matches the section above);
  // fall back to brand purple for the "MNDWI gate" descriptor.
  const base = label.split(' ')[0]
  const bg = INDEX_COLOR[base] || C.brand
  return (
    <Box sx={{
      display: 'inline-block',
      px: 1, py: 0.4, borderRadius: 999,
      fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4,
      color: '#fff', bgcolor: bg,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }}>{label}</Box>
  )
}

/* ---------- per-segment unit: pixel grid + polyline ---------- */
/* --- exact path -> grid sampling -----------------------------------------
   The river polyline below is a chain of three cubic Bezier segments.
   Rather than eyeball which cells the curve crosses (the old hardcoded
   TOUCHED set drifted from the real geometry), we evaluate each segment
   at sub-cell resolution and mark every cell the curve actually enters.
   Computed once at module load; no DOM access, no flicker. */
function _evalCubic(p0, p1, p2, p3, t) {
  const u = 1 - t
  const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0]
  const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
  return [x, y]
}

/* SVG path:
     M 6 220                          start
     C 70 180, 120 110, 180 110       cubic to (180,110)
     S 280 240, 350 170               smooth cubic to (350,170)
     S 410 70, 440 60                 smooth cubic to (440,60)

   Each "S" reuses the reflection of the previous cubic's 2nd control
   point as its 1st control point. */
const _SEG_BEZIERS = [
  { p0: [  6, 220], p1: [ 70, 180], p2: [120, 110], p3: [180, 110] },
  { p0: [180, 110], p1: [240, 110], p2: [280, 240], p3: [350, 170] },
  { p0: [350, 170], p1: [420, 100], p2: [410,  70], p3: [440,  60] },
]

function _computeTouchedCells(cellSize, cols, rows) {
  const cells = new Set()
  // 1000 samples per segment is overkill but cheap and guarantees we
  // never miss a cell at the curve's tighter bends.
  const STEPS = 1000
  for (const s of _SEG_BEZIERS) {
    for (let i = 0; i <= STEPS; i++) {
      const [x, y] = _evalCubic(s.p0, s.p1, s.p2, s.p3, i / STEPS)
      const c = Math.floor(x / cellSize)
      const r = Math.floor(y / cellSize)
      if (c >= 0 && c < cols && r >= 0 && r < rows) cells.add(`${c},${r}`)
    }
  }
  return cells
}

function SegmentCloseup() {
  const COLS = 14, ROWS = 8, CELL = 32
  const W = COLS * CELL, H = ROWS * CELL
  const PATH = 'M 6 220 C 70 180, 120 110, 180 110 S 280 240, 350 170 S 410 70, 440 60'
  const TOUCHED = _computeTouchedCells(CELL, COLS, ROWS)
  return (
    <Box sx={{
      borderRadius: 4, p: 2,
      background: `linear-gradient(160deg, #fff, ${C.tint})`,
      border: `1px solid ${C.border}`,
    }}>
      <Typography sx={{
        fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
        color: C.brand, textTransform: 'uppercase', mb: 1,
      }}>The spatial unit · pixels → segment → 1 value</Typography>
      <Box component="svg" viewBox={`0 0 ${W + 40} ${H + 50}`} sx={{ width: '100%' }}>
        <g transform="translate(20, 30)">
          {/* pixel grid */}
          {Array.from({ length: COLS }).flatMap((_, c) =>
            Array.from({ length: ROWS }).map((__, r) => {
              const hit = TOUCHED.has(`${c},${r}`)
              return (
                <rect key={`${c}-${r}`}
                      x={c * CELL} y={r * CELL}
                      width={CELL} height={CELL}
                      fill={hit ? C.bright : '#fafaff'}
                      stroke={C.border} strokeWidth={0.5}
                      opacity={hit ? 0.38 : 1} />
              )
            })
          )}
          {/* river */}
          <path d={PATH} fill="none" stroke={C.brand}
                strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6" cy="220" r="4" fill={C.brand} />
          <circle cx="440" cy="60" r="4" fill={C.brand} />
          <text x="10" y="-8" fontSize="10" fontWeight="700" fill={C.muted}>
            Sentinel pixels (10 m × 10 m)
          </text>
          <text x={W - 10} y="-8" textAnchor="end" fontSize="10"
                fontWeight="700" fill={C.brand}>1 EU-Hydro segment</text>
        </g>
      </Box>
      <Box sx={{
        mt: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 1,
      }}>
        <Typography sx={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
          Highlighted pixels = the ones the segment overlaps.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12.5, color: C.brand, fontWeight: 800 }}>
            mean(pixels)
          </Typography>
          <Box sx={{ width: 18, height: 2, bgcolor: C.brand }} />
          <Box sx={{
            px: 1.2, py: 0.3,
            background: `linear-gradient(135deg, ${C.brand}, ${C.pop})`,
            color: '#fff', borderRadius: 1,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12, fontWeight: 800,
          }}>NDTI = −0.18</Box>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.5 }}>
        One row lands in the time-series store per (segment, sensor, pass).
      </Typography>
    </Box>
  )
}

/* ---------- Sentinel-1 oil concept: baseline / event / delta ---------- */
function S1Concept() {
  // small deterministic "noise" so re-renders don't flicker
  const NOISE = Array.from({ length: 70 }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453) % 1,
    y: (Math.sin(i * 78.233) * 43758.5453) % 1,
    r: ((Math.sin(i * 3.1416) + 1) / 2) * 1.4 + 0.3,
    o: ((Math.sin(i * 1.732) + 1) / 2) * 0.35 + 0.1,
  })).map(n => ({ ...n, x: Math.abs(n.x), y: Math.abs(n.y) }))
  const W = 520, H = 220, PW = 150, GAP = 20
  const panel = (xOff, label, kind) => (
    <g transform={`translate(${xOff}, 12)`}>
      <defs>
        <linearGradient id={`p${xOff}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f3eeff" />
        </linearGradient>
      </defs>
      <rect width={PW} height={H - 40} rx={8}
            fill={`url(#p${xOff})`} stroke={C.border} strokeWidth={1.2} />
      {/* light speckle - the "SAR" texture, kept subtle so the river/oil read */}
      {NOISE.map((n, i) => (
        <circle key={i} cx={n.x * PW} cy={n.y * (H - 40)} r={n.r}
                fill={C.brand} opacity={n.o * 0.4} />
      ))}
      {/* river ribbon - dark stroke so it stays legible on the light panel */}
      <path d={`M 10 ${H - 70} Q ${PW / 2} ${(H - 70) * 0.55}, ${PW - 10} ${H - 130}`}
            stroke={C.deep} strokeWidth={3.5} fill="none" strokeLinecap="round" />
      {/* the suspicious dark patch sits on the "this pass" panel; the Δ
          panel echoes it in brand-bright so the reader sees what changed */}
      {kind === 'event' && (
        <ellipse cx={PW * 0.58} cy={(H - 40) * 0.55} rx={22} ry={11}
                 fill={C.dark} opacity={0.7} />
      )}
      {kind === 'delta' && (
        <>
          <ellipse cx={PW * 0.58} cy={(H - 40) * 0.55} rx={26} ry={14}
                   fill="none" stroke={C.pop} strokeWidth={2.5}
                   strokeDasharray="4 3" />
          <ellipse cx={PW * 0.58} cy={(H - 40) * 0.55} rx={22} ry={11}
                   fill={C.pop} opacity={0.25} />
          <text x={PW * 0.58} y={(H - 40) * 0.55 + 4} fontSize="10"
                fontWeight="800" fill={C.pop} textAnchor="middle">SLICK</text>
        </>
      )}
      <text x={PW / 2} y={H - 18} fontSize="10.5"
            fontWeight="800" fill={C.deep} textAnchor="middle">{label}</text>
    </g>
  )
  /* Inline labelled row helper - one mono pill on the left, body
     text on the right. Used for the VV/VH primer at the top of the
     card and for the baseline/+drop notes below the equation. */
  const PrimerRow = ({ label, sub, body }) => (
    <Box sx={{
      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.25,
      alignItems: 'baseline',
    }}>
      <Box sx={{
        display: 'inline-flex', alignItems: 'baseline', gap: 0.5,
        px: 0.9, py: 0.3, borderRadius: 999,
        background: '#fff', border: `1px solid ${C.border}`,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12, fontWeight: 800, color: C.deep, whiteSpace: 'nowrap',
      }}>
        {label}
        {sub && (
          <Box component="span" sx={{ fontSize: 10, fontWeight: 700,
                                        color: C.muted, ml: 0.4 }}>
            {sub}
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
        {body}
      </Typography>
    </Box>
  )

  return (
    <Box sx={{
      borderRadius: 4, p: { xs: 2, md: 2.5 }, height: '100%',
      background: `linear-gradient(160deg, #fff, ${C.tint})`,
      border: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', gap: 1.5,
    }}>
      <Typography sx={{
        fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
        color: C.brand, textTransform: 'uppercase',
      }}>Sentinel-1 SAR · how oil pops out</Typography>

      {/* Step 1: what the radar sees - two polarisations. */}
      <Typography sx={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
        The radar sends a <strong>vertical</strong> pulse and listens in
        two polarisations:
      </Typography>
      <PrimerRow
        label="VV" sub="co-pol"
        body="vertical → vertical. Loud on smooth water; drops sharply under oil." />
      <PrimerRow
        label="VH" sub="cross-pol"
        body="vertical → horizontal. Quieter; if both VV and VH drop, the signal is stronger." />

      {/* Step 2: the comparison - baseline vs event vs delta. */}
      <Typography sx={{ fontSize: 13, color: C.ink, lineHeight: 1.55, mt: 0.25 }}>
        Each pass is compared to a multi-year same-month baseline:
      </Typography>
      <Box component="svg" viewBox={`0 0 ${W} ${H}`} sx={{ width: '100%' }}>
        {panel(0,                'baseline (3-yr median)', null)}
        {panel(PW + GAP,         'this pass',              'event')}
        {panel(2 * (PW + GAP),   'Δ darkening (dB)',       'delta')}
        {/* arrows between */}
        {[1, 2].map(i => {
          const xx = i * (PW + GAP) - GAP / 2
          return (
            <g key={i}>
              <path d={`M ${xx - 6} ${(H - 40) / 2 + 12} L ${xx + 6} ${(H - 40) / 2 + 12}`}
                    stroke={C.muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
            </g>
          )
        })}
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10"
                  refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L6,3 z" fill={C.muted} />
          </marker>
        </defs>
      </Box>

      {/* Step 3: the anomaly equation - drop = baseline - this pass. */}
      <Typography sx={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
        The anomaly per polarisation, in dB, is what feeds the score:
      </Typography>
      <Box sx={{
        p: 1.25, borderRadius: 2, alignSelf: 'stretch',
        background: '#fff', border: `1px solid ${C.border}`,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13, color: C.deep, lineHeight: 1.4,
        textAlign: 'center',
      }}>
        VV_drop = baseline_VV − this_pass_VV&nbsp; (dB)
      </Box>
      <Typography sx={{ fontSize: 12, color: C.muted,
                          mt: 'auto', fontStyle: 'italic', lineHeight: 1.5 }}>
        Without the drop, the metric would just ask "is this water dark?" -
        which fires on every calm pond. The drop asks "darker than usual?".
      </Typography>
    </Box>
  )
}

/* The VV/VH primer, baseline-vs-event animation and drop equation are
   now all inside S1Concept above (one tall left-column card). The
   previous standalone <S1PolarizationPrimer />, <_PrimerRow /> and
   <_PolarisationDiagram /> helpers were removed in that consolidation. */


/* ---------- the page itself ---------- */
export default function PipelinePage({ onGoToLanding, onGoToMap, onGoToNewsletter,
                                       onGoToCampaigns, onGoToAbout, onGoToLogin,
                                       onGoToRegister, user, onLogout }) {
  const [stats, setStats] = useState(null)
  useEffect(() => { fetchPipelineStats().then(setStats) }, [])

  /* The map view locks <html>/<body> overflow to keep its 100vh layout from
     scrolling; that lock persists when you navigate here via setState. Same
     pattern LandingPage uses - restore scrolling on mount, put it back on
     unmount so the map keeps its full-viewport look. */
  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  return (
    <Box sx={{ minHeight: '100vh', background: C.tint }}>
      <SiteNav
        current="pipeline"
        onGoToHome={onGoToLanding}
        onGoToMap={onGoToMap}
        onGoToCampaigns={onGoToCampaigns}
        onGoToNewsletter={onGoToNewsletter}
        onGoToAbout={onGoToAbout}
        onGoToLogin={onGoToLogin}
        onGoToRegister={onGoToRegister}
        user={user}
        onLogout={onLogout}
      />

      <Hero onGoToMap={onGoToMap} />
      <Stats stats={stats} />

      {/* The horizontal FlowDiagram that used to sit here is now the
          vertical PipelineFlowSection at the end of the page - one
          single architecture summary instead of two. */}

      {/* === What we measure: bands, indices, risk traffic light === */}
      <Container maxWidth="lg" sx={{ mt: 6, mb: 6 }}>
        <Reveal>
          <Typography sx={{ fontSize: 13, fontWeight: 800, letterSpacing: 2,
                             color: C.brand, mb: 1, textTransform: 'uppercase' }}>
            What we measure
          </Typography>
          <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 800,
                             color: C.ink, mb: 1, letterSpacing: -0.5 }}>
            What we read from every pass.
          </Typography>
          <Typography sx={{ color: C.muted, fontSize: 15, maxWidth: 760, mb: 1 }}>
            Per river segment, per pass - the bands we look at, the indices we
            derive from them, and how they roll up into a single HIGH/MEDIUM/LOW
            risk.
          </Typography>
        </Reveal>
        <MetricsSection />
      </Container>

      {/* The "per-segment closeup" section that used to live here is now
          consolidated into the Spatial unit · EU-Hydro subsection of
          <MetricsSection />, between the S2 metric grid and the
          Pollution+Risk subsection.

          The standalone Sentinel-1 explainer that used to follow is
          likewise inside <MetricsSection /> now (SAR subsection). */}

      {/* End-of-page summary: the vertical 4-stage pipeline animation
          on one side + a one-sentence caption per stage on the other.
          Replaced the four verbose Stage cards that used to live here. */}
      <PipelineFlowSection />

      <Extensibility />
      <Resilience />

      {/* footer CTA */}
      <Box sx={{
        py: 7,
        background: `linear-gradient(160deg, ${C.dark} 0%, ${C.deep} 60%, ${C.brand} 100%)`,
        color: '#fff', textAlign: 'center',
      }}>
        <Container maxWidth="md">
          <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 800, letterSpacing: -0.5 }}>
            Now go see it on the map.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.8)', mt: 1, mb: 3, fontSize: 15 }}>
            The numbers above are live. The pipeline keeps filling in - every
            satellite pass adds another point to every river's trend.
          </Typography>
          <Button onClick={onGoToMap} startIcon={<MapIcon />} variant="contained"
            sx={{
              textTransform: 'none', fontWeight: 700, px: 3, py: 1.2, borderRadius: 999,
              background: `linear-gradient(135deg, ${C.pop} 0%, ${C.glow} 100%)`,
              color: C.dark,
              boxShadow: '0 10px 28px rgba(224,170,255,0.35)',
              '&:hover': { background: `linear-gradient(135deg, ${C.glow} 0%, ${C.pop} 100%)` },
            }}>Open the live map</Button>
        </Container>
      </Box>
    </Box>
  )
}
