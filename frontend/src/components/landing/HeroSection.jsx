import { Box, Typography } from '@mui/material'
import image from '../../assets/danube.jpg'


export default function HeroSection() {
  return (
    <Box sx={{
      position: 'relative',
      height: '55vh',
      minHeight: 360,
      maxHeight: 520,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Imaginea animata zoom-in/zoom-out */}
      <Box sx={{
        position: 'absolute',
        inset: '-10%',
        backgroundImage: `url(${image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        animation: 'heroZoom 12s ease-in-out infinite alternate',
        willChange: 'transform',
        '@keyframes heroZoom': {
          from: { transform: 'scale(1.0)' },
          to:   { transform: 'scale(1.12)' },
        },
      }} />

      {/* Overlay violet */}
      <Box sx={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(
          160deg,
          rgba(16,0,43,0.72) 0%,
          rgba(60,9,108,0.55) 50%,
          rgba(16,0,43,0.65) 100%
        )`,
      }} />

      {/* Titlu centrat */}
      <Box sx={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
        px: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
      }}>
        <Typography variant="h1" sx={{
          fontWeight: 800,
          color: '#fff',
          fontSize: { xs: '2.8rem', sm: '3.5rem', md: '5rem' },
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
          textShadow: '0 2px 40px rgba(0,0,0,0.4)',
        }}>
          AquaGraph
        </Typography>

        <Typography sx={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: { xs: '0.95rem', md: '1.15rem' },
          fontWeight: 400,
          letterSpacing: '0.01em',
          textShadow: '0 1px 12px rgba(0,0,0,0.5)',
          maxWidth: 520,
        }}>
          The Web App for Water Quality Information
        </Typography>
      </Box>

      {/* Sageata scroll */}
      <Box sx={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        zIndex: 2,
      }}>
        {/* Sageata SVG, animatie CSS */}
        <Box
          component="svg"
          viewBox="0 0 24 24"
          sx={{
            width: 32, height: 32,
            fill: 'none',
            stroke: 'rgba(255,255,255,0.6)',
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            animation: 'bobDown 1.6s ease-in-out infinite',
            '@keyframes bobDown': {
              '0%':   { transform: 'translateY(0px)',  opacity: 0.6 },
              '50%':  { transform: 'translateY(7px)',  opacity: 1   },
              '100%': { transform: 'translateY(0px)',  opacity: 0.6 },
            },
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </Box>
      </Box>
    </Box>
  )
}