import { useState } from 'react'
import {
  AppBar, Toolbar, Box, Typography, Button, Avatar, IconButton,
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Divider,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'
import LoginIcon from '@mui/icons-material/Login'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import LogoutIcon from '@mui/icons-material/Logout'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

/* One responsive top bar shared by every page. Desktop (>= md) keeps the
   original 95px gradient bar with inline text buttons; below md the links
   collapse into a hamburger that opens a right-side Drawer, so nothing
   overflows on a phone. */

const NAV_BTN = {
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.25)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
  px: 1.5,
}

const NAV_BTN_ACTIVE = {
  color: '#e0aaff',
  border: '1px solid #c77dff',
  bgcolor: 'rgba(199,125,255,0.15)',
  '&:hover': { bgcolor: 'rgba(199,125,255,0.25)' },
  px: 1.5,
}

const AUTH_BTN = {
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.5)',
  bgcolor: 'rgba(255,255,255,0.08)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.7)' },
  px: 1.5,
}

function Brand({ leading, compact }) {
  return (
    <>
      {leading || <SatelliteAltIcon sx={{ fontSize: 28, color: '#fff' }} />}
      <Box sx={{ flexGrow: 0, mr: { xs: 0, md: 2 }, minWidth: 0 }}>
        <Typography variant="h6" noWrap sx={{ lineHeight: 1.2, letterSpacing: '-0.3px', color: '#fff' }}>
          AquaGraph
        </Typography>
        {!compact && (
          <Typography variant="caption" noWrap sx={{ opacity: 0.75, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#fff', display: 'block' }}>
            Satellite Water Pollution Monitor
          </Typography>
        )}
      </Box>
    </>
  )
}

export default function AppNavBar({
  leading,
  links = [],
  user,
  onLogout,
  showAuth = false,
  onLogin,
  onRegister,
  userMenuDetail = false,
  backAction,
  sx,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)

  const appBarSx = {
    background: 'linear-gradient(90deg, #10002b 0%, #3c096c 60%, #5a189a 100%)',
    boxShadow: '0 2px 12px rgba(109,40,217,0.35)',
    ...sx,
  }

  /* "Back only" mode (e.g. the Add-Campaign sub-page) - one button, already
     fits a phone, so no hamburger needed. */
  if (backAction) {
    return (
      <AppBar position="sticky" elevation={0} sx={appBarSx}>
        <Toolbar sx={{ gap: 1.5, minHeight: { xs: 60, md: 80 } }}>
          <Brand leading={leading} compact />
          <Box sx={{ flexGrow: 1 }} />
          <Button startIcon={<ArrowBackIcon />} size="small" onClick={backAction.onClick} sx={NAV_BTN}>
            {backAction.label}
          </Button>
        </Toolbar>
      </AppBar>
    )
  }

  const avatarLetter = user?.username?.[0]?.toUpperCase() || 'U'

  const renderAccount = () => {
    if (user && userMenuDetail) {
      return (
        <>
          <Avatar
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              width: 34, height: 34, bgcolor: 'rgba(255,255,255,0.25)',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: '2px solid rgba(255,255,255,0.4)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
            }}
          >
            {avatarLetter}
          </Avatar>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 180, borderRadius: 2 } } }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" fontWeight={700}>{user?.username}</Typography>
              {user?.email && <Typography variant="caption" color="text.secondary">{user.email}</Typography>}
            </Box>
            <Divider />
            <MenuItem onClick={() => { setAnchorEl(null); onLogout?.() }}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </>
      )
    }
    if (user) {
      return (
        <Avatar
          onClick={onLogout}
          title="Logout"
          sx={{
            width: 34, height: 34, bgcolor: 'rgba(255,255,255,0.25)',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            border: '2px solid rgba(255,255,255,0.4)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
          }}
        >
          {avatarLetter}
        </Avatar>
      )
    }
    if (showAuth) {
      return (
        <>
          <Button startIcon={<LoginIcon />} size="small" onClick={onLogin} sx={AUTH_BTN}>Login</Button>
          <Button startIcon={<PersonAddIcon />} size="small" onClick={onRegister} sx={AUTH_BTN}>Register</Button>
        </>
      )
    }
    return null
  }

  const fire = (fn) => () => { setDrawerOpen(false); fn?.() }

  return (
    <AppBar position="sticky" elevation={0} sx={appBarSx}>
      <Toolbar sx={{ gap: 1.5, minHeight: { xs: 60, md: '95px !important' } }}>
        <Brand leading={leading} compact={false} />
        <Box sx={{ flexGrow: 1 }} />

        {/* Desktop: inline links + account */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.5 }}>
          {links.map((l) => (
            <Button
              key={l.label}
              startIcon={l.icon}
              size="small"
              onClick={l.onClick}
              sx={l.active ? NAV_BTN_ACTIVE : NAV_BTN}
            >
              {l.label}
            </Button>
          ))}
          {(links.length > 0 && (user || showAuth)) && (
            <Box sx={{ width: '1px', height: 28, bgcolor: 'rgba(255,255,255,0.2)', mx: 0.5 }} />
          )}
          {renderAccount()}
        </Box>

        {/* Mobile: hamburger -> drawer */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>
          <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: '#fff' }} aria-label="open navigation">
            <MenuIcon />
          </IconButton>
        </Box>
      </Toolbar>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 270, background: 'linear-gradient(180deg, #240046 0%, #3c096c 100%)', color: '#fff' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
          <Typography variant="h6" sx={{ color: '#fff' }}>AquaGraph</Typography>
          <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: '#fff' }} aria-label="close navigation">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
        <List>
          {links.map((l) => (
            <ListItemButton
              key={l.label}
              onClick={fire(l.onClick)}
              selected={l.active}
              sx={{
                '&.Mui-selected': { bgcolor: 'rgba(199,125,255,0.2)' },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              <ListItemIcon sx={{ color: l.active ? '#e0aaff' : '#fff', minWidth: 40 }}>{l.icon}</ListItemIcon>
              <ListItemText primary={l.label} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ flexGrow: 1 }} />
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {user ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 700 }}>
                  {avatarLetter}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={700} noWrap>{user.username}</Typography>
                  {user.email && <Typography variant="caption" sx={{ opacity: 0.7 }} noWrap>{user.email}</Typography>}
                </Box>
              </Box>
              <Button fullWidth startIcon={<LogoutIcon />} onClick={fire(onLogout)} sx={AUTH_BTN}>Logout</Button>
            </>
          ) : showAuth ? (
            <>
              <Button fullWidth startIcon={<LoginIcon />} onClick={fire(onLogin)} sx={AUTH_BTN}>Login</Button>
              <Button fullWidth startIcon={<PersonAddIcon />} onClick={fire(onRegister)} sx={AUTH_BTN}>Register</Button>
            </>
          ) : null}
        </Box>
      </Drawer>
    </AppBar>
  )
}
