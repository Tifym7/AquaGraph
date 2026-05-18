import { useState, useEffect } from 'react'
import {
  Box, AppBar, Toolbar, Typography, Button,
  CircularProgress, Alert, Avatar
} from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import HomeIcon from '@mui/icons-material/Home'
import MapIcon from '@mui/icons-material/Map'
import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { fetchNews } from '../utils.js'

const C = {
  darkest:  '#10002b',
  dark1:    '#240046',
  dark2:    '#3c096c',
  mid1:     '#5a189a',
  mid2:     '#7b2cbf',
  mid3:     '#9d4edd',
  light1:   '#c77dff',
  lightest: '#e0aaff',
}

const NAV_BTN = {
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.25)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
  px: 1.5,
}

export default function Newsletter({ onBack, onGoToHome, onGoToMap, onGoToLogin, onGoToCampaigns, user, onLogout }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchWaterPollutionNews() }, [])

  async function fetchWaterPollutionNews() {
    setLoading(true)
    setError(null)
    try {
      const articles = await fetchNews()
      if (articles.length === 0) throw new Error('No articles')
      setArticles(articles)
    } catch (err) {
      console.error(err)
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleMapClick = () => {
    if (user) onGoToMap()
    else onGoToLogin()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#ffffff', overflowY: 'auto' }}>

      <AppBar position="sticky" elevation={0} sx={{
        background: `linear-gradient(90deg, ${C.darkest} 0%, ${C.dark2} 60%, ${C.mid1} 100%)`,
        boxShadow: '0 2px 12px rgba(109,40,217,0.35)',
      }}>
        <Toolbar sx={{ gap: 1.5, minHeight: '95px !important' }}>
          <SatelliteAltIcon sx={{ fontSize: 28 }} />
          <Box sx={{ flexGrow: 0, mr: 2 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2, letterSpacing: '-0.3px', color: '#fff' }}>AquaGraph</Typography>
            <Typography variant="caption" sx={{ opacity: 0.7, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#fff' }}>
              Satellite Water Pollution Monitor
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Button startIcon={<HomeIcon />} size="small" onClick={onGoToHome ?? onBack} sx={NAV_BTN}>Home</Button>
          <Button startIcon={<MapIcon />} size="small" onClick={handleMapClick} sx={NAV_BTN}>Map</Button>
          <Button startIcon={<CampaignIcon />} size="small" onClick={onGoToCampaigns} sx={NAV_BTN}>Campaigns</Button>

          {/* Newsletter — evidențiat ca pagina curentă */}
          <Button startIcon={<EmailIcon />} size="small" sx={{
            color: C.lightest, border: `1px solid ${C.light1}`,
            bgcolor: 'rgba(199,125,255,0.15)',
            '&:hover': { bgcolor: 'rgba(199,125,255,0.25)' }, px: 1.5,
          }}>
            Newsletter
          </Button>

          {user && (
            <Avatar onClick={onLogout} title="Logout"
              sx={{ width: 34, height: 34, bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.4)', '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' } }}>
              {user.username?.[0]?.toUpperCase() || 'U'}
            </Avatar>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, px: { xs: 2, md: 6 }, py: 5, maxWidth: 1200, mx: 'auto', width: '100%' }}>
        <Box sx={{ mb: 5, textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: C.mid2, letterSpacing: '-0.5px', mb: 1 }}>
            Water Pollution News
          </Typography>
          <Typography sx={{ color: C.mid3, opacity: 0.8, fontSize: '0.95rem' }}>
            Latest articles from trusted sources
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 8 }}>
            <CircularProgress sx={{ color: C.mid3 }} size={48} />
            <Typography sx={{ color: C.mid1 }}>Loading...</Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error"
            sx={{ bgcolor: `${C.dark2}cc`, color: C.lightest, border: `1px solid ${C.mid1}` }}
            action={<Button size="small" sx={{ color: C.lightest }} onClick={fetchWaterPollutionNews}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {articles.map((article, i) => (
              <Box key={i} sx={{
                borderRadius: 3, overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(16,0,43,0.5)',
                border: `1px solid ${C.mid1}55`,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 32px rgba(157,78,221,0.3)' },
              }}>
                <Box sx={{ bgcolor: C.dark2, px: 3, py: 2.5, borderBottom: `2px solid ${C.mid1}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box sx={{ minWidth: 28, height: 28, borderRadius: '50%', bgcolor: C.mid2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', mt: 0.2 }}>
                      {i + 1}
                    </Box>
                    <Box>
                      <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.4 }}>{article.title}</Typography>
                      <Typography sx={{ color: C.light1, fontSize: '0.72rem', fontWeight: 600, mt: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{article.source}</Typography>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ bgcolor: '#fff', px: 3, py: 2.5 }}>
                  {article.summary && (
                    <Typography sx={{ color: '#3c096c', fontSize: '0.9rem', lineHeight: 1.6, mb: 2 }}>{article.summary}</Typography>
                  )}
                  <Button href={article.url} target="_blank" rel="noopener noreferrer"
                    endIcon={<OpenInNewIcon sx={{ fontSize: '0.85rem !important' }} />}
                    size="small"
                    sx={{ bgcolor: C.dark2, color: '#fff', fontWeight: 600, fontSize: '0.8rem', px: 2, py: 0.8, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: C.mid1 } }}>
                    Read Article
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}