import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'

const StoreContext = createContext(null)

const DEFAULT_CATEGORIES = [
  'Game Flow Issue',
  'Puzzle Logic Issue',
  'Tech Issue',
  'Wow Moment',
  'Frustration',
  'Hint',
  'Clue',
  'Puzzle Solved',
  'Feedback Discussion'
]

const CATEGORY_COLORS = {
  'Game Flow Issue':     '#fb923c',
  'Puzzle Logic Issue':  '#a78bfa',
  'Tech Issue':          '#f472b6',
  'Wow Moment':          '#34d399',
  'Frustration':         '#fb7185',
  'Hint':                '#fbbf24',
  'Clue':                '#facc15',
  'Puzzle Solved':       '#2dd4bf',
  'Feedback Discussion': '#22d3ee'
}

// Tags used for negative/positive scoring in synthesis
export const NEGATIVE_CATEGORIES = new Set(['Game Flow Issue', 'Puzzle Logic Issue', 'Tech Issue', 'Frustration'])
export const POSITIVE_CATEGORIES = new Set(['Wow Moment', 'Puzzle Solved'])

const DESIGNERS_SEED = [
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
export const initialsFromName = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const seedGames = () => ([
  { id: 'g_vault', name: 'The Vault',          createdAt: Date.now() - 90 * 86400000 },
  { id: 'g_lab',   name: 'Forgotten Lab',      createdAt: Date.now() - 30 * 86400000 },
  { id: 'g_attic', name: 'Grandmother\'s Attic', createdAt: Date.now() -  7 * 86400000 }
])

const seedSessions = (games) => {
  const today = new Date()
  const dateAt = (daysAgo) => {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }
  const mk = (sec, designerId, categories, text) => ({
    id: uid(), timestamp: sec, designerId, categories, text, createdAt: Date.now() - sec * 1000
  })
  const vault = games.find(g => g.id === 'g_vault')
  const lab   = games.find(g => g.id === 'g_lab')
  return [
    {
      id: uid(),
      gameId: vault.id,
      teamSize: 4,
      experience: 'experienced',
      date: dateAt(21),
      sessionCode: 'VAULT-A12B',
      timerElapsed: 3580,
      timerRunning: false,
      timerStartedAt: null,
      ended: true,
      notes: [
        mk(180,  'd1', ['Game Flow Issue'],     'Team flew through the keypad — too easy?'),
        mk(645,  'd2', ['Frustration'],         'Stuck on Puzzle 4 for 3+ minutes, no progress.'),
        mk(720,  'd1', ['Puzzle Logic Issue'],  'Puzzle 4 logic is unclear — they don\'t see the mapping.'),
        mk(910,  'd3', ['Hint'],                'GM hinted on Puzzle 4 finally.'),
        mk(1640, 'd2', ['Wow Moment'],          'Vault door opening got an audible gasp.'),
        mk(2200, 'd1', ['Game Flow Issue'],     'Pacing dipped after the vault — energy dropped.'),
        mk(2900, 'd3', ['Puzzle Solved'],       'Final lock cracked with 10 seconds to spare.')
      ]
    },
    {
      id: uid(),
      gameId: vault.id,
      teamSize: 3,
      experience: 'enthusiast',
      date: dateAt(14),
      sessionCode: 'VAULT-B41C',
      timerElapsed: 3200,
      timerRunning: false,
      timerStartedAt: null,
      ended: true,
      notes: [
        mk(540,  'd1', ['Puzzle Logic Issue'],  'Puzzle 4 — even enthusiasts confused by the symbol mapping.'),
        mk(610,  'd2', ['Frustration'],         'P4 again. Symbols on the panel are not legible.'),
        mk(1300, 'd1', ['Tech Issue'],          'Magnet lock on safe stuck briefly.'),
        mk(1700, 'd3', ['Wow Moment'],          'Hidden compartment reveal — huge reaction.'),
        mk(2400, 'd2', ['Clue'],                'They missed the riddle clue near the desk for 4 minutes.')
      ]
    },
    {
      id: uid(),
      gameId: lab.id,
      teamSize: 5,
      experience: 'new',
      date: dateAt(5),
      sessionCode: 'LAB-77CD',
      timerElapsed: 3600,
      timerRunning: false,
      timerStartedAt: null,
      ended: true,
      notes: [
        mk(220,  'd1', ['Game Flow Issue'],     'New players took a while to orient — tutorial feels missing.'),
        mk(720,  'd2', ['Puzzle Logic Issue'],  'Centrifuge puzzle: pattern is too subtle.'),
        mk(800,  'd3', ['Frustration'],         'They tried 6 wrong combos. Logic is broken.'),
        mk(1900, 'd1', ['Tech Issue'],          'Audio cue on door didn\'t fire.'),
        mk(2600, 'd2', ['Wow Moment'],          'The reveal in the back room was great.')
      ]
    }
  ]
}

const seedActionItems = (sessions) => [
  {
    id: uid(),
    text: 'Redesign Puzzle 4 symbol mapping for clarity',
    status: 'in_progress',
    relatedCategory: 'Puzzle Logic Issue',
    relatedKeyword: 'puzzle 4',
    sourceSessionIds: sessions.slice(0, 2).map(s => s.id),
    createdAt: Date.now() - 3 * 86400000
  },
  {
    id: uid(),
    text: 'Add an early on-ramp puzzle for new teams',
    status: 'open',
    relatedCategory: 'Game Flow Issue',
    relatedKeyword: 'orient',
    sourceSessionIds: [sessions[2].id],
    createdAt: Date.now() - 5 * 86400000
  }
]

const initial = (() => {
  const games = seedGames()
  const sessions = seedSessions(games)
  return {
    designers: [...DESIGNERS_SEED],
    activeDesignerId: 'd1',
    categories: [...DEFAULT_CATEGORIES],
    games,
    sessions,
    activeSessionId: null,
    mode: 'home',         // 'home' | 'setup' | 'live' | 'review' | 'trends' | 'admin'
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

    // Designer CRUD
    case 'ADD_DESIGNER': {
      const id = 'd_' + uid()
      const designer = {
        id,
        name: action.name || 'New designer',
        initials: action.initials || initialsFromName(action.name),
        color: action.color || '#94a3b8'
      }
      return { ...state, designers: [...state.designers, designer] }
    }
    case 'UPDATE_DESIGNER': {
      return {
        ...state,
        designers: state.designers.map(d => d.id === action.id ? { ...d, ...action.patch } : d)
      }
    }
    case 'DELETE_DESIGNER': {
      // Only delete if not in active use
      const inUse = state.sessions.some(s => s.notes.some(n => n.designerId === action.id))
      if (inUse) return state
      const next = { ...state, designers: state.designers.filter(d => d.id !== action.id) }
      if (next.activeDesignerId === action.id) {
        next.activeDesignerId = next.designers[0]?.id || null
      }
      return next
    }

    // Game CRUD
    case 'ADD_GAME': {
      const id = 'g_' + uid()
      return {
        ...state,
        games: [...state.games, { id, name: action.name.trim(), createdAt: Date.now() }]
      }
    }
    case 'UPDATE_GAME': {
      return {
        ...state,
        games: state.games.map(g => g.id === action.id ? { ...g, ...action.patch } : g)
      }
    }
    case 'DELETE_GAME': {
      const inUse = state.sessions.some(s => s.gameId === action.id)
      if (inUse) return state
      return { ...state, games: state.games.filter(g => g.id !== action.id) }
    }

    case 'CREATE_SESSION': {
      const session = {
        id: uid(),
        gameId: action.gameId,
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
    case 'UPDATE_SESSION_META': {
      return mapSession(state, action.sessionId, s => ({ ...s, ...action.patch }))
    }
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
        kind: action.kind || 'note',
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

  // Tick running timer once per second
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
    designerById: (id) => state.designers.find(d => d.id === id),
    gameById: (id) => state.games.find(g => g.id === id),
    gameName: (id) => state.games.find(g => g.id === id)?.name || '(deleted game)',
    newestGame: () => [...state.games].sort((a, b) => b.createdAt - a.createdAt)[0] || null
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
