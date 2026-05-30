import LinkedInIcon from '@mui/icons-material/LinkedIn'
import GitHubIcon from '@mui/icons-material/GitHub'
import PublicIcon from '@mui/icons-material/Public'
import ScienceIcon from '@mui/icons-material/Science'
import HandshakeIcon from '@mui/icons-material/Handshake'
import BoltIcon from '@mui/icons-material/Bolt'
import LandingFooter from './landing/LandingFooter'
import SiteNav from './SiteNav'
import { Box, Typography, IconButton } from '@mui/material'
import { useState, useEffect } from 'react'
import photo1 from '../assets/photo1.JPG'
import photo2 from '../assets/photo2.JPG'
import photo3 from '../assets/photo3.JPG'
import photo4 from '../assets/photo4.JPG'

const PHOTOS = [photo1, photo2, photo3, photo4]

const C = {
  darkest: '#10002b',
  dark1:   '#240046',
  dark2:   '#3c096c',
  mid1:    '#5a189a',
  mid2:    '#7b2cbf',
  mid3:    '#9d4edd',
  lightest:'#e0aaff',
}


function Carousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 2) % PHOTOS.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  const visible = [PHOTOS[index], PHOTOS[(index + 1) % PHOTOS.length]]

  return (
    <Box>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2,
        mb: 2,
      }}>
        {visible.map((photo, i) => (
          <Box
              key={`${index}-${i}`}
              component="img"
              src={photo}
              sx={{
            width: '100%',
            height: { xs: 180, md: 240 },
            borderRadius: 3,
            objectFit: 'cover',
            objectPosition: 'center',
            animation: 'fadeIn 0.5s ease',
            '@keyframes fadeIn': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}>
          </Box>
        ))}
      </Box>

      {/* Dots */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
        {Array.from({ length: PHOTOS.length / 2 }).map((_, i) => (
          <Box
            key={i}
            onClick={() => setIndex(i * 2)}
            sx={{
              width: i === index / 2 ? 20 : 8,
              height: 8,
              borderRadius: 4,
              background: i === index / 2 ? C.mid2 : 'rgba(122,44,191,0.2)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </Box>
      </Box>
  )
}


const LINKEDIN_URL = 'https://www.linkedin.com/company/aquagraph'
const GITHUB_URL   = 'https://github.com/Tifym7/AquaGraph'

const TIMELINE = [
  {
    date: 'Spring 2026',
    label: 'Cassini Hackathon: Space for Water',
    text: 'AquaGraph was born during the EU-funded Cassini Hackathon, a pan-European challenge across 11 countries focused on space data for environmental good. Competing in the "Space for Water" track, the team built a working prototype in 48 hours (satellite ingestion, geospatial processing, interactive map) and placed 3rd in Romania.',
    accent: C.mid3,
  },
  {
    date: 'Post-hackathon',
    label: 'Joining Momentum',
    text: 'After the hackathon we kept going. AquaGraph joined Momentum, a startup accelerator and innovation hub, to develop the platform further: expanding coverage, refining the processing pipeline, and building the community features that make it more than just a map.',
    accent: C.mid2,
  },
  {
    date: 'Today',
    label: 'Open to everyone',
    text: 'The platform is publicly accessible, no login required to explore the map. We believe environmental data should be a public good, and we\'re continuing to add features, improve accuracy, and grow the community around clean water in Romania.',
    accent: C.mid1,
  },
]

const VALUES = [
  { icon: PublicIcon,    title: 'Open by default',   text: 'Satellite data is funded by European taxpayers. We think the insights built on it should be freely accessible too.' },
  { icon: ScienceIcon,   title: 'Science-first',     text: 'Every metric on the map (NDWI, NDCI, turbidity, oil risk) is grounded in published remote sensing methodology.' },
  { icon: HandshakeIcon, title: 'Community-driven',  text: 'Ground truth matters. Citizens, researchers, and local officials all have a role to play alongside the satellite.' },
  { icon: BoltIcon,      title: 'Built to scale',    text: 'The pipeline is designed to expand: more rivers, more metrics, more countries, as we grow.' },
]

export default function AboutPage({ onGoToHome, onGoToMap, onGoToPipeline, onGoToNewsletter, onGoToCampaigns, onGoToLogin, onGoToRegister, user, onLogout }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
      <SiteNav
        current="about"
        onGoToHome={onGoToHome}
        onGoToMap={onGoToMap}
        onGoToPipeline={onGoToPipeline}
        onGoToCampaigns={onGoToCampaigns}
        onGoToNewsletter={onGoToNewsletter}
        onGoToLogin={onGoToLogin}
        onGoToRegister={onGoToRegister}
        user={user}
        onLogout={onLogout}
      />

      {/* ── Hero ── */}
      <Box sx={{
        background: `linear-gradient(160deg, ${C.darkest} 0%, ${C.dark1} 50%, ${C.dark2} 100%)`,
        px: { xs: 2.5, md: 8 },
        pt: { xs: 8, md: 11 },
        pb: { xs: 6, md: 8 },
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          bottom: '-10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '60%',
          background: 'radial-gradient(ellipse, rgba(157,78,221,0.22) 0%, transparent 70%)',
          pointerEvents: 'none',
        },
      }}>
        <Box sx={{ maxWidth: 720, mx: 'auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <Typography sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: C.lightest,
            opacity: 0.7,
            mb: 2,
          }}>
            About us
          </Typography>
          <Typography variant="h2" sx={{
            fontWeight: 900,
            fontSize: { xs: '2.2rem', md: '3.2rem' },
            color: '#fff',
            lineHeight: 1.1,
            letterSpacing: '-0.04em',
            mb: 2.5,
          }}>
            We started with a hackathon.<br />We didn't stop.
          </Typography>
          <Typography sx={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: { xs: '1rem', md: '1.1rem' },
            lineHeight: 1.8,
            maxWidth: 540,
            mx: 'auto',
          }}>
            AquaGraph is a satellite-powered water quality platform built for Romania's rivers, open and designed for everyone.
          </Typography>
        </Box>
      </Box>

      {/* ── Origin story / Timeline ── */}
      <Box sx={{
        background: 'linear-gradient(175deg, #faf5ff 0%, #f3e8ff 60%, #fff 100%)',
        px: { xs: 2.5, md: 8 },
        py: { xs: 6, md: 9 },
      }}>
        <Box sx={{ maxWidth: 900, mx: 'auto' }}>
          <Typography sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: C.mid2,
            mb: 1.5,
          }}>
            Our story
          </Typography>
          <Typography variant="h3" sx={{
            fontWeight: 800,
            fontSize: { xs: '1.8rem', md: '2.4rem' },
            color: C.darkest,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            mb: 5,
            maxWidth: 560,
          }}>
            From a 48-hour sprint to a real platform
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {TIMELINE.map((item, i) => (
              <Box key={item.label} sx={{ display: 'flex', gap: { xs: 2, md: 4 }, mb: i < TIMELINE.length - 1 ? 0 : 0 }}>
                {/* Timeline spine */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32, pt: 0.5 }}>
                  <Box sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: item.accent,
                    border: `3px solid ${item.accent}`,
                    boxShadow: `0 0 0 4px ${item.accent}22`,
                    flexShrink: 0,
                  }} />
                  {i < TIMELINE.length - 1 && (
                    <Box sx={{ width: 2, flex: 1, background: `linear-gradient(${item.accent}, ${TIMELINE[i+1].accent})`, opacity: 0.3, mt: 0.5, mb: 0.5 }} />
                  )}
                </Box>
                {/* Content */}
                <Box sx={{ pb: i < TIMELINE.length - 1 ? 4 : 0 }}>
                  <Typography sx={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: item.accent,
                    mb: 0.5,
                  }}>
                    {item.date}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: C.darkest, mb: 1 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.93rem', lineHeight: 1.75, maxWidth: 800 }}>
                    {item.text}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Values ── */}
      <Box sx={{
        background: '#fff',
        px: { xs: 2.5, md: 8 },
        py: { xs: 6, md: 9 },
        borderTop: '1px solid rgba(122,44,191,0.08)',
      }}>
        <Box sx={{ maxWidth: 900, mx: 'auto' }}>
          <Typography sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: C.mid2,
            mb: 1.5,
          }}>
            What we believe
          </Typography>
          <Typography variant="h3" sx={{
            fontWeight: 800,
            fontSize: { xs: '1.8rem', md: '2.4rem' },
            color: C.darkest,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            mb: 5,
          }}>
            Our principles
          </Typography>

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 3,
          }}>
            {VALUES.map((v) => {
              const Icon = v.icon
              return (
                <Box key={v.title} sx={{
                  border: '1.5px solid rgba(122,44,191,0.12)',
                  borderRadius: 3,
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                  '&:hover': {
                    boxShadow: '0 6px 28px rgba(90,24,154,0.1)',
                    borderColor: 'rgba(122,44,191,0.3)',
                  },
                }}>
                  <Box sx={{
                    width: 44, height: 44, mb: 1.75,
                    borderRadius: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${C.mid1} 0%, ${C.mid2} 100%)`,
                  }}>
                    <Icon sx={{ fontSize: 24, color: '#fff' }} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, color: C.darkest, fontSize: '1rem', mb: 0.75 }}>
                    {v.title}
                  </Typography>
                  <Typography sx={{ color: '#666', fontSize: '0.9rem', lineHeight: 1.7 }}>
                    {v.text}
                  </Typography>
                </Box>
              )
            })}
            </Box>
        </Box>
      </Box>

      {/* ── Team ── */}
      <Box sx={{
        background: 'linear-gradient(175deg, #faf5ff 0%, #f3e8ff 60%, #fff 100%)',
        px: { xs: 2.5, md: 8 },
        py: { xs: 6, md: 9 },
        borderTop: '1px solid rgba(122,44,191,0.08)',
      }}>
        <Box sx={{ maxWidth: 900, mx: 'auto' }}>
          <Typography sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: C.mid2,
            mb: 1.5,
          }}>
            The team
          </Typography>
          <Typography variant="h3" sx={{
            fontWeight: 800,
            fontSize: { xs: '1.8rem', md: '2.4rem' },
            color: C.darkest,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            mb: 2,
            maxWidth: 560,
          }}>
            Built by students, driven by purpose
          </Typography>
          <Typography sx={{ color: '#555', fontSize: '1rem', lineHeight: 1.8, mb: 5, maxWidth: 900 }}>
            We met at the Cassini Hackathon in Spring 2026, a group of students from UBB and UTCN in Cluj-Napoca, brought together by a shared interest in satellite technology and environmental data. What started as a 48-hour sprint turned into something we couldn't put down.
          </Typography>

          <Carousel />

        </Box>
      </Box>

      {/* ── CTA strip ── */}
      <Box sx={{
        background: `linear-gradient(160deg, ${C.darkest} 0%, ${C.dark1} 40%, ${C.dark2} 100%)`,
        px: { xs: 2.5, md: 5 },
        py: { xs: 5, md: 7 },
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 50% 60% at 50% 100%, rgba(157,78,221,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        },
      }}>
        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 520, mx: 'auto' }}>
          <Typography variant="h4" sx={{
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            mb: 1.5,
            fontSize: { xs: '1.7rem', md: '2rem' },
          }}>
            Find us online
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', lineHeight: 1.7, mb: 3 }}>
            Follow the project on LinkedIn or explore the source code on GitHub.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <IconButton
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                border: '1px solid rgba(199,125,255,0.35)',
                bgcolor: 'rgba(199,125,255,0.1)',
                borderRadius: 1,
                px: 2, py: 1,
                gap: 0.75,
                display: 'flex',
                alignItems: 'center',
                color: C.lightest,
                '&:hover': { bgcolor: 'rgba(199,125,255,0.2)' },
              }}
            >
              <GitHubIcon sx={{ fontSize: 20 }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: C.lightest }}>GitHub</Typography>
            </IconButton>
            <IconButton
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                border: '1px solid rgba(199,125,255,0.35)',
                bgcolor: 'rgba(199,125,255,0.1)',
                borderRadius: 1,
                px: 2, py: 1,
                gap: 0.75,
                display: 'flex',
                alignItems: 'center',
                color: C.lightest,
                '&:hover': { bgcolor: 'rgba(199,125,255,0.2)' },
              }}
            >
              <LinkedInIcon sx={{ fontSize: 20 }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: C.lightest }}>LinkedIn</Typography>
            </IconButton>
          </Box>
        </Box>
      </Box>

      <LandingFooter
        onGoToMap={onGoToMap}
        onGoToCampaigns={onGoToCampaigns}
        onGoToNewsletter={onGoToNewsletter}
      />
    </Box>
  )
}