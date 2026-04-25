import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  reducer,
  initialPersistedState,
  pickPersistedSlice,
  PERSISTED_KEYS,
  CLIENT_ONLY_ACTIONS
} from './src/lib/reducer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = process.env.PORT || 3000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const STATE_FILE = path.join(DATA_DIR, 'state.json')

fs.mkdirSync(DATA_DIR, { recursive: true })

// ---- Persistence ----

function loadInitial() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    // New format: { slice, version }
    if (parsed && parsed.slice && typeof parsed.version === 'number') {
      return parsed
    }
    // Backward compat: old format was just the slice
    if (parsed && Array.isArray(parsed.sessions)) {
      return { slice: parsed, version: 1 }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Could not read existing state file, seeding fresh:', err.message)
    }
  }
  const seeded = { slice: initialPersistedState(), version: 1 }
  persistAll(seeded.slice, seeded.version)
  return seeded
}

function persistAll(slice, version) {
  const tmp = STATE_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ slice, version }))
  fs.renameSync(tmp, STATE_FILE)
}

const loaded = loadInitial()
let currentSlice = loaded.slice
let currentVersion = loaded.version

console.log(`[demo-logbook] persisting to ${STATE_FILE}`)
console.log(`[demo-logbook] loaded ${currentSlice.sessions.length} sessions, ${currentSlice.games.length} games`)

// Apply an action against the persisted slice. The reducer expects a "full" state
// shape (with UI fields), so we wrap with default UI fields, run, and pick back.
function applyAction(action) {
  const fullStateBefore = {
    ...currentSlice,
    activeDesignerId: currentSlice.designers[0]?.id || null,
    activeSessionId: null,
    reviewSessionId: null,
    mode: 'home',
    hydrated: true
  }
  const next = reducer(fullStateBefore, action)
  const nextSlice = pickPersistedSlice(next)

  // No-op action? Don't bump version or write to disk.
  if (deepEqualSlice(currentSlice, nextSlice)) return false

  currentSlice = nextSlice
  currentVersion += 1
  persistAll(currentSlice, currentVersion)
  return true
}

function deepEqualSlice(a, b) {
  // Cheap structural equality: stringify is fine for our payloads
  return JSON.stringify(a) === JSON.stringify(b)
}

// ---- SSE pub-sub ----

const subscribers = new Set()

function broadcast() {
  const msg = `data: ${JSON.stringify({ version: currentVersion })}\n\n`
  for (const res of subscribers) {
    try { res.write(msg) } catch {}
  }
}

// ---- Express ----

const app = express()
app.use(express.json({ limit: '20mb' })) // photos arrive base64-encoded

app.get('/healthz', (_req, res) => res.send('ok'))

app.get('/api/state', (_req, res) => {
  res.json({ state: currentSlice, version: currentVersion })
})

app.post('/api/actions', (req, res) => {
  const action = req.body?.action
  if (!action || typeof action !== 'object' || !action.type) {
    return res.status(400).json({ error: 'invalid action' })
  }
  // Defensive: never run client-only actions on the server
  if (CLIENT_ONLY_ACTIONS.has(action.type)) {
    return res.json({ state: currentSlice, version: currentVersion })
  }
  try {
    const changed = applyAction(action)
    if (changed) broadcast()
    res.json({ state: currentSlice, version: currentVersion })
  } catch (err) {
    console.error('Reducer error for action', action.type, err)
    res.status(500).json({ error: 'reducer failed' })
  }
})

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders?.()
  res.write(`data: ${JSON.stringify({ version: currentVersion })}\n\n`)

  subscribers.add(res)
  // 25s heartbeat to keep proxies (Railway, browsers) from dropping the connection
  const hb = setInterval(() => { try { res.write(': hb\n\n') } catch {} }, 25000)

  req.on('close', () => {
    clearInterval(hb)
    subscribers.delete(res)
  })
})

// ---- Static SPA + fallback ----

const distDir = path.join(__dirname, 'dist')

app.use(express.static(distDir, {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
  }
}))

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[demo-logbook] listening on :${PORT}`)
})
