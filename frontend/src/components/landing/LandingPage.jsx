import { useEffect } from 'react'
import { Box } from '@mui/material'
import LandingNav from './LandingNav'
import HeroSection from './HeroSection'
import StatsBar from './StatsBar'
import FeaturesSection from './FeaturesSection'
import DataPreviewSection from './DataPreviewSection'
import HowItWorksSection from './HowItWorksSection'
import CTASection from './CTASection'
import LandingFooter from './LandingFooter'

export default function LandingPage({ onGoToMap, onGoToLogin, onGoToRegister, onGoToNewsletter, onGoToCampaigns, user, onLogout }) {
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

  const handleMapClick = () => {
    if (user) onGoToMap()
    else onGoToLogin()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
      <LandingNav
        onGoToMap={handleMapClick}
        onGoToLogin={onGoToLogin}
        onGoToRegister={onGoToRegister}
        onGoToNewsletter={onGoToNewsletter}
        onGoToCampaigns={onGoToCampaigns}
        user={user}
        onLogout={onLogout}
      />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <DataPreviewSection onGoToMap={handleMapClick} />
      <HowItWorksSection />
      <CTASection />
      <LandingFooter
        onGoToMap={handleMapClick}
        onGoToCampaigns={onGoToCampaigns}
        onGoToNewsletter={onGoToNewsletter}
      />
    </Box>
  )
}