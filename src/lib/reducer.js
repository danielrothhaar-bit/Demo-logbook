// Pure reducer + seeds. No React imports — must be importable from both
// the Vite client bundle AND the Node server.

export const DEFAULT_CATEGORIES = [
  'Game Flow Issue',
  'Puzzle Logic Issue',
  'Tech Issue',
  'Wow Moment',
  'Frustration',
  'Hint',
  'Clue',
  'Puzzle Solved',
  'SFX',
  'Quote',
  'Feedback Discussion'
]

export const CATEGORY_COLORS = {
  'Game Flow Issue':     '#fb923c',
  'Puzzle Logic Issue':  '#a78bfa',
  'Tech Issue':          '#f472b6',
  'Wow Moment':          '#34d399',
  'Frustration':         '#fb7185',
  'Hint':                '#fbbf24',
  'Clue':                '#facc15',
  'Puzzle Solved':       '#2dd4bf',
  'SFX':                 '#f0abfc',
  'SUE':                 '#f97316',
  'Quote':               '#a5b4fc',
  'Feedback Discussion': '#22d3ee'
}

export const NEGATIVE_CATEGORIES = new Set(['Game Flow Issue', 'Puzzle Logic Issue', 'Tech Issue', 'Frustration'])
export const POSITIVE_CATEGORIES = new Set(['Wow Moment', 'Puzzle Solved'])

const DESIGNERS_SEED = [
  { id: 'd1', name: 'Daniel',  initials: 'DR', color: '#f59e0b' },
  { id: 'd2', name: 'Maya',    initials: 'MK', color: '#06b6d4' },
  { id: 'd3', name: 'Sam',     initials: 'SP', color: '#a855f7' }
]

// ------- Helpers (exported so the client wrapper can pre-generate IDs) -------

export const uid = () => Math.random().toString(36).slice(2, 10)

export function genCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const pick = (s, n) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('')
  return `${pick(letters, 4)}-${pick(digits, 2)}${pick(letters, 1)}${pick(digits, 1)}`
}

export function initialsFromName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ------- Seed factories -------

function seedGames() {
  const now = Date.now()
  return [
    {
      id: 'g_vault', name: 'The Vault', createdAt: now - 90 * 86400000,
      puzzles: [
        { id: 'p_keypad',  name: 'Keypad'        },
        { id: 'p_riddle',  name: 'Desk Riddle'   },
        { id: 'p_p4',      name: 'Puzzle 4'      },
        { id: 'p_vault',   name: 'Vault Door'    }
      ],
      components: [
        { id: 'c_safe',    name: 'Safe'          },
        { id: 'c_panel',   name: 'Symbol Panel'  },
        { id: 'c_magnet',  name: 'Magnet Lock'   },
        { id: 'c_light',   name: 'Fluorescent Light' }
      ]
    },
    {
      id: 'g_lab', name: 'Forgotten Lab', createdAt: now - 30 * 86400000,
      puzzles: [
        { id: 'p_centrifuge', name: 'Centrifuge Puzzle' },
        { id: 'p_door',       name: 'Final Door'        }
      ],
      components: [
        { id: 'c_audio',  name: 'Audio Cue'  },
        { id: 'c_door',   name: 'Lab Door'   }
      ]
    },
    {
      id: 'g_attic', name: "Grandmother's Attic", createdAt: now - 7 * 86400000,
      puzzles: [], components: []
    }
  ]
}

function seedSessions(games) {
  const dateAt = (daysAgo) => {
    const d = new Date()
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
      id: uid(), gameId: vault.id, teamSize: 4, experience: 'experienced',
      date: dateAt(21), sessionCode: 'VAULT-A12B',
      timerElapsed: 3580, timerRunning: false, timerStartedAt: null, ended: true,
      notes: [
        mk(180,  'd1', ['Game Flow Issue'],     'Team flew through the keypad — too easy?'),
        mk(645,  'd2', ['Frustration'],         'Stuck on Puzzle 4 for 3+ minutes, no progress.'),
        mk(720,  'd1', ['Puzzle Logic Issue'],  "Puzzle 4 logic is unclear — they don't see the mapping."),
        mk(910,  'd3', ['Hint'],                'GM hinted on Puzzle 4 finally.'),
        mk(1640, 'd2', ['Wow Moment'],          'Vault door opening got an audible gasp.'),
        mk(2200, 'd1', ['Game Flow Issue'],     'Pacing dipped after the vault — energy dropped.'),
        mk(2900, 'd3', ['Puzzle Solved'],       'Final lock cracked with 10 seconds to spare.')
      ]
    },
    {
      id: uid(), gameId: vault.id, teamSize: 3, experience: 'enthusiast',
      date: dateAt(14), sessionCode: 'VAULT-B41C',
      timerElapsed: 3200, timerRunning: false, timerStartedAt: null, ended: true,
      notes: [
        mk(540,  'd1', ['Puzzle Logic Issue'],  'Puzzle 4 — even enthusiasts confused by the symbol mapping.'),
        mk(610,  'd2', ['Frustration'],         'P4 again. Symbols on the panel are not legible.'),
        mk(1300, 'd1', ['Tech Issue'],          'Magnet lock on safe stuck briefly.'),
        mk(1700, 'd3', ['Wow Moment'],          'Hidden compartment reveal — huge reaction.'),
        mk(2400, 'd2', ['Clue'],                'They missed the riddle clue near the desk for 4 minutes.')
      ]
    },
    {
      id: uid(), gameId: lab.id, teamSize: 5, experience: 'new',
      date: dateAt(5), sessionCode: 'LAB-77CD',
      timerElapsed: 3600, timerRunning: false, timerStartedAt: null, ended: true,
      notes: [
        mk(220,  'd1', ['Game Flow Issue'],     'New players took a while to orient — tutorial feels missing.'),
        mk(720,  'd2', ['Puzzle Logic Issue'],  'Centrifuge puzzle: pattern is too subtle.'),
        mk(800,  'd3', ['Frustration'],         'They tried 6 wrong combos. Logic is broken.'),
        mk(1900, 'd1', ['Tech Issue'],          "Audio cue on door didn't fire."),
        mk(2600, 'd2', ['Wow Moment'],          'The reveal in the back room was great.')
      ]
    }
  ]
}

function seedActionItems(sessions) {
  return [
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
      sourceSessionIds: sessions[2] ? [sessions[2].id] : [],
      createdAt: Date.now() - 5 * 86400000
    }
  ]
}

// ------- Initial state -------

// Persisted slice: what the server keeps in the volume.
export const PERSISTED_KEYS = ['designers', 'categories', 'games', 'sessions', 'actionItems']

export function initialPersistedState() {
  const games = seedGames()
  const sessions = seedSessions(games)
  return {
    designers: [...DESIGNERS_SEED],
    categories: [...DEFAULT_CATEGORIES],
    games,
    sessions,
    actionItems: seedActionItems(sessions)
  }
}

// Full state (persisted slice + UI state) — used on the client.
export function initialState() {
  return {
    ...initialPersistedState(),
    // Per-device, restored from localStorage in store.jsx; null means
    // "nobody picked yet" and the live UI prompts the user to choose.
    activeDesignerId: null,
    activeSessionId: null,
    reviewSessionId: null,
    mode: 'home',
    hydrated: false
  }
}

export function pickPersistedSlice(state) {
  const out = {}
  for (const k of PERSISTED_KEYS) out[k] = state[k]
  return out
}

// ------- Reducer -------

function mapSession(state, id, fn) {
  return { ...state, sessions: state.sessions.map(s => s.id === id ? fn(s) : s) }
}

function updateGameField(state, gameId, field, fn) {
  return {
    ...state,
    games: state.games.map(g => g.id === gameId ? { ...g, [field]: fn(g[field] || []) } : g)
  }
}

// Actions that should never sync to the server (UI / per-device state).
export const CLIENT_ONLY_ACTIONS = new Set([
  'SET_MODE',
  'OPEN_SESSION_LIVE',
  'OPEN_SESSION_REVIEW',
  'SET_ACTIVE_DESIGNER',
  'TIMER_TICK',
  '@@HYDRATE'
])

export function reducer(state, action) {
  switch (action.type) {
    // Client-only UI actions
    case 'SET_MODE':              return { ...state, mode: action.mode }
    case 'SET_ACTIVE_DESIGNER':   return { ...state, activeDesignerId: action.id }
    case 'OPEN_SESSION_LIVE':     return { ...state, activeSessionId: action.id, mode: 'live' }
    case 'OPEN_SESSION_REVIEW':   return { ...state, reviewSessionId: action.id, mode: 'review' }
    case 'TIMER_TICK': {
      return mapSession(state, action.sessionId, s => {
        if (!s.timerRunning || !s.timerStartedAt) return s
        const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000)
        return { ...s, timerElapsed: elapsed }
      })
    }

    // Hydration: replace the persisted slice from a server fetch.
    case '@@HYDRATE': {
      const next = { ...state, hydrated: true }
      for (const k of PERSISTED_KEYS) {
        if (action.state[k] !== undefined) next[k] = action.state[k]
      }
      // Migrations: ensure newer fields exist on data persisted before they were added
      next.games = (next.games || []).map(g => ({
        ...g,
        puzzles: (g.puzzles || []).map(p => ({
          ...p,
          code: p.code || '',
          benchmark: p.benchmark || '',
          benchmarkName: p.benchmarkName || '',
          dependsOn: Array.isArray(p.dependsOn) ? p.dependsOn : [],
          goalMinutes: typeof p.goalMinutes === 'number' && !isNaN(p.goalMinutes)
            ? p.goalMinutes
            : null
        })),
        components: (g.components || []).map(c => ({
          ...c,
          code: c.code || '',
          hasTech: !!c.hasTech
        }))
      }))
      next.sessions = (next.sessions || []).map(s => ({
        ...s,
        time: s.time ?? '',
        timerFirstStartedAt: s.timerFirstStartedAt ?? null,
        timerAdjustment: s.timerAdjustment ?? 0,
        notes: (s.notes || []).map(n => ({
          ...n,
          puzzleIds: n.puzzleIds || [],
          componentIds: n.componentIds || [],
          audioUrl: n.audioUrl ?? null
        }))
      }))
      // If the active designer was deleted on another device, drop the
      // selection so the user is prompted to pick again rather than
      // silently logging as someone else.
      if (next.activeDesignerId && !next.designers.some(d => d.id === next.activeDesignerId)) {
        next.activeDesignerId = null
      }
      return next
    }

    // Persisted actions
    case 'SET_CATEGORIES':
      return { ...state, categories: action.categories }

    case 'ADD_DESIGNER': {
      const id = action.id || ('d_' + uid())
      const designer = {
        id,
        name: action.name || 'New user',
        initials: action.initials || initialsFromName(action.name),
        color: action.color || '#94a3b8'
      }
      return { ...state, designers: [...state.designers, designer] }
    }
    case 'UPDATE_DESIGNER':
      return { ...state, designers: state.designers.map(d => d.id === action.id ? { ...d, ...action.patch } : d) }
    case 'DELETE_DESIGNER': {
      const inUse = state.sessions.some(s => s.notes.some(n => n.designerId === action.id))
      if (inUse) return state
      const next = { ...state, designers: state.designers.filter(d => d.id !== action.id) }
      if (next.activeDesignerId === action.id) next.activeDesignerId = next.designers[0]?.id || null
      return next
    }

    case 'ADD_GAME': {
      const id = action.id || ('g_' + uid())
      return {
        ...state,
        games: [...state.games, {
          id, name: action.name.trim(), createdAt: action.createdAt || Date.now(),
          puzzles: [], components: []
        }]
      }
    }
    case 'UPDATE_GAME':
      return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, ...action.patch } : g) }
    case 'DELETE_GAME': {
      const inUse = state.sessions.some(s => s.gameId === action.id)
      if (inUse) return state
      return { ...state, games: state.games.filter(g => g.id !== action.id) }
    }

    // Per-game puzzles
    case 'ADD_PUZZLE':
      return updateGameField(state, action.gameId, 'puzzles', list => [
        ...list, {
          id: action.id || ('p_' + uid()),
          name: action.name.trim(),
          code: (action.code || '').trim(),
          benchmark: (action.benchmark || '').trim(),
          benchmarkName: (action.benchmarkName || '').trim(),
          dependsOn: Array.isArray(action.dependsOn) ? action.dependsOn : [],
          goalMinutes: typeof action.goalMinutes === 'number' && !isNaN(action.goalMinutes)
            ? action.goalMinutes
            : null
        }
      ])
    case 'UPDATE_PUZZLE':
      return updateGameField(state, action.gameId, 'puzzles', list =>
        list.map(p => p.id === action.id ? { ...p, ...action.patch } : p))
    case 'DELETE_PUZZLE':
      return updateGameField(state, action.gameId, 'puzzles', list =>
        list
          .filter(p => p.id !== action.id)
          // Strip the deleted id from any other puzzle's dependsOn so we don't
          // leave dangling references that would silently break solve-time math.
          .map(p => Array.isArray(p.dependsOn) && p.dependsOn.includes(action.id)
            ? { ...p, dependsOn: p.dependsOn.filter(d => d !== action.id) }
            : p))

    // Per-game components
    case 'ADD_COMPONENT':
      return updateGameField(state, action.gameId, 'components', list => [
        ...list, {
          id: action.id || ('c_' + uid()),
          name: action.name.trim(),
          code: (action.code || '').trim(),
          hasTech: !!action.hasTech
        }
      ])
    case 'UPDATE_COMPONENT':
      return updateGameField(state, action.gameId, 'components', list =>
        list.map(c => c.id === action.id ? { ...c, ...action.patch } : c))
    case 'DELETE_COMPONENT':
      return updateGameField(state, action.gameId, 'components', list =>
        list.filter(c => c.id !== action.id))

    case 'CREATE_SESSION': {
      const session = {
        id: action.id || uid(),
        gameId: action.gameId,
        teamSize: action.teamSize,
        experience: action.experience,
        date: action.date,
        time: action.time || '',
        sessionCode: action.sessionCode || genCode(),
        timerElapsed: 0,
        timerRunning: false,
        timerStartedAt: null,
        timerFirstStartedAt: null,
        timerAdjustment: 0,
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
    case 'UPDATE_SESSION_META':
      return mapSession(state, action.sessionId, s => ({ ...s, ...action.patch }))
    case 'DELETE_SESSION': {
      const next = { ...state, sessions: state.sessions.filter(s => s.id !== action.sessionId) }
      if (next.activeSessionId === action.sessionId) next.activeSessionId = null
      if (next.reviewSessionId === action.sessionId) next.reviewSessionId = null
      return next
    }
    case 'RESTART_SESSION': {
      const session = state.sessions.find(s => s.id === action.sessionId)
      if (!session) return state
      return {
        ...mapSession(state, action.sessionId, s => ({ ...s, ended: false })),
        activeSessionId: action.sessionId,
        reviewSessionId: null,
        mode: 'live'
      }
    }
    case 'TIMER_START': {
      // Anchor the start so that (now - timerStartedAt) === timerElapsed at this
      // instant. Works for fresh starts (elapsed=0) and resumes (elapsed=N) alike,
      // and is deterministic between client and server because action.startedAt
      // is filled in client-side.
      const startedAt = action.startedAt || Date.now()
      return mapSession(state, action.sessionId, s => ({
        ...s,
        timerRunning: true,
        timerStartedAt: startedAt - (s.timerElapsed || 0) * 1000,
        // Real-world wall-clock time the run actually began. Set once and never
        // overwritten — pause/resume must not reset this.
        timerFirstStartedAt: s.timerFirstStartedAt || startedAt
      }))
    }
    case 'TIMER_PAUSE':
      return mapSession(state, action.sessionId, s => {
        if (!s.timerRunning) return s
        const elapsed = action.elapsed != null
          ? action.elapsed
          : Math.floor((Date.now() - s.timerStartedAt) / 1000)
        return { ...s, timerRunning: false, timerElapsed: elapsed, timerStartedAt: null }
      })
    case 'TIMER_RESET':
      return mapSession(state, action.sessionId, s => ({
        ...s, timerRunning: false, timerElapsed: 0, timerStartedAt: null, timerFirstStartedAt: null,
        timerAdjustment: 0
      }))
    case 'TIMER_ADJUST': {
      // delta > 0 means "give the demo more time" (countdown gets bigger).
      // delta < 0 means "take time away" (countdown shrinks / overtime grows).
      const delta = action.delta || 0
      if (!delta) return state
      return mapSession(state, action.sessionId, s => {
        const newAdjustment = (s.timerAdjustment || 0) + delta
        if (s.timerRunning && s.timerStartedAt) {
          // Push start later for +delta so less time has elapsed, earlier for -delta.
          return { ...s, timerStartedAt: s.timerStartedAt + delta * 1000, timerAdjustment: newAdjustment }
        }
        return {
          ...s,
          timerElapsed: (s.timerElapsed || 0) - delta,
          timerAdjustment: newAdjustment
        }
      })
    }
    case 'END_SESSION': {
      const next = mapSession(state, action.sessionId, s => ({
        ...s,
        ended: true,
        timerRunning: false,
        timerElapsed: action.elapsed != null
          ? action.elapsed
          : (s.timerRunning && s.timerStartedAt ? Math.floor((Date.now() - s.timerStartedAt) / 1000) : s.timerElapsed),
        timerStartedAt: null
      }))
      // Clear active demo so Live tab returns to the listing next time
      return next.activeSessionId === action.sessionId ? { ...next, activeSessionId: null } : next
    }

    case 'ADD_NOTE': {
      const note = {
        id: action.id || uid(),
        timestamp: action.timestamp,
        designerId: action.designerId,
        categories: action.categories || [],
        puzzleIds: action.puzzleIds || [],
        componentIds: action.componentIds || [],
        text: action.text,
        photoUrl: action.photoUrl || null,
        audioUrl: action.audioUrl || null,
        kind: action.kind || 'note',
        createdAt: action.createdAt || Date.now()
      }
      return mapSession(state, action.sessionId, s => ({ ...s, notes: [...s.notes, note] }))
    }
    case 'UPDATE_NOTE':
      return mapSession(state, action.sessionId, s => ({
        ...s, notes: s.notes.map(n => n.id === action.noteId ? { ...n, ...action.patch } : n)
      }))
    case 'DELETE_NOTE':
      return mapSession(state, action.sessionId, s => ({
        ...s, notes: s.notes.filter(n => n.id !== action.noteId)
      }))

    case 'ADD_ACTION_ITEM':
      return {
        ...state,
        actionItems: [{
          id: action.item.id || uid(),
          createdAt: action.item.createdAt || Date.now(),
          status: 'open',
          ...action.item
        }, ...state.actionItems]
      }
    case 'UPDATE_ACTION_ITEM':
      return {
        ...state,
        actionItems: state.actionItems.map(a => a.id === action.id ? { ...a, ...action.patch } : a)
      }

    default:
      return state
  }
}
