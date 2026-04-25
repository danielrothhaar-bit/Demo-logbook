import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the frontend runs on Vite (:5173) and the Express API runs on :3000.
// Proxy these routes so fetch('/api/...') and SSE work without CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api':     { target: 'http://localhost:3000', changeOrigin: true, ws: false },
      '/healthz': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
})
