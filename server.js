import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const distDir = path.join(__dirname, 'dist')

// Health check for Railway
app.get('/healthz', (_req, res) => res.send('ok'))

// Static assets with sensible cache headers
app.use(express.static(distDir, {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache')
    }
  }
}))

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo Logbook listening on :${PORT}`)
})
