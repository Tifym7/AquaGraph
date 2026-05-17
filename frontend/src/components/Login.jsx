import { useState } from 'react'
import axios from 'axios'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { Box, Typography, TextField, Button, InputAdornment, IconButton, Divider, Link } from '@mui/material'
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt'
import PersonOutlineIcon from '@mui/icons-material/AccountCircleOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#5a189a', dark: '#3c096c', light: '#9d4edd' },
    secondary: { main: '#c77dff' },
    background: { default: '#10002b', paper: '#ffffff' },
    text: { primary: '#240046', secondary: '#5a189a' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, textTransform: 'none', fontWeight: 600, fontSize: 14, padding: '10px 20px' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '&.Mui-focused fieldset': { borderColor: '#7b2cbf' },
          },
        },
      },
    },
  },
})

export default function Login({ onLogin, onGoToRegister, onBack }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!username.trim() || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    try {
      const { data } = await axios.post('http://127.0.0.1:5000/api/login', { username: username.trim(), password })
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
      onLogin && onLogin(data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit() }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: 'background.default',
        backgroundImage: 'radial-gradient(circle at 20% 30%, #240046 0%, #10002b 100%)',
        px: 2,
      }}>
        <Box sx={{ width: '100%', maxWidth: 400, bgcolor: 'background.paper', borderRadius: 4, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>

          {/* Header */}
          <Box sx={{ background: 'linear-gradient(135deg, #3c096c 0%, #7b2cbf 100%)', px: 3, pt: 3, pb: 3, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <SatelliteAltIcon sx={{ fontSize: 32, color: '#e0aaff', mt: 0.3 }} />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.5px' }}>
                AquaGraph
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#e0aaff', textTransform: 'uppercase', letterSpacing: '1px', mt: 0.5, opacity: 0.9 }}>
                Satellite Water Pollution Monitor
              </Typography>
            </Box>
            {onBack && (
              <IconButton
                onClick={onBack}
                size="small"
                title="Back to Home"
                sx={{
                  color: 'rgba(255,255,255,0.7)',
                  bgcolor: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' },
                  width: 32, height: 32,
                }}
              >
                <ArrowBackIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
          </Box>

          {/* Body */}
          <Box sx={{ px: 3, pt: 3, pb: 4 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
              Welcome back
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 3 }}>
              Enter your credentials to access the platform
            </Typography>

            <TextField
              fullWidth label="Username" variant="outlined" size="small"
              value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={handleKeyDown}
              sx={{ mb: 2 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineIcon sx={{ fontSize: 20, color: '#9d4edd' }} /></InputAdornment> } }}
            />

            <TextField
              fullWidth label="Password" variant="outlined" size="small"
              type={showPassword ? 'text' : 'password'}
              value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown}
              sx={{ mb: 1 }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ fontSize: 20, color: '#9d4edd' }} /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end">
                        {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
              <Link href="#" underline="hover" sx={{ fontSize: 12, color: '#7b2cbf', fontWeight: 600 }}>
                Forgot password?
              </Link>
            </Box>

            {error && (
              <Typography sx={{ fontSize: 12, color: '#ff1744', mb: 2, bgcolor: 'rgba(255,23,68,0.05)', border: '1px solid rgba(255,23,68,0.2)', borderRadius: 2, px: 2, py: 1 }}>
                {error}
              </Typography>
            )}

            <Button
              fullWidth variant="contained" onClick={handleSubmit} disabled={loading}
              sx={{
                background: 'linear-gradient(135deg, #5a189a 0%, #3c096c 100%)',
                color: '#fff', mb: 2,
                boxShadow: '0 4px 15px rgba(90, 24, 154, 0.3)',
                '&:hover': { background: 'linear-gradient(135deg, #7b2cbf 0%, #5a189a 100%)', boxShadow: '0 6px 20px rgba(90, 24, 154, 0.4)' },
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            <Divider sx={{ my: 3, fontSize: 12, color: '#9d4edd', opacity: 0.5 }}>or</Divider>

            <Typography sx={{ textAlign: 'center', fontSize: 13, color: 'text.secondary' }}>
              Don't have an account?{' '}
              <Link component="button" onClick={onGoToRegister} underline="hover"
                sx={{ color: '#5a189a', fontWeight: 700, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                Sign up
              </Link>
            </Typography>

            {onBack && (
              <Button
                fullWidth variant="text" onClick={onBack} startIcon={<ArrowBackIcon />}
                sx={{ mt: 1.5, color: '#9d4edd', fontSize: 13, '&:hover': { bgcolor: 'rgba(90,24,154,0.05)' } }}
              >
                Back to Home
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}