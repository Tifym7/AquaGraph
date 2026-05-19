import { useTheme, useMediaQuery } from '@mui/material'

/* Single source of truth for the phone/tablet breakpoint. Anything below
   MUI's `md` (900px) gets the compact, touch-first layout. */
export default function useIsMobile() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('md'))
}
