import { useState } from 'react'
import axios from 'axios'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import {
  Box, Typography, TextField, Button, InputAdornment,
  IconButton, Divider, Link, MenuItem, Select,
  FormControl, InputLabel, OutlinedInput,
} from '@mui/material'
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { LogoBadge } from './AppNavBar'
import { ROMANIA_REGIONS } from '../constants/Regions'
import { API_BASE } from '../utils'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#5a189a', dark: '#3c096c', light: '#9d4edd' },
    secondary: { main: '#c77dff' },
    background: { default: '#10002b', paper: '#ffffff' },
    text: { primary: '#240046', secondary: '#5a189a' },
  },
  typography: { fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: { root: { borderRadius: 10, textTransform: 'none', fontWeight: 600, fontSize: 14 } },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { borderRadius: 10, fontSize: 14, '&.Mui-focused fieldset': { borderColor: '#7b2cbf' } },
        },
      },
    },
    MuiSelect: {
      styleOverrides: { root: { borderRadius: 10, fontSize: 14 } },
    },
  },
})

export default function Register({ onRegister, onGoToLogin, onBack }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '', region: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async () => {
    setError('')
    if (!form.username.trim() || !form.email.trim() || !form.password || !form.region) {
      setError('Please fill in all required fields.'); return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.'); return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.'); return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.'); return
    }
    setLoading(true)
    try {
      const { data } = await axios.post(`${API_BASE}/register`, {
        username: form.username.trim(), email: form.email.trim(), password: form.password, region: form.region,
      })
      localStorage.setItem('aq_token', data.token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
      onRegister && onRegister(data.user)
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
        backgroundImage: 'radial-gradient(circle at 80% 20%, #240046 0%, #10002b 100%)',
        px: 2, py: 4,
      }}>
        <Box sx={{ width: '100%', maxWidth: 420, bgcolor: 'background.paper', borderRadius: 4, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>

          {/* Header */}
          <Box sx={{ background: 'linear-gradient(135deg, #3c096c 0%, #7b2cbf 100%)', px: 3, pt: 3, pb: 3, display: 'flex', alignItems: 'center', gap: 1.75 }}>
            <LogoBadge size={44} />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.5px' }}>
                AquaGraph
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#e0aaff', textTransform: 'uppercase', letterSpacing: '1px', mt: 0.5 }}>
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
              Create an account
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 3 }}>
              Sign up to access the monitoring platform
            </Typography>

            <TextField fullWidth label="Username" variant="outlined" size="small"
              value={form.username} onChange={set('username')} onKeyDown={handleKeyDown} sx={{ mb: 2 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><AccountCircleOutlined sx={{ fontSize: 20, color: '#9d4edd' }} /></InputAdornment> } }}
            />

            <TextField fullWidth label="Email" variant="outlined" size="small"
              value={form.email} onChange={set('email')} onKeyDown={handleKeyDown} type="email" sx={{ mb: 2 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon sx={{ fontSize: 20, color: '#9d4edd' }} /></InputAdornment> } }}
            />

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel sx={{ color: '#5a189a' }}>Region of interest</InputLabel>
              <Select value={form.region} onChange={set('region')} input={<OutlinedInput label="Region of interest" />}
                startAdornment={<InputAdornment position="start"><LocationOnOutlinedIcon sx={{ fontSize: 20, color: '#9d4edd', ml: 0.5 }} /></InputAdornment>}
              >
                {ROMANIA_REGIONS.map(r => (
                  <MenuItem key={r.value} value={r.value} sx={{ fontSize: 14 }}>{r.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField fullWidth label="Password" variant="outlined" size="small"
              type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} onKeyDown={handleKeyDown} sx={{ mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ fontSize: 20, color: '#9d4edd' }} /></InputAdornment>,
                  endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={() => setShowPassword(v => !v)}>{showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton></InputAdornment>,
                },
              }}
            />

            <TextField fullWidth label="Confirm password" variant="outlined" size="small"
              type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} onKeyDown={handleKeyDown} sx={{ mb: 3 }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ fontSize: 20, color: '#9d4edd' }} /></InputAdornment>,
                  endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={() => setShowConfirm(v => !v)}>{showConfirm ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton></InputAdornment>,
                },
              }}
            />

            {error && (
              <Typography sx={{ fontSize: 12, color: '#ff1744', mb: 2, bgcolor: 'rgba(255,23,68,0.05)', border: '1px solid rgba(255,23,68,0.2)', borderRadius: 2, px: 2, py: 1 }}>
                {error}
              </Typography>
            )}

            <Button fullWidth variant="contained" onClick={handleSubmit} disabled={loading}
              sx={{
                background: 'linear-gradient(135deg, #5a189a 0%, #3c096c 100%)',
                py: 1.2, mb: 2,
                boxShadow: '0 4px 15px rgba(90, 24, 154, 0.3)',
                '&:hover': { background: 'linear-gradient(135deg, #7b2cbf 0%, #5a189a 100%)', boxShadow: '0 6px 20px rgba(90, 24, 154, 0.4)' },
              }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </Button>

            <Divider sx={{ my: 3, fontSize: 12, color: '#9d4edd', opacity: 0.5 }}>or</Divider>

            <Typography sx={{ textAlign: 'center', fontSize: 13, color: 'text.secondary' }}>
              Already have an account?{' '}
              <Link component="button" onClick={onGoToLogin} underline="hover"
                sx={{ color: '#5a189a', fontWeight: 700, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                Sign in
              </Link>
            </Typography>

            {onBack && (
              <Button fullWidth variant="text" onClick={onBack} startIcon={<ArrowBackIcon />}
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