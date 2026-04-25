// One-shot migration: ensure the live deployment has the
// "Murder with a Side of Meatballs" game with its full puzzle + component
// lists.
//
// Usage:
//   node scripts/seed-murder.mjs https://demo-logbook-production.up.railway.app
//
// Idempotent — running it twice won't create duplicates: it skips any
// puzzle/component already present (by name for puzzles, by code-or-name
// for components).

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) {
  console.error('Usage: node scripts/seed-murder.mjs <base-url>')
  process.exit(1)
}

const GAME_NAME = 'Murder with a Side of Meatballs'

const PUZZLES = [
  'Firewood', 'Sensory Shelf', 'Sauce Pot', 'Cheese Toss', 'Meatball Scan', 'Final Selection',
  'Magnetic Key', 'Gum Digits', 'Bus Tub', 'Pans', 'Dish Racks', 'Utensil Hang', 'Pizza Oven',
  'To Go Station', "Alfonso's Locker", 'Clear 3 Suspects',
  'Host Stand', 'Bar Tap', 'Alibis', 'Wine Crate', 'Wine Rack', 'POS System', 'Evidence Scanner'
]

const COMPONENTS_RAW = `
MB-001 Evidence Case
MB-002 Evidence Markers
MB-003 Drinks
MB-004 Scannable Evidence
MB-005 Menu
MB-006 Server Booklet
MB-007 Wine Bottles
MB-008 Bus Tub
MB-009 Feedback Sheets
MB-010 Utensils
MB-011 Dish Rack (red)
MB-012 Dish Rack (blue)
MB-013 Prep Station Food
MB-014 Pizza Spatula
MB-015 Pizza
MB-016 Trash
MB-017 Charred Recipe
MB-018 Food Containers
MB-019 Recipe Book
MB-101 Investigation Board
MB-102 Dining Room Window
MB-103 Dining Room Table
MB-104 Bar
MB-105 Serving Tray
MB-106 Tap Pull
MB-107 Gum Digits
MB-108 Host Stand
MB-109 Wine Crate
MB-110 Wine Rack
MB-111 POS System
MB-112 Chalk Outline
MB-113 Framed Photos
MB-114 Chalkboard
MB-115 Clock
MB-116 Champagne Box
MB-117 Dining Room Clue TV
MB-118 Entry Door Skin
MB-119 Beams
MB-120 Dining Room Walls, Floors, Ceilings
MB-121 Brandy Spill
MB-201 Double Doors
MB-202 Lockers
MB-203 Feedback Bin
MB-204 Employee Cork Board
MB-205 Service Walls, Floors, Ceilings
MB-301 Informant Window
MB-302 To Go Station
MB-303 Sink
MB-304 Dish Rack
MB-305 Prep Station
MB-306 Hood
MB-307 Stove
MB-308 Pizza Oven
MB-309 Pans
MB-310 Mouse Vent
MB-311 Utensil Match
MB-312 Spatula Holder
MB-313 Cheese Toss Vents
MB-314 Pipe Drop
MB-315 Kitchen Decor
MB-316 Prep Clue TV
MB-317 Freezer Door
MB-318 Prep Walls, Floor, Ceiling
MB-401 Tetris Shelf
MB-402 Poster Compartment
MB-403 Conspiracy Board
MB-404 Drop Shelf
MB-405 Pantry Walls, Floor, Ceiling
MB-501 Control Station
MB-502 Brain MCP
MB-503 AV / IT Package
MB-504 Lighting Package
MB-505 Clue Box
MB-601 Purchase and Install
MB-602 Vinyls and Printables
MB-603 Lumber and Trim Package
`.trim()

const COMPONENTS = COMPONENTS_RAW.split('\n').map(line => {
  const m = line.trim().match(/^(MB-\d+)\s+(.+)$/)
  if (!m) throw new Error('Bad component line: ' + line)
  return { code: m[1], name: m[2].trim() }
})

async function getState() {
  const r = await fetch(BASE + '/api/state')
  if (!r.ok) throw new Error('GET /api/state ' + r.status)
  return r.json()
}

// Retry with exponential backoff on transient failures (502/503/504/network).
async function dispatch(action, attempt = 1) {
  try {
    const r = await fetch(BASE + '/api/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action })
    })
    if (r.ok) return await r.json()
    if (attempt <= 5 && [502, 503, 504, 429].includes(r.status)) {
      const delay = 500 * Math.pow(2, attempt - 1)
      console.log(`\n  ↻ ${r.status}, retry ${attempt} in ${delay}ms`)
      await new Promise(res => setTimeout(res, delay))
      return dispatch(action, attempt + 1)
    }
    throw new Error('POST ' + r.status + ' for ' + JSON.stringify(action).slice(0, 80))
  } catch (e) {
    if (attempt <= 5 && (e.code === 'ECONNRESET' || e.message.includes('fetch failed'))) {
      const delay = 500 * Math.pow(2, attempt - 1)
      console.log(`\n  ↻ ${e.message}, retry ${attempt} in ${delay}ms`)
      await new Promise(res => setTimeout(res, delay))
      return dispatch(action, attempt + 1)
    }
    throw e
  }
}

const main = async () => {
  console.log('→ fetching current state from', BASE)
  let { state } = await getState()

  let game = state.games.find(g => g.name === GAME_NAME)
  if (!game) {
    console.log('→ game missing, creating it')
    const out = await dispatch({ type: 'ADD_GAME', name: GAME_NAME })
    state = out.state
    game = state.games.find(g => g.name === GAME_NAME)
    if (!game) throw new Error('Game still missing after ADD_GAME')
  } else {
    console.log('→ game already exists, will only add missing items')
  }

  const havePuzzleNames = new Set((game.puzzles || []).map(p => p.name.toLowerCase()))
  let added = 0
  for (const name of PUZZLES) {
    if (havePuzzleNames.has(name.toLowerCase())) continue
    await dispatch({ type: 'ADD_PUZZLE', gameId: game.id, name })
    added++
    process.stdout.write('.')
  }
  console.log(`\n→ added ${added} puzzles (skipped ${PUZZLES.length - added} already present)`)

  // Refresh state
  state = (await getState()).state
  game = state.games.find(g => g.id === game.id)
  const haveComponentKeys = new Set(
    (game.components || []).map(c => (c.code || c.name).toLowerCase())
  )

  added = 0
  for (const c of COMPONENTS) {
    const key = (c.code || c.name).toLowerCase()
    if (haveComponentKeys.has(key)) continue
    await dispatch({ type: 'ADD_COMPONENT', gameId: game.id, name: c.name, code: c.code })
    added++
    process.stdout.write('.')
  }
  console.log(`\n→ added ${added} components (skipped ${COMPONENTS.length - added} already present)`)

  // Sanity check
  state = (await getState()).state
  game = state.games.find(g => g.id === game.id)
  console.log('✓ done. game now has', game.puzzles.length, 'puzzles and', game.components.length, 'components')
}

main().catch((e) => {
  console.error('migration failed:', e.message)
  process.exit(1)
})
