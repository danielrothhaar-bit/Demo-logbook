import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'

const StoreContext = createContext(null)

const DEFAULT_CATEGORIES = [
  'Puzzle Flow',
  'Hint Moment',
  'Friction Point',
  'Wow Moment',
  'Tech Issue',
  'Theming Gap',
  'Pacing'
]

const CATEGORY_COLORS = {
  'Puzzle Flow':    '#60a5fa',
  'Hint Moment':    '#fbbf24',
  'Friction Point': '#f87171',
  'Wow Moment':     '#34d399',
  'Tech Issue':     '#f472b6',
  'Theming Gap':    '#c084fc',
  'Pacing':         '#22d3ee'
}

const DESIGNERS = [
  { id: 'd1', name: 'Daniel',  initials: 'DR', color: '#f59e0b' },
  { id: 'd2', name: 'Maya',    initials: 'MK', color: '#06b6d4' },
  { id: 'd3', name: 'Sam',     initials: 'SP', color: '#a855f7' }
]

// Generate a short, friendly session code
const genCode = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const pick = (s, n) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('')
  return `${pick(letters, 4)}-${pick(digits, 2)}${pick(letters, 1)}${pick(digits, 1)}`
}

const uid = () => Math.random().toString(36).slice(2, 10)

// --- Seed data: 3 prior sessions of "The Vault" so trends has substance ---
const seedSessions = () => {
  const room = 'The Vault'
  const today = new Date()
  const dateAt = (daysAgo) => {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }
  const mk = (sec, designerId, categories, text) => ({
    id: uid(), timestamp: sec, designerId, categories, text, createdAt: Date.now() - sec * 1000
  })
  return [
    {
      id: uid(),
      roomName: room,
      teamSize: 4,
      experience: 'experienced',
      date: dateAt(21),
      sessionCode: 'VAULT-A12B',
      timerElapsed: 3580,
      timerRunning: false,
      timerStartedAt: null,
      ended: true,
      notes: [
        mk(180,  'd1', ['Puzzle Flow'],     'Team flew through the keypad — too easy?'),
        mk(645,  'd2', ['Friction Point'],  'Stuck on Puzzle 4 for 3+ minutes, no progress.'),
        mk(720,  'd1', ['Friction Point'],  'Puzzle 4 is a wall — they have no clue what to do.'),
        mk(910,  'd3', ['Hint Moment'],     'GM hinted on Puzzle 4 finally.'),
        mk(1640, 'd2', ['Wow Moment'],      'Vault door opening got an audible gasp.'),
        mk(2200, 'd1', ['Theming Gap'],     'The fluorescent light by the safe breaks the period feel.'),
        mk(2900, 'd3', ['Pacing'],          'Final puzzle dragged — energy dropped.'),
      ]
    },
    {
      id: uid(),
      roomName: room,
      teamSize: 3,
      experience: 'enthusiast',
      date: dateAt(14),
      sessionCode: 'VAULT-B41C',
      timerElapsed: 3200,
      timerRunning: false,
      timerStartedAt: null,
      ended: true,
      notes: [
        mk(540,  'd1', ['Friction Point'],  'Puzzle 4 — even enthusiasts confused by the symbol mapping.'),
        mk(610,  'd2', ['Friction Point'],  'P4 again. The symbols on the panel are not legible.'),
        mk(1300, 'd1', ['Tech Issue'],      'Magnet lock on safe stuck briefly.'),
        mk(1700, 'd3', ['Wow Moment'],      'Hidden compartment reveal — huge reaction.'),
        mk(2400, 'd2', ['Theming Gap'],     'Same fluorescent light issue.'),
      ]
    },
    {
      id: uid(),
      roomName: room,
      teamSize: 5,
      experience: 'new',
      date: dateAt(7),
      sessionCode: 'VAULT-C77D',
      timerElapsed: 3600,
      timerRunning: false,
      timerStartedAt: null,
      ended: true,
      notes: [
        mk(220,  'd1', ['Puzzle Flow'],     'New players took a while to orient — tutorial feels missing.'),
        mk(720,  'd2', ['Friction Point'],  'Puzzle 4 stuck again. This is a pattern.'),
        mk(800,  'd3', ['Friction Point'],  'P4 — they tried 6 wrong combos. Mapping is broken.'),
        mk(1900, 'd1', ['Tech Issue'],      'Audio cue on vault door didn’t fire.'),
        mk(2600, 'd2', ['Pacing'],          'Pacing improved with bigger team but ending still slow.'),
      ]
    }
  ]
}

const seedActionItems = (sessions) => [
  {
    id: uid(),
    text: 'Redesign Puzzle 4 symbol mapping for clarity',
    status: 'in_progress',
    relatedCategory: 'Friction Point',
    relatedKeyword: 'puzzle 4',
    sourceSessionIds: sessions.slice(0, 3).map(s => s.id),
    createdAt: Date.now() - 3 * 86400000
  },
  {
    id: uid(),
    text: 'Replace fluorescent light near safe with period-correct fixture',
    status: 'open',
    relatedCategory: 'Theming Gap',
    relatedKeyword: 'fluorescent',
    sourceSessionIds: sessions.slice(0, 2).map(s => s.id),
    createdAt: Date.now() - 10 * 86400000
  },
  {
    id: uid(),
    text: 'Add an early on-ramp puzzle for new teams',
    status: 'needs_retest',
    relatedCategory: 'Puzzle Flow',
    relatedKeyword: 'orient',
    sourceSessionIds: [sessions[2].id],
    createdAt: Date.now() - 5 * 86400000
  }
]

const initial = (() => {
  const sessions = seedSessions()
  return {
    designers: DESIGNERS,
    activeDesignerId: 'd1',
    categories: [...DEFAULT_CATEGORIES],
    sessions,
    activeSessionId: null,
    mode: 'home',         // 'home' | 'setup' | 'live' | 'review' | 'trends'
    reviewSessionId: null,
    actionItems: seedActionItems(sessions)
  }
})()

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode }
    case 'SET_ACTIVE_DESIGNER':
      return { ...state, activeDesignerId: action.id }
    case 'SET_CATEGORIES':
      return { ...state, categories: action.categories }
    case 'CREATE_SESSION': {
      const session = {
        id: uid(),
        roomName: action.roomName,
        teamSize: action.teamSize,
        experience: action.experience,
        date: action.date,
        sessionCode: genCode(),
        timerElapsed: 0,
        timerRunning: false,
        timerStartedAt: null,
        ended: false,
        notes: []
      }
      return {
        ...state,
        sessions: [session, ...state.sessions],
        activeSessionId: session.id,
        mode: 'live'
      }
    }
    case 'OPEN_SESSION_LIVE':
      return { ...state, activeSessionId: action.id, mode: 'live' }
    case 'OPEN_SESSION_REVIEW':
      return { ...state, reviewSessionId: action.id, mode: 'review' }
    case 'TIMER_START': {
      return mapSession(state, action.sessionId, s => ({
        ...s,
        timerRunning: true,
        timerStartedAt: Date.now() - s.timerElapsed * 1000
      }))
    }
    case 'TIMER_PAUSE': {
      return mapSession(state, action.sessionId, s => {
        if (!s.timerRunning) return s
        const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000)
        return { ...s, timerRunning: false, timerElapsed: elapsed, timerStartedAt: null }
      })
    }
    case 'TIMER_RESET': {
      return mapSession(state, action.sessionId, s => ({
        ...s, timerRunning: false, timerElapsed: 0, timerStartedAt: null
      }))
    }
    case 'TIMER_TICK': {
      // Just persist current elapsed for an active running session (so refresh isn't lossy)
      return mapSession(state, action.sessionId, s => {
        if (!s.timerRunning || !s.timerStartedAt) return s
        const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000)
        return { ...s, timerElapsed: elapsed }
      })
    }
    case 'END_SESSION': {
      return mapSession(state, action.sessionId, s => ({
        ...s, ended: true, timerRunning: false,
        timerElapsed: s.timerRunning && s.timerStartedAt ? Math.floor((Date.now() - s.timerStartedAt) / 1000) : s.timerElapsed,
        timerStartedAt: null
      }))
    }
    case 'ADD_NOTE': {
      const note = {
        id: uid(),
        timestamp: action.timestamp,
        designerId: action.designerId,
        categories: action.categories || [],
        text: action.text,
        photoUrl: action.photoUrl || null,
        createdAt: Date.now()
      }
      return mapSession(state, action.sessionId, s => ({ ...s, notes: [...s.notes, note] }))
    }
    case 'UPDATE_NOTE': {
      return mapSession(state, action.sessionId, s => ({
        ...s,
        notes: s.notes.map(n => n.id === action.noteId ? { ...n, ...action.patch } : n)
      }))
    }
    case 'DELETE_NOTE': {
      return mapSession(state, action.sessionId, s => ({
        ...s,
        notes: s.notes.filter(n => n.id !== action.noteId)
      }))
    }
    case 'UPDATE_ACTION_ITEM': {
      return {
        ...state,
        actionItems: state.actionItems.map(a => a.id === action.id ? { ...a, ...action.patch } : a)
      }
    }
    case 'ADD_ACTION_ITEM': {
      return { ...state, actionItems: [{ id: uid(), createdAt: Date.now(), status: 'open', ...action.item }, ...state.actionItems] }
    }
    default:
      return state
  }
}

function mapSession(state, id, fn) {
  return {
    ...state,
    sessions: state.sessions.map(s => s.id === id ? fn(s) : s)
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)

  // Tick running timer once per second so live displays update
  const intervalRef = useRef(null)
  useEffect(() => {
    const active = state.sessions.find(s => s.id === state.activeSessionId)
    if (active?.timerRunning) {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'TIMER_TICK', sessionId: active.id })
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
    designerById: (id) => state.designers.find(d => d.id === id)
  }), [state])

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

export { CATEGORY_COLORS }
