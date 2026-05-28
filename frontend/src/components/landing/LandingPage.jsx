import { useEffect } from 'react'
import { Box } from '@mui/material'
import SiteNav from '../SiteNav'
import HeroSection from './HeroSection'
import StatsBar from './StatsBar'
import FeaturesSection from './FeaturesSection'
import WhySection from './WhySection'
import DataPreviewSection from './DataPreviewSection'
import HowItWorksSection from './HowItWorksSection'
import CTASection from './CtaSection'
import LandingFooter from './LandingFooter'

export default function LandingPage({ onGoToMap, onGoToLogin, onGoToRegister, onGoToNewsletter, onGoToCampaigns, onGoToPipeline, onGoToAbout, user, onLogout }) {
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

  const handleMapClick = () => onGoToMap()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
      <SiteNav
        current="home"
        onGoToHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onGoToMap={handleMapClick}
        onGoToLogin={onGoToLogin}
        onGoToRegister={onGoToRegister}
        onGoToNewsletter={onGoToNewsletter}
        onGoToCampaigns={onGoToCampaigns}
        onGoToPipeline={onGoToPipeline}
        onGoToAbout={onGoToAbout}
        user={user}
        onLogout={onLogout}
      />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <WhySection />
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