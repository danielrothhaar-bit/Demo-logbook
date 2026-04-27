import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  reducer,
  CATEGORY_COLORS,
  PERSISTED_KEYS,
  CLIENT_ONLY_ACTIONS,
  uid,
  genCode,
  initialsFromName
} from './lib/reducer.js'

// Start the client with empty data so the seeded sample games never flash
// before the real state arrives from the server. The reducer's @@HYDRATE
// will fill these from the GET /api/state response on bootstrap.
function clientInitialState() {
  return {
    designers: [],
    categories: [],
    games: [],
    sessions: [],
    actionItems: [],
    activeDesignerId: null,
    activeSessionId: null,
    reviewSessionId: null,
    mode: 'home',
    hydrated: false
  }
}

const StoreContext = createContext(null)

// Pre-fill IDs / sessionCodes client-side so the optimistic local state
// matches what the server will compute when it applies the same action.
function fillIdsForSync(action) {
  switch (action.type) {
    case 'ADD_NOTE':        return { ...action, id: action.id || uid(), createdAt: action.createdAt || Date.now() }
    case 'ADD_DESIGNER':    return { ...action, id: action.id || ('d_' + uid()) }
    case 'ADD_GAME':        return { ...action, id: action.id || ('g_' + uid()), createdAt: action.createdAt || Date.now() }
    case 'ADD_PUZZLE':      return { ...action, id: action.id || ('p_' + uid()) }
    case 'ADD_COMPONENT':   return { ...action, id: action.id || ('c_' + uid()) }
    case 'CREATE_SESSION':  return { ...action, id: action.id || uid(), sessionCode: action.sessionCode || genCode() }
    case 'TIMER_START':     return { ...action, startedAt: action.startedAt || Date.now() }
    case 'ADD_ACTION_ITEM': return { ...action, item: { ...action.item, id: action.item?.id || uid(), createdAt: action.item?.createdAt || Date.now() } }
    default: return action
  }
}

const ACTIVE_DESIGNER_KEY = 'demo-logbook:activeDesignerId'

function readStoredActiveDesigner() {
  try { return localStorage.getItem(ACTIVE_DESIGNER_KEY) || null } catch { return null }
}

function writeStoredActiveDesigner(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_DESIGNER_KEY, id)
    else localStorage.removeItem(ACTIVE_DESIGNER_KEY)
  } catch {}
}

export function StoreProvider({ children }) {
  const [state, baseDispatch] = useReducer(reducer, undefined, clientInitialState)
  const versionRef = useRef(0)
  // In-flight optimistic POSTs. While > 0, an SSE-triggered GET /api/state
  // could return state that doesn't yet include our action (because the POST
  // hasn't been applied server-side) — so we defer the catch-up until our
  // POSTs land, otherwise the GET response rolls our optimistic state back.
  const pendingPostsRef = useRef(0)
  // Highest version seen via SSE during the current POST flight. After all
  // POSTs land, refresh only if SSE pointed past what our hydrates set.
  const highestSeenVersionRef = useRef(0)
  // Track if any POST in the current flight failed — if so, the optimistic
  // state may diverge from the server's, so a final refresh reconciles.
  const anyFailedRef = useRef(false)
  // Monotonic dispatch counter. A POST's response only hydrates if no newer
  // dispatch followed it — otherwise its (intermediate) server snapshot would
  // briefly roll the UI back through stale states (the bug behind rapid clicks
  // on puzzle/component reorder, where the moves "replayed").
  const dispatchSeqRef = useRef(0)
  // Mirror state in a ref so the stable dispatch callback can read it without
  // re-binding (used to pre-compute Date.now()-derived fields).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Apply server state, but only if it's at least as fresh as what we already
  // have. Prevents a slow response from regressing us past a newer hydrate.
  const hydrateIfNewer = (serverState, serverVersion) => {
    if (serverVersion < versionRef.current) return
    versionRef.current = serverVersion
    baseDispatch({ type: '@@HYDRATE', state: serverState })
  }

  const refreshFromServer = () => {
    fetch('/api/state', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ state, version }) => hydrateIfNewer(state, version))
      .catch(() => {})
  }

  // Mirror activeDesignerId → localStorage. Covers cases the dispatch wrapper
  // can't see directly (e.g. @@HYDRATE clearing a deleted designer).
  useEffect(() => {
    if (state.hydrated) writeStoredActiveDesigner(state.activeDesignerId)
  }, [state.activeDesignerId, state.hydrated])

  // ---- Bootstrap from server ----
  useEffect(() => {
    let alive = true
    fetch('/api/state', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ state, version }) => {
        if (!alive) return
        versionRef.current = version
        baseDispatch({ type: '@@HYDRATE', state })
        // Restore last-picked designer from localStorage (per device).
        // Only honor it if it still maps to a known designer.
        const stored = readStoredActiveDesigner()
        if (stored && (state?.designers || []).some(d => d.id === stored)) {
          baseDispatch({ type: 'SET_ACTIVE_DESIGNER', id: stored })
        }
      })
      .catch(() => {
        // Offline / no backend — mark hydrated so the UI doesn't show a loading state forever
        if (alive) baseDispatch({ type: '@@HYDRATE', state: {} })
      })
    return () => { alive = false }
  }, [])

  // ---- SSE subscription so other devices' changes surface in near-real-time ----
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try {
        const { version } = JSON.parse(e.data)
        if (version <= versionRef.current) return
        if (version > highestSeenVersionRef.current) {
          highestSeenVersionRef.current = version
        }
        // Defer SSE catch-ups while our POST is in flight; the POST .then will
        // pick up the latest state (or .finally will refresh if needed).
        if (pendingPostsRef.current > 0) return
        refreshFromServer()
      } catch {}
    }
    es.onerror = () => { /* browser auto-reconnects */ }
    return () => es.close()
  }, [])

  // ---- Wrapped dispatch: optimistic local apply + POST persisted actions ----
  const dispatch = useCallback((action) => {
    let filled = fillIdsForSync(action)

    // For actions whose result depends on Date.now(), lock the elapsed value
    // here so the server replay matches the client's optimistic state exactly.
    if ((filled.type === 'TIMER_PAUSE' || filled.type === 'END_SESSION') && filled.elapsed == null) {
      const s = stateRef.current.sessions.find(x => x.id === filled.sessionId)
      if (s) {
        filled = {
          ...filled,
          elapsed: s.timerRunning && s.timerStartedAt
            ? Math.floor((Date.now() - s.timerStartedAt) / 1000)
            : (s.timerElapsed || 0)
        }
      }
    }

    // Persist designer picks on the device so refresh / new tabs remember.
    if (filled.type === 'SET_ACTIVE_DESIGNER') writeStoredActiveDesigner(filled.id)

    baseDispatch(filled)
    if (CLIENT_ONLY_ACTIONS.has(filled.type)) return

    const mySeq = ++dispatchSeqRef.current
    pendingPostsRef.current++
    fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: filled }),
      cache: 'no-store'
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ state, version }) => {
        // Skip the hydrate if a newer dispatch followed us — its response will
        // be the source of truth, and applying our (now intermediate) snapshot
        // would briefly roll the UI back. Without this, rapid clicks on the
        // reorder buttons make the items "replay" through every intermediate
        // state as each in-order POST resolves.
        if (mySeq < dispatchSeqRef.current) return
        // If the server's authoritative state diverges from optimism, reconcile.
        // (e.g. delete blocked because of dependencies → server keeps it)
        hydrateIfNewer(state, version)
      })
      .catch((err) => {
        console.warn('Sync failed for', filled.type, err)
        anyFailedRef.current = true
      })
      .finally(() => {
        pendingPostsRef.current--
        if (pendingPostsRef.current === 0) {
          // After all POSTs settle: refresh if SSE saw a version past what our
          // hydrates set (out-of-order responses, or another client's actions),
          // or if any POST failed (optimistic state may diverge from server).
          const needRefresh =
            highestSeenVersionRef.current > versionRef.current ||
            anyFailedRef.current
          highestSeenVersionRef.current = 0
          anyFailedRef.current = false
          if (needRefresh) refreshFromServer()
        }
      })
  }, [])

  // Tick running timer once per second so live displays update
  const intervalRef = useRef(null)
  useEffect(() => {
    const active = state.sessions.find(s => s.id === state.activeSessionId)
    if (active?.timerRunning) {
      intervalRef.current = setInterval(() => {
        baseDispatch({ type: 'TIMER_TICK', sessionId: active.id })
      }, 1000)
      return () => clearInterval(intervalRef.current)
    }
  }, [state.activeSessionId, state.sessions])

  const value = useMemo(() => ({
    state,
    dispatch,
    categoryColor: (c) => CATEGORY_COLORS[c] || '#9aa7c2',
    activeDesigner: state.designers.find(d => d.id === state.activeDesignerId),
    activeSession: state.sessions.find(s => s.id === state.activeSessionId) || null,
    reviewSession: state.sessions.find(s => s.id === state.reviewSessionId) || null,
    designerById: (id) => state.designers.find(d => d.id === id),
    gameById: (id) => state.games.find(g => g.id === id),
    gameName: (id) => state.games.find(g => g.id === id)?.name || '(deleted game)',
    newestGame: () => [...state.games].sort((a, b) => b.createdAt - a.createdAt)[0] || null
  }), [state, dispatch])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return '00:00'
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

// Render a wall-clock time as 12-hour with am/pm.
// "14:00" → "2 pm", "14:30" → "2:30 pm", "00:00" → "12 am", "12:00" → "12 pm".
// Also accepts a Date so callers with timerFirstStartedAt timestamps can reuse it.
export function fmtClockTime(value) {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    return formatHM12(value.getHours(), value.getMinutes())
  }
  const m = String(value).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return String(value)
  return formatHM12(parseInt(m[1], 10), parseInt(m[2], 10))
}

function formatHM12(h, min) {
  if (isNaN(h) || isNaN(min)) return ''
  const period = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return min === 0 ? `${h} ${period}` : `${h}:${String(min).padStart(2, '0')} ${period}`
}

// Demo countdown anchor — kept here so reducer + UI agree on the same target.
export const DEMO_TARGET_SEC = 60 * 60

// Render an elapsed-seconds value as countdown form. "+mm:ss" means overtime
// (elapsed > target). Negative elapsed (timer was extended via +1m before
// running) renders as a value above the target.
export function fmtCountdown(elapsedSec, targetSec = DEMO_TARGET_SEC) {
  if (elapsedSec == null || isNaN(elapsedSec)) return fmtTime(targetSec)
  const remaining = targetSec - Math.floor(elapsedSec)
  if (remaining < 0) return '+' + fmtTime(-remaining)
  return fmtTime(remaining)
}

// Inverse of fmtCountdown — accepts either "mm:ss" or "+mm:ss" and returns
// elapsed seconds. Returns null on parse failure.
export function parseCountdown(str, targetSec = DEMO_TARGET_SEC) {
  if (!str) return null
  const trimmed = String(str).trim()
  const isOver = trimmed.startsWith('+')
  const body = isOver ? trimmed.slice(1).trim() : trimmed
  const m = body.match(/^(\d{1,3}):(\d{1,2})$/)
  if (!m) return null
  const minutes = parseInt(m[1], 10)
  const seconds = parseInt(m[2], 10)
  if (seconds > 59) return null
  const total = minutes * 60 + seconds
  return isOver ? targetSec + total : targetSec - total
}

// Re-exported so existing imports keep working
export { CATEGORY_COLORS, initialsFromName }
