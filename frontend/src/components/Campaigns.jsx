import { useState, useEffect } from 'react'
import {
  Box, Typography, Button,
  CircularProgress, Alert, Fab, Snackbar, IconButton
} from '@mui/material'
import AppNavBar from './AppNavBar'
import HomeIcon from '@mui/icons-material/Home'
import MapIcon from '@mui/icons-material/Map'
import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import AddIcon from '@mui/icons-material/Add'
import WaterIcon from '@mui/icons-material/Water'
import GroupsIcon from '@mui/icons-material/Groups'
import FavoriteIcon from '@mui/icons-material/Favorite'
import axios from 'axios'
import CampaniiForm from './CampaignsForm.jsx'
import { API_BASE } from '../utils'

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


const FALLBACK_CAMPAIGNS = [
  { id: 1, campaign_name: 'Curățăm Dunărea 2025', organization_name: 'EcoRomania NGO', river_name: 'Dunărea', coordinates: '45.6,29.6', start_date: '2025-06-01', end_date: '2025-06-30', likes: 142, participants: [] },
  { id: 2, campaign_name: 'Salvăm Mureșul', organization_name: 'Green Future', river_name: 'Mureș', coordinates: '46.2,23.8', start_date: '2025-07-15', end_date: '2025-08-15', likes: 87, participants: [] },
  { id: 3, campaign_name: 'Protejăm Oltul', organization_name: 'AquaClean', river_name: 'Olt', coordinates: '45.3,24.5', start_date: '2025-05-20', end_date: '2025-06-20', likes: 63, participants: [] },
  { id: 4, campaign_name: 'Argeșul Curat', organization_name: 'Voluntari pentru Natură', river_name: 'Argeș', coordinates: '44.9,25.1', start_date: '2025-08-01', end_date: '2025-09-01', likes: 38, participants: [] },
]

export default function Campaigns({ onBack, onGoToHome, onGoToMap, onGoToLogin, onGoToNewsletter, user, onLogout }) {
  const [view, setView] = useState('list')
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snackbar, setSnackbar] = useState({ open: false, message: '' })
  const [participating, setParticipating] = useState({})
  const [likes, setLikes] = useState({})
  const [likedCampaigns, setLikedCampaigns] = useState({})

  useEffect(() => { fetchCampaigns() }, [])

  async function fetchCampaigns() {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${API_BASE}/campaigns`)
      const data = res.data.campaigns || res.data || []
      setCampaigns(data)
      const initialLikes = {}
      data.forEach(c => { initialLikes[c.id] = c.likes })
      setLikes(initialLikes)
    } catch (err) {
      console.error(err)
      setCampaigns(FALLBACK_CAMPAIGNS)
      const initialLikes = {}
      FALLBACK_CAMPAIGNS.forEach(c => { initialLikes[c.id] = c.likes })
      setLikes(initialLikes)
    } finally {
      setLoading(false)
    }
  }

  async function handleParticipate(campaign) {
    if (!user) { onGoToLogin && onGoToLogin(); return }
    setParticipating(p => ({ ...p, [campaign.id]: true }))
    try {
      await axios.post(`${API_BASE}/campaigns/${campaign.id}/participate`, { email: user.email },
        { headers: { Authorization: `Bearer ${localStorage.getItem('aq_token')}` } })
      setSnackbar({ open: true, message: 'Successfully joined the campaign!' })
      fetchCampaigns()
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error joining campaign.' })
    } finally {
      setParticipating(p => ({ ...p, [campaign.id]: false }))
    }
  }

  async function handleLike(campaign) {
    const alreadyLiked = likedCampaigns[campaign.id]
    try {
      const endpoint = alreadyLiked ? 'unlike' : 'like'
      const res = await axios.post(`${API_BASE}/campaigns/${campaign.id}/${endpoint}`)
      setLikes(l => ({ ...l, [campaign.id]: res.data.likes }))
      setLikedCampaigns(l => ({ ...l, [campaign.id]: !alreadyLiked }))
    } catch (err) { console.error(err) }
  }

  async function handleFormSubmit(payload) {
    await axios.post(`${API_BASE}/campaigns`, payload,
      { headers: { Authorization: `Bearer ${localStorage.getItem('aq_token')}` } })
  }

  const handleBackToList = () => { fetchCampaigns(); setView('list') }
  const isParticipant = (campaign) => user && campaign.participants?.includes(user.email)

  const handleMapClick = () => {
    if (user) onGoToMap()
    else onGoToLogin()
  }

  // Navbar comuna
  const navSx = { background: `linear-gradient(90deg, ${C.darkest} 0%, ${C.dark2} 60%, ${C.mid1} 100%)` }
  const NavBar = ({ currentPage = 'campaigns', onBack: handleBack }) => (
    currentPage === 'add' ? (
      <AppNavBar sx={navSx} backAction={{ label: 'Back to Campaigns', onClick: handleBack }} />
    ) : (
      <AppNavBar
        sx={navSx}
        links={[
          { label: 'Home', icon: <HomeIcon />, onClick: onGoToHome ?? onBack },
          { label: 'Map', icon: <MapIcon />, onClick: handleMapClick },
          { label: 'Newsletter', icon: <EmailIcon />, onClick: onGoToNewsletter },
          { label: 'Campaigns', icon: <CampaignIcon />, onClick: () => {}, active: true },
        ]}
        user={user}
        onLogout={onLogout}
      />
    )
  )

  if (view === 'add') {
    return (
      <Box sx={{ height: '100vh', overflowY: 'auto', bgcolor: '#fafafa' }}>
        <NavBar currentPage="add" onBack={handleBackToList} />
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, py: 4 }}>
          <CampaniiForm user={user} onSubmit={handleFormSubmit} onCancel={handleBackToList} />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#ffffff', overflowY: 'auto' }}>
      <NavBar currentPage="list" />

      <Box sx={{ flex: 1, px: { xs: 2, md: 6 }, py: 5, maxWidth: 1200, mx: 'auto', width: '100%' }}>
        <Box sx={{ mb: 5, textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: C.mid2, letterSpacing: '-0.5px', mb: 1 }}>
            Water Cleanup Campaigns
          </Typography>
          <Typography sx={{ color: C.mid3, opacity: 0.8, fontSize: '0.95rem' }}>
            Join a campaign and help protect Romania's rivers
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 8 }}>
            <CircularProgress sx={{ color: C.mid3 }} size={48} />
            <Typography sx={{ color: C.mid3 }}>Loading campaigns...</Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ bgcolor: `${C.dark2}cc`, color: C.lightest, border: `1px solid ${C.mid1}` }}
            action={<Button size="small" sx={{ color: C.lightest }} onClick={fetchCampaigns}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {!loading && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {campaigns.map((campaign, i) => (
              <Box key={campaign.id || i} sx={{
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
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.4 }}>
                        {campaign.campaign_name || campaign.campaignName}
                      </Typography>
                      <Typography sx={{ color: C.light1, fontSize: '0.72rem', fontWeight: 600, mt: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {campaign.organization_name || campaign.organizationName}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ bgcolor: '#fff', px: 3, py: 2.5 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <WaterIcon sx={{ fontSize: 16, color: C.mid1 }} />
                      <Typography sx={{ fontSize: '0.85rem', color: C.dark2, fontWeight: 600 }}>
                        {campaign.river_name || campaign.riverName}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <GroupsIcon sx={{ fontSize: 16, color: C.mid1 }} />
                      <Typography sx={{ fontSize: '0.85rem', color: C.dark2 }}>
                        {campaign.participants?.length || 0} participants
                      </Typography>
                    </Box>
                  </Box>

                  <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mb: 2 }}>
                    📅 {campaign.start_date || campaign.startDate} → {campaign.end_date || campaign.endDate}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Button
                      onClick={() => handleParticipate(campaign)}
                      disabled={participating[campaign.id] || isParticipant(campaign)}
                      size="small" variant="contained"
                      startIcon={<GroupsIcon sx={{ fontSize: '0.85rem !important' }} />}
                      sx={{
                        bgcolor: isParticipant(campaign) ? '#e2e8f0' : C.dark2,
                        color: isParticipant(campaign) ? C.mid1 : '#fff',
                        fontWeight: 600, fontSize: '0.8rem', px: 2, py: 0.8, borderRadius: 2,
                        textTransform: 'none', boxShadow: 'none',
                        '&:hover': { bgcolor: isParticipant(campaign) ? '#e2e8f0' : C.mid1, boxShadow: 'none' },
                        '&:disabled': { bgcolor: '#e2e8f0', color: C.mid1 },
                      }}
                    >
                      {isParticipant(campaign) ? '✓ Joined' : participating[campaign.id] ? 'Processing...' : 'Participate'}
                    </Button>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <IconButton onClick={() => handleLike(campaign)} size="small"
                        sx={{ color: likedCampaigns[campaign.id] ? '#e91e63' : C.mid2, '&:hover': { color: '#e91e63', bgcolor: 'rgba(233,30,99,0.08)' }, transition: 'color 0.2s' }}>
                        <FavoriteIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                      <Typography sx={{ fontSize: '0.85rem', color: C.mid1, fontWeight: 600 }}>
                        {likes[campaign.id] ?? campaign.likes}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Fab onClick={() => setView('add')} sx={{ position: 'fixed', bottom: 32, right: 32, bgcolor: C.mid2, color: '#fff', '&:hover': { bgcolor: C.mid1 }, boxShadow: '0 4px 20px rgba(123,44,191,0.4)' }}>
        <AddIcon />
      </Fab>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        message={snackbar.message} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}