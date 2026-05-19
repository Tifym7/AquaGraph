import { Box } from '@mui/material'
import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import MapIcon from '@mui/icons-material/Map'
import AppNavBar from '../AppNavBar'
import logoImg from '../../assets/logo.jpeg'

export default function LandingNav({ onGoToMap, onGoToLogin, onGoToRegister, onGoToNewsletter, onGoToCampaigns, user, onLogout }) {
  return (
    <AppNavBar
      leading={<Box component="img" src={logoImg} alt="AquaGraph logo" sx={{ height: 50, width: 50, flexShrink: 0, borderRadius: 1 }} />}
      links={[
        { label: 'Map', icon: <MapIcon />, onClick: onGoToMap },
        { label: 'Campaigns', icon: <CampaignIcon />, onClick: onGoToCampaigns },
        { label: 'Newsletter', icon: <EmailIcon />, onClick: onGoToNewsletter },
      ]}
      user={user}
      onLogout={onLogout}
      showAuth
      onLogin={onGoToLogin}
      onRegister={onGoToRegister}
    />
  )
}
