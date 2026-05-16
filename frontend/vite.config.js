import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// In dev, the frontend talks to the API at the same-origin path `/api`
// (see src/utils.js). This proxy forwards that to the Flask backend on
// :5000 so dev mirrors the production single-origin setup, where Flask
// serves both the built frontend and the API.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
