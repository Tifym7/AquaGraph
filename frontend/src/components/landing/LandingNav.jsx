import { AppBar, Toolbar, Box, Typography, Button, Avatar } from '@mui/material'
import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import MapIcon from '@mui/icons-material/Map'
import LoginIcon from '@mui/icons-material/Login'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import logoImg from '../../assets/logo.jpeg'

const NAV_BTN = {
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.25)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
  px: 1.5,
}

const AUTH_BTN = {
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.5)',
  bgcolor: 'rgba(255,255,255,0.08)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.7)' },
  px: 1.5,
}

export default function LandingNav({ onGoToMap, onGoToLogin, onGoToRegister, onGoToNewsletter, onGoToCampaigns, onGoToAbout, user, onLogout }) {
  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ gap: 1.5, minHeight: '95px !important' }}>
        <Box component="img" src={logoImg} alt="AquaGraph logo"
          sx={{ height: 50, width: 50, flexShrink: 0 }} />
        <Box sx={{ flexGrow: 0, mr: 2 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2, letterSpacing: '-0.3px' }}>AquaGraph</Typography>
          <Typography variant="caption" sx={{ opacity: 0.75, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Satellite Water Pollution Monitor
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Button startIcon={<MapIcon />} size="small" onClick={onGoToMap} sx={NAV_BTN}>Map</Button>
        <Button startIcon={<CampaignIcon />} size="small" onClick={onGoToCampaigns} sx={NAV_BTN}>Campaigns</Button>
        <Button startIcon={<EmailIcon />} size="small" onClick={onGoToNewsletter} sx={NAV_BTN}>Newsletter</Button>
        <Button startIcon={<InfoOutlinedIcon />} size="small" onClick={onGoToAbout} sx={NAV_BTN}>About</Button>

        <Box sx={{ width: '1px', height: 28, bgcolor: 'rgba(255,255,255,0.2)', mx: 0.5 }} />

        {user ? (
          <Avatar
            onClick={onLogout}
            title="Logout"
            sx={{
              width: 34, height: 34,
              bgcolor: 'rgba(255,255,255,0.25)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              border: '2px solid rgba(255,255,255,0.4)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
            }}
          >
            {user.username?.[0]?.toUpperCase() || 'U'}
          </Avatar>
        ) : (
          <>
            <Button startIcon={<LoginIcon />} size="small" onClick={onGoToLogin} sx={AUTH_BTN}>Login</Button>
            <Button startIcon={<PersonAddIcon />} size="small" onClick={onGoToRegister} sx={AUTH_BTN}>Register</Button>
          </>
        )}
      </Toolbar>
    </AppBar>
  )
}