import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import MapIcon from '@mui/icons-material/Map'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import AppNavBar from '../AppNavBar'

/* No `leading` prop: AppNavBar renders the shared LogoBadge by default, so
   the landing nav stays in lock-step with every other page. */

export default function LandingNav({ onGoToMap, onGoToLogin, onGoToRegister, onGoToNewsletter, onGoToCampaigns, onGoToPipeline, user, onLogout }) {
  return (
    <AppNavBar
      links={[
        { label: 'Map', icon: <MapIcon />, onClick: onGoToMap },
        { label: 'Pipeline', icon: <AccountTreeIcon />, onClick: onGoToPipeline },
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
