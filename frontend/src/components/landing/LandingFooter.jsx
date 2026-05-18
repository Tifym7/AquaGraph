import { Box, Typography } from '@mui/material'

const C = {
  mid2: '#7b2cbf',
  mid3: '#9d4edd',
}

export default function LandingFooter({ onGoToMap, onGoToCampaigns, onGoToNewsletter }) {
  const links = [
    { label: 'Map',      action: onGoToMap },
    { label: 'Campaigns',  action: onGoToCampaigns },
    { label: 'Newsletter', action: onGoToNewsletter },
  ]

  return (
    <Box sx={{
      borderTop: '1px solid rgba(90,24,154,0.15)',
      px: { xs: 2.5, md: 5 },
      py: 2,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 1,
    }}>
      <Typography sx={{ fontSize: '0.78rem', color: C.mid3 }}>
        © 2026 AquaGraph · Space for Water
      </Typography>
      <Box sx={{ display: 'flex', gap: 2.5 }}>
        {links.map(({ label, action }) => (
          <Typography
            key={label}
            component="span"
            onClick={action}
            sx={{
              fontSize: '0.78rem', color: C.mid3, cursor: 'pointer',
              '&:hover': { color: C.mid2 }, transition: 'color 0.15s',
            }}
          >
            {label}
          </Typography>
        ))}
      </Box>
    </Box>
  )
}