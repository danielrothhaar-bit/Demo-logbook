import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  reducer,
  initialState,
  CATEGORY_COLORS,
  PERSISTED_KEYS,
  CLIENT_ONLY_ACTIONS,
  uid,
  genCode,
  initialsFromName
} from './lib/reducer.js'

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

export function StoreProvider({ children }) {
  const [state, baseDispatch] = useReducer(reducer, undefined, initialState)
  const versionRef = useRef(0)
  // Mirror state in a ref so the stable dispatch callback can read it without
  // re-binding (used to pre-compute Date.now()-derived fields).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // ---- Bootstrap from server ----
  useEffect(() => {
    let alive = true
    fetch('/api/state')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ state, version }) => {
        if (!alive) return
        versionRef.current = version
        baseDispatch({ type: '@@HYDRATE', state })
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
        if (version > versionRef.current) {
          fetch('/api/state').then(r => r.json()).then(({ state, version }) => {
            versionRef.current = version
            baseDispatch({ type: '@@HYDRATE', state })
          })
        }
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

    baseDispatch(filled)
    if (CLIENT_ONLY_ACTIONS.has(filled.type)) return

    fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: filled })
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ state, version }) => {
        versionRef.current = version
        // If the server's authoritative state diverges from optimism, reconcile.
        // (e.g. delete blocked because of dependencies → server keeps it)
        baseDispatch({ type: '@@HYDRATE', state })
      })
      .catch((err) => {
        console.warn('Sync failed for', filled.type, err)
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
