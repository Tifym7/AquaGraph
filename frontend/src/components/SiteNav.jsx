import HomeIcon from '@mui/icons-material/Home'
import MapIcon from '@mui/icons-material/Map'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import CampaignIcon from '@mui/icons-material/Campaign'
import EmailIcon from '@mui/icons-material/Email'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import AppNavBar from './AppNavBar'

/* Single source of truth for the site-wide top nav. Every page passes
   `current` so the matching link renders highlighted (and its click becomes
   a no-op). */

export default function SiteNav({
  current,
  onGoToHome,
  onGoToMap,
  onGoToPipeline,
  onGoToCampaigns,
  onGoToNewsletter,
  onGoToAbout,
  onGoToLogin,
  onGoToRegister,
  user,
  onLogout,
}) {
  const items = [
    { key: 'home',       label: 'Home',       icon: <HomeIcon />,         onClick: onGoToHome },
    { key: 'map',        label: 'Map',        icon: <MapIcon />,          onClick: onGoToMap },
    { key: 'pipeline',   label: 'Pipeline',   icon: <AccountTreeIcon />,  onClick: onGoToPipeline },
    { key: 'campaigns',  label: 'Campaigns',  icon: <CampaignIcon />,     onClick: onGoToCampaigns },
    { key: 'newsletter', label: 'Newsletter', icon: <EmailIcon />,        onClick: onGoToNewsletter },
    { key: 'about',      label: 'About',      icon: <InfoOutlinedIcon />, onClick: onGoToAbout },
  ]

  const links = items.map(({ key, onClick, ...rest }) => ({
    ...rest,
    active: current === key,
    onClick: current === key ? () => {} : onClick,
  }))

  return (
    <AppNavBar
      links={links}
      user={user}
      onLogout={onLogout}
      showAuth={!user && Boolean(onGoToLogin || onGoToRegister)}
      onLogin={onGoToLogin}
      onRegister={onGoToRegister}
      onLogoClick={onGoToHome}
      userMenuDetail
    />
  )
}
