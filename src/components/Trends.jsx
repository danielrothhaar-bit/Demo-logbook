import React, { useEffect, useMemo, useState } from 'react'
import { useStore, fmtTime, fmtCountdown, fmtClockTime, parseBenchmark, DEMO_TARGET_SEC } from '../store.jsx'
import { aggregateAcrossSessions, aggregatePuzzleSolveTimes } from '../utils/synthesis.js'
import ClickablePhoto from './ClickablePhoto.jsx'
import NoteEditor from './NoteEditor.jsx'
import ActionItems from './ActionItems.jsx'

// Distinct clue/hint colors used across all clue/hint UI in Trends. The
// global CATEGORY_COLORS for these two are both yellow-ish, which makes
// stacked bars + per-row coloring blend together — locally we lean on yellow
// for clues and violet for hints (matching the Live action button accents)
// so the two are immediately distinguishable.
const CLUE_COLOR = '#facc15'
const HINT_COLOR = '#a78bfa'

const PAGES = [
  { id: 'trends',  label: 'Puzzle Trends' },
  { id: 'tech',    label: 'Tech Issues' },
  { id: 'changes', label: 'Puzzle Issues' },
  { id: 'clues',   label: 'Clues/Hints' },
  { id: 'actions', label: 'Action Items' },
  { id: 'photos',  label: 'Team Photos' }
]

export default function Trends() {
  const { state, categoryColor, gameById, newestGame } = useStore()
  const games = state.games
  // Default to the newest game on each entry into Trends.
  const [gameId, setGameId] = useState(() => newestGame()?.id || '')
  const [page, setPage] = useState('trends')

  return (
    <div className="px-4 pt-3 space-y-4">
      <div className="flex gap-1 bg-ink-800 border border-ink-700 rounded-full p-1 overflow-x-auto no-scrollbar">
        {PAGES.map(p => (
          <button
            key={p.id}
            onClick={() => setPage(p.id)}
            className={`flex-1 min-w-fit px-3 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
              page === p.id ? 'bg-accent-500 text-ink-50' : 'text-ink-200 active:bg-ink-700'
            }`}
          >{p.label}</button>
        ))}
      </div>

      {page === 'photos' ? (
        <TeamPhotos />
      ) : page === 'tech' ? (
        <IssueDigest
          kind="tech"
          category="Tech Issue"
          groupBy="component"
          emptyHint="Tech Issue notes from any demo will show up here, grouped by the component they're tagged with."
        />
      ) : page === 'changes' ? (
        <IssueDigest
          kind="changes"
          category="Puzzle Issue"
          groupBy="puzzle"
          emptyHint="Puzzle Issue notes from any demo will show up here, grouped by the puzzle they're tagged with."
        />
      ) : page === 'clues' ? (
        <ClueHintDigest />
      ) : page === 'actions' ? (
        <ActionItems embedded />
      ) : games.length === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center">
          <div className="font-semibold mb-1">No games yet</div>
          <div className="text-sm text-ink-400">Add games in Admin to see trends.</div>
        </div>
      ) : (
        <GameTrends
          games={games}
          gameId={gameId}
          setGameId={setGameId}
          gameById={gameById}
          state={state}
          categoryColor={categoryColor}
        />
      )}
    </div>
  )
}

const TEAM_TYPES = [
  { id: 'all',         label: 'All' },
  { id: 'new',         label: 'New' },
  { id: 'experienced', label: 'Experienced' },
  { id: 'enthusiast',  label: 'Enthusiast' }
]

// Each Trends subsection wraps content in this — gives a clickable header that
// toggles open/close, with the title rendered larger & white instead of the
// small uppercase grey labels used elsewhere in the app.
function CollapsibleSection({ title, hint, children, defaultOpen = true }) {
  return (
    <details {...(defaultOpen ? { open: true } : {})} className="group rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 active:bg-ink-700">
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-ink-50 leading-snug">{title}</div>
          {hint && <div className="text-xs text-ink-200 mt-0.5 font-normal">{hint}</div>}
        </div>
        <svg className="w-4 h-4 text-ink-400 transition-transform group-open:rotate-180 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3">
        {children}
      </div>
    </details>
  )
}

function GameTrends({ games, gameId, setGameId, gameById, state, categoryColor }) {
  const game = gameById(gameId) || games[0]
  const [teamFilter, setTeamFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')

  // Sessions narrowed to the active team-type and team-size filters.
  // Everything that aggregates below sees only these so the toggles affect
  // the whole view.
  const filteredSessions = useMemo(
    () => state.sessions.filter(s =>
      (teamFilter === 'all' || s.experience === teamFilter) &&
      (sizeFilter === 'all' || s.teamSize === sizeFilter)
    ),
    [state.sessions, teamFilter, sizeFilter]
  )
  // Counts per team type for the toggle header — lets you see at a glance
  // how much data there is to slice before you commit to a filter.
  const counts = useMemo(() => {
    const c = { all: 0, new: 0, experienced: 0, enthusiast: 0 }
    for (const s of state.sessions) {
      if (s.gameId !== game.id) continue
      c.all++
      if (c[s.experience] != null) c[s.experience]++
    }
    return c
  }, [state.sessions, game.id])
  // Counts per team size, scoped to the current game and team-type filter so
  // the visible sizes/counts reflect what's actually available given the
  // other active filter. Returned ascending by size for a stable pill order.
  const sizeCounts = useMemo(() => {
    const map = new Map()
    let total = 0
    for (const s of state.sessions) {
      if (s.gameId !== game.id) continue
      if (teamFilter !== 'all' && s.experience !== teamFilter) continue
      total++
      if (s.teamSize == null) continue
      map.set(s.teamSize, (map.get(s.teamSize) || 0) + 1)
    }
    const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
    return { total, entries }
  }, [state.sessions, game.id, teamFilter])
  // If the active size disappears after switching games or team-type, drop
  // back to "all" so the view doesn't silently render empty.
  useEffect(() => {
    if (sizeFilter === 'all') return
    if (!sizeCounts.entries.some(([size]) => size === sizeFilter)) {
      setSizeFilter('all')
    }
  }, [sizeCounts, sizeFilter])

  const agg = useMemo(() => aggregateAcrossSessions(filteredSessions, game.id), [filteredSessions, game.id])
  const solveTimes = useMemo(() => aggregatePuzzleSolveTimes(filteredSessions, game), [filteredSessions, game])
  // Newest first so the default sits at the top of the dropdown.
  const sortedGames = useMemo(
    () => [...games].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [games]
  )

  return (
    <>
      {/* Game switcher */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold flex-shrink-0">Game</span>
        <div className="relative flex-1">
          <select
            value={game.id}
            onChange={(e) => setGameId(e.target.value)}
            className="w-full appearance-none bg-ink-800 border border-ink-700 rounded-xl pl-3 pr-9 py-2.5 outline-none focus:border-accent-500 text-sm font-medium text-ink-100"
          >
            {sortedGames.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Team-type toggle — narrows every aggregate below to the picked experience */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-4 px-4">
          {TEAM_TYPES.map(t => {
            const active = teamFilter === t.id
            const count = counts[t.id] || 0
            const dimmed = count === 0 && t.id !== 'all'
            return (
              <button
                key={t.id}
                onClick={() => setTeamFilter(t.id)}
                disabled={dimmed}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-accent-500 text-ink-50 border-accent-500'
                    : 'bg-ink-800 text-ink-200 border-ink-700 active:bg-ink-700 disabled:opacity-40'
                }`}
              >
                <span>{t.label}</span>
                <span className={`text-[10px] tabular-nums ${active ? 'opacity-90' : 'text-ink-400'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Team-size toggle — narrows every aggregate below to the picked group size.
          Only sizes that actually appear (after the team-type filter) get pills. */}
      {sizeCounts.entries.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold px-1">Players</div>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-4 px-4">
            <button
              onClick={() => setSizeFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                sizeFilter === 'all'
                  ? 'bg-accent-500 text-ink-50 border-accent-500'
                  : 'bg-ink-800 text-ink-200 border-ink-700 active:bg-ink-700'
              }`}
            >
              <span>Any</span>
              <span className={`text-[10px] tabular-nums ${sizeFilter === 'all' ? 'opacity-90' : 'text-ink-400'}`}>
                {sizeCounts.total}
              </span>
            </button>
            {sizeCounts.entries.map(([size, count]) => {
              const active = sizeFilter === size
              return (
                <button
                  key={size}
                  onClick={() => setSizeFilter(size)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-accent-500 text-ink-50 border-accent-500'
                      : 'bg-ink-800 text-ink-200 border-ink-700 active:bg-ink-700'
                  }`}
                >
                  <span>{size}</span>
                  <span className={`text-[10px] tabular-nums ${active ? 'opacity-90' : 'text-ink-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <DemoStats game={game} agg={agg} />

      {agg.total === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-ink-400">
          {teamFilter === 'all' && sizeFilter === 'all'
            ? 'No demos logged for this game yet.'
            : `No demos match the current filters.`}
        </div>
      ) : (
        <>
          <CollapsibleSection
            title="Average solve timeline"
            hint="Where each puzzle lands on average across the filtered demos."
          >
            <PuzzleAverageTimeline perPuzzle={solveTimes.perPuzzle} game={game} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Clues and Hints"
            hint="Stacked total per puzzle, sorted by most asks first."
          >
            <CluesHintsBarChart game={game} puzzleStats={agg.puzzleStats} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Puzzle solve times"
            hint="Average, fastest, and slowest solve per puzzle."
          >
            <PuzzleSolveTimes solveTimes={solveTimes} game={game} puzzleStats={agg.puzzleStats} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Top problem puzzles"
            hint="Ranked by Frustration + Puzzle Issue notes."
          >
            <Leaderboard
              items={game.puzzles}
              stats={agg.puzzleStats}
              totalDemos={agg.total}
              scoreCategories={['Frustration', 'Puzzle Issue']}
              kind="puzzle"
              emptyText="No frustration or puzzle-issue notes on puzzles yet."
              tone="rose"
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Top problem components"
            hint="Ranked by Frustration + Puzzle Issue notes."
          >
            <Leaderboard
              items={game.components}
              stats={agg.componentStats}
              totalDemos={agg.total}
              scoreCategories={['Frustration', 'Puzzle Issue']}
              kind="component"
              emptyText="No frustration or puzzle-issue notes on components yet."
              tone="rose"
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Top wow moments"
            hint="Ranked by Wow Moment notes."
          >
            <Leaderboard
              items={[
                ...game.puzzles.map(p => ({ ...p, _kind: 'puzzle' })),
                ...game.components.map(c => ({ ...c, _kind: 'component' }))
              ]}
              stats={{ ...agg.puzzleStats, ...agg.componentStats }}
              totalDemos={agg.total}
              scoreCategories={['Wow Moment']}
              kind="mixed"
              emptyText="No wow moments tagged to puzzles or components yet."
              limit={5}
              tone="emerald"
            />
          </CollapsibleSection>
        </>
      )}
    </>
  )
}

function TeamPhotos() {
  const { state, gameById, designerById } = useStore()
  const [filterGameId, setFilterGameId] = useState('all')

  const photos = useMemo(() => {
    const out = []
    for (const s of state.sessions) {
      for (const n of s.notes) {
        if (!n.photoUrl) continue
        const tagged = (n.categories || []).some(c => c && c.toLowerCase() === 'team photo')
        if (!tagged) continue
        out.push({
          key: n.id,
          photoUrl: n.photoUrl,
          gameId: s.gameId,
          gameName: gameById(s.gameId)?.name || '(deleted game)',
          date: s.date,
          time: s.time,
          designer: designerById(n.designerId),
          text: n.text
        })
      }
    }
    // Most recent first (date string is YYYY-MM-DD so lexicographic sort works)
    return out.sort((a, b) => {
      const d = (b.date || '').localeCompare(a.date || '')
      return d !== 0 ? d : (b.time || '').localeCompare(a.time || '')
    })
  }, [state.sessions])

  const visible = filterGameId === 'all'
    ? photos
    : photos.filter(p => p.gameId === filterGameId)

  const games = [...new Map(photos.map(p => [p.gameId, { id: p.gameId, name: p.gameName }])).values()]

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-6 text-center">
        <div className="text-3xl mb-2">📸</div>
        <div className="font-semibold mb-1">No team photos yet</div>
        <div className="text-sm text-ink-400 leading-relaxed">
          Tag a note with <span className="font-mono text-ink-200">Team Photo</span> and attach a photo. Photos with this tag from any demo will show up here.
          <br />
          Add the tag in <span className="text-ink-200">Admin → Quick tags</span> if it doesn't exist yet.
        </div>
      </div>
    )
  }

  return (
    <>
      {games.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          <button
            onClick={() => setFilterGameId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
              filterGameId === 'all' ? 'bg-accent-500 text-ink-50 border-accent-500' : 'bg-ink-800 border-ink-700 text-ink-200'
            }`}
          >All ({photos.length})</button>
          {games.map(g => {
            const count = photos.filter(p => p.gameId === g.id).length
            return (
              <button
                key={g.id}
                onClick={() => setFilterGameId(g.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
                  filterGameId === g.id ? 'bg-accent-500 text-ink-50 border-accent-500' : 'bg-ink-800 border-ink-700 text-ink-200'
                }`}
              >{g.name} ({count})</button>
            )
          })}
        </div>
      )}

      <div className="text-xs text-ink-400 px-1">{visible.length} photo{visible.length === 1 ? '' : 's'}</div>

      <div className="grid grid-cols-2 gap-2">
        {visible.map(p => (
          <div key={p.key} className="rounded-2xl overflow-hidden bg-ink-800 border border-ink-700">
            <ClickablePhoto src={p.photoUrl} className="w-full aspect-square object-cover block" />
            <div className="p-2.5">
              <div className="text-xs font-semibold text-ink-100 truncate">{p.gameName}</div>
              <div className="text-[11px] text-ink-400 mt-0.5">
                {p.date}{p.time && ` · ${p.time}`}
              </div>
              {p.designer && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-ink-950"
                    style={{ backgroundColor: p.designer.color }}
                  >{p.designer.initials}</span>
                  <span className="text-[11px] text-ink-300 truncate">{p.designer.name}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function DemoStats({ game, agg }) {
  // One-decimal averages so a few hints/clues per demo show meaningfully.
  const fmtAvg = (count) => agg.total > 0
    ? (Math.round((count / agg.total) * 10) / 10).toString()
    : '—'
  const avgHints = fmtAvg(agg.categoryCounts.Hint || 0)
  const avgClues = fmtAvg(agg.categoryCounts.Clue || 0)
  // Compare hints vs clues so the magnitude is obvious at a glance.
  const hintsNum = parseFloat(avgHints)
  const cluesNum = parseFloat(avgClues)
  const compareText = !isNaN(hintsNum) && !isNaN(cluesNum)
    ? hintsNum === cluesNum
      ? 'roughly equal'
      : hintsNum > cluesNum
        ? `${(hintsNum - cluesNum).toFixed(1)} more hints than clues`
        : `${(cluesNum - hintsNum).toFixed(1)} more clues than hints`
    : null

  return (
    <CollapsibleSection title={game.name} hint={`${agg.total} demo${agg.total === 1 ? '' : 's'} logged`}>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Demos logged" value={String(agg.total)} />
        <Stat label="Wins" value={String(agg.wins || 0)} accent="emerald" />
        <Stat label="Losses" value={String(agg.losses || 0)} accent="rose" />
        <Stat label="Avg duration" value={agg.avgDuration ? fmtTime(agg.avgDuration) : '—'} />
        <Stat label="Avg hints / demo" value={avgHints} accent="amber" />
        <Stat label="Avg clues / demo" value={avgClues} accent="yellow" />
      </div>
      {compareText && (
        <div className="text-xs text-ink-200">{compareText}</div>
      )}
    </CollapsibleSection>
  )
}

const STAT_ACCENT = {
  default: 'text-ink-50',
  amber:   'text-amber-300',
  yellow:  'text-yellow-300',
  emerald: 'text-emerald-300',
  rose:    'text-rose-300'
}

function Stat({ label, value, accent = 'default' }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-200 font-medium">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-tight ${STAT_ACCENT[accent] || STAT_ACCENT.default}`}>
        {value}
      </div>
    </div>
  )
}

// Leaderboard sorts items by the sum of counts across the categories named in
// `scoreCategories`. Score = the headline number; ties broken by the first
// category in the list. `tone` controls the headline color.
function Leaderboard({ items, stats, totalDemos, scoreCategories, kind, emptyText, limit, tone = 'rose' }) {
  const enriched = (items || [])
    .map(item => {
      const s = stats[item.id] || { total: 0, negative: 0, positive: 0, demos: 0, perCategory: {}, notes: [] }
      const score = scoreCategories.reduce((sum, c) => sum + (s.perCategory[c] || 0), 0)
      return { ...item, stats: s, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Tie-break by the first scoring category.
      const cat = scoreCategories[0]
      const ac = a.stats.perCategory[cat] || 0
      const bc = b.stats.perCategory[cat] || 0
      return bc - ac
    })

  const visible = limit ? enriched.slice(0, limit) : enriched

  if (visible.length === 0) {
    return (
      <div className="rounded-xl bg-ink-900 border border-ink-700 p-4 text-sm text-ink-500 text-center">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {visible.map(item => (
        <LeaderboardRow key={item.id} item={item} totalDemos={totalDemos}
          kind={item._kind || kind} tone={tone} scoreCategories={scoreCategories} />
      ))}
    </div>
  )
}

const TONE_CLASS = {
  rose:    'text-rose-300',
  emerald: 'text-emerald-300'
}

function LeaderboardRow({ item, totalDemos, kind, tone, scoreCategories }) {
  const { designerById, categoryColor } = useStore()
  const [open, setOpen] = useState(false)
  const s = item.stats
  const kindIcon = kind === 'component' ? '⚙' : '🧩'
  const demoPct = totalDemos > 0 ? Math.round((s.demos / totalDemos) * 100) : 0

  return (
    <div className="rounded-xl bg-ink-900 border border-ink-700 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-3 active:bg-ink-800"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg flex-shrink-0 mt-0.5">{kindIcon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {item.code && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700 tabular-nums">
                  {item.code}
                </span>
              )}
              <span className="font-semibold truncate">{item.name}</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
              {s.demos} of {totalDemos} demos ({demoPct}%) · {s.total} note{s.total === 1 ? '' : 's'}
            </div>
            {/* Show counts per scoring category so the score is decomposable */}
            {scoreCategories.length > 1 && (
              <div className="flex items-center gap-3 text-[11px] mt-1 tabular-nums">
                {scoreCategories.map(c => (
                  <span key={c} style={{ color: categoryColor(c) }}>
                    <b>{s.perCategory[c] || 0}</b> {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={`text-3xl font-bold tabular-nums leading-none flex-shrink-0 ${TONE_CLASS[tone]}`}>
            {item.score}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-ink-700 bg-ink-950/40 p-3 space-y-2">
          {Object.keys(s.perCategory).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(s.perCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full font-medium tabular-nums"
                      style={{ backgroundColor: `${categoryColor(c)}22`, color: categoryColor(c) }}>
                  {c} · {n}
                </span>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            {s.notes.slice(0, 6).map(n => {
              const d = designerById(n.designerId)
              return (
                <div key={n.id} className="text-xs text-ink-200 bg-ink-900 rounded-lg p-2">
                  <span className="text-ink-400 mr-2 tabular-nums">{fmtCountdown(n.timestamp)}</span>
                  <span className="font-bold mr-1.5" style={{ color: d?.color }}>{d?.initials}</span>
                  <span className="text-ink-500 mr-2">({n.sessionDate})</span>
                  {n.text}
                </div>
              )
            })}
            {s.notes.length > 6 && (
              <div className="text-[11px] text-ink-500 italic px-1">
                + {s.notes.length - 6} more note{s.notes.length - 6 === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Average-solve timeline — mirrors the per-demo timeline in Review, but each
// dot is positioned at the puzzle's *average* solvedTs across all demos for
// the active filter. Benchmarks render the same way; dot color flips green/red
// for benchmarked puzzles depending on whether the avg is within the ±3-min
// goal window.
function PuzzleAverageTimeline({ perPuzzle, game }) {
  // Track which dot's tooltip is showing. CSS-only :hover would surface every
  // tooltip when overlapping dots share screen space, so we control it with
  // state instead — only one name visible at a time. Tap also toggles for
  // touch devices that have no hover.
  const [activeDot, setActiveDot] = useState(null)
  const sorted = (perPuzzle || [])
    .filter(p => p.avgSolvedTs != null)
    .sort((a, b) => a.avgSolvedTs - b.avgSolvedTs)

  const benchmarks = (perPuzzle || [])
    .map(p => ({ ...p, benchSec: parseBenchmark(p.benchmark) }))
    .filter(p => p.benchSec != null)
  const benchSecById = {}
  for (const b of benchmarks) benchSecById[b.id] = b.benchSec

  if (!sorted.length && !benchmarks.length) {
    return (
      <div className="rounded-xl bg-ink-900 border border-ink-700 p-4 text-center text-sm text-ink-500">
        No solve times recorded yet.
      </div>
    )
  }

  const span = Math.max(
    DEMO_TARGET_SEC,
    ...sorted.map(p => p.avgSolvedTs),
    ...benchmarks.map(p => p.benchSec)
  )

  const TICK_STEP = 600
  const ticks = []
  for (let t = 0; t <= span; t += TICK_STEP) ticks.push(t)
  const showTimerEnd = span >= DEMO_TARGET_SEC
  const TOLERANCE_SEC = 180

  // Same edge clamp as Review's timeline so chips stay within the card.
  const chipAlign = (pct) =>
    pct < 12 ? 'left-0' :
    pct > 88 ? 'right-0' :
    'left-1/2 -translate-x-1/2'

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto sm:overflow-visible no-scrollbar">
        <div className="min-w-[640px] sm:min-w-0">
        <div className="relative h-20 mt-6">
          {/* 10-minute grid ticks */}
          {ticks.map(t => {
            if (t === 0 || t > span) return null
            if (showTimerEnd && t === DEMO_TARGET_SEC) return null
            const pct = (t / span) * 100
            return (
              <div key={`grid-${t}`}
                className="absolute top-0 bottom-0 w-px bg-ink-700/50"
                style={{ left: `${pct}%` }}
              />
            )
          })}

          {/* Timer-end marker */}
          {showTimerEnd && (() => {
            const timerPct = (DEMO_TARGET_SEC / span) * 100
            return (
              <div className="absolute top-0 bottom-0 -translate-x-1/2" style={{ left: `${timerPct}%` }}>
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-rose-500/80" />
                <div className={`absolute -top-5 ${chipAlign(timerPct)} px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/60 text-[9px] font-bold text-rose-200 whitespace-nowrap`}>
                  ⏰ Timer end
                </div>
              </div>
            )
          })()}

          {/* Center axis bar */}
          <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-ink-700 rounded-full" />

          {/* Benchmark guide lines */}
          {benchmarks.map(p => {
            const pct = Math.min(100, Math.max(0, (p.benchSec / span) * 100))
            const label = p.benchmarkName || fmtCountdown(p.benchSec)
            return (
              <div
                key={`bench-${p.id}`}
                className="absolute top-0 bottom-0 -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-l border-dashed border-yellow-300/70" />
                <div
                  className={`absolute top-0 ${chipAlign(pct)} -translate-y-full px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/40 text-[10px] font-semibold text-yellow-200 whitespace-nowrap shadow-sm`}
                  title={`Benchmark · ${p.name} · ${fmtCountdown(p.benchSec)}`}
                >
                  ⏱ {label}
                </div>
              </div>
            )
          })}

          {/* Average solve dots — colored vs benchmark when one exists. Hover/tap
              activates a single tooltip via state so overlapping dots don't all
              show their names at once. */}
          {sorted.map((p, i) => {
            const pct = Math.min(100, Math.max(0, (p.avgSolvedTs / span) * 100))
            const benchSec = benchSecById[p.id]
            const hasBench = benchSec != null
            const onTime = hasBench && Math.abs(p.avgSolvedTs - benchSec) <= TOLERANCE_SEC
            const dotClass = !hasBench
              ? 'bg-yellow-400 shadow-yellow-400/30'
              : onTime
                ? 'bg-emerald-400 shadow-emerald-400/40'
                : 'bg-rose-500 shadow-rose-500/40'
            const deltaLabel = hasBench
              ? (() => {
                  const delta = p.avgSolvedTs - benchSec
                  const abs = Math.abs(delta)
                  if (abs === 0) return 'on goal'
                  return `${delta > 0 ? '+' : '−'}${fmtTime(abs)} ${delta > 0 ? 'after' : 'before'} goal`
                })()
              : null
            const isActive = activeDot === p.id
            return (
              <div
                key={p.id}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${pct}%`, zIndex: isActive ? 40 : 10 }}
                onMouseEnter={() => setActiveDot(p.id)}
                onMouseLeave={() => setActiveDot(prev => prev === p.id ? null : prev)}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDot(prev => prev === p.id ? null : p.id)
                }}
              >
                <span className={`block w-7 h-7 rounded-full ${dotClass} border-2 border-ink-800 flex items-center justify-center text-[12px] font-bold text-ink-950 leading-none shadow-lg cursor-pointer`}>
                  {i + 1}
                </span>
                {isActive && (
                  <div className={`absolute -top-9 ${chipAlign(pct)} px-2 py-1 rounded-md bg-ink-900 border border-ink-700 text-[11px] text-ink-100 font-medium whitespace-nowrap pointer-events-none z-40 shadow-xl`}>
                    {p.name}
                    <span className="text-ink-400 tabular-nums ml-1">· avg {fmtCountdown(p.avgSolvedTs)}</span>
                    {p.solvedDemoCount > 0 && (
                      <span className="text-ink-500 ml-1">({p.solvedDemoCount}×)</span>
                    )}
                    {deltaLabel && (
                      <span className={`ml-1 ${onTime ? 'text-emerald-300' : 'text-rose-300'}`}>· {deltaLabel}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Minute axis */}
        <div className="relative h-5">
          {ticks.map(t => {
            if (t > span) return null
            const pct = (t / span) * 100
            const isTimerEnd = showTimerEnd && t === DEMO_TARGET_SEC
            return (
              <div key={`label-${t}`}
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${pct}%` }}
              >
                <span className={`w-px h-1.5 ${isTimerEnd ? 'bg-rose-400' : 'bg-ink-500'}`} />
                <span className={`text-[10px] tabular-nums whitespace-nowrap ${
                  isTimerEnd ? 'text-rose-300 font-semibold' : 'text-ink-400'
                }`}>
                  {t / 60}m
                </span>
              </div>
            )
          })}
        </div>
        </div>{/* /min-w */}
        </div>{/* /overflow-x-auto */}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-400 pt-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> avg solve
          </span>
          {benchmarks.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> avg within ±3 min of benchmark
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> avg off benchmark by &gt;3 min
              </span>
            </>
          )}
        </div>
      </div>
  )
}

function PuzzleSolveTimes({ solveTimes, game, puzzleStats }) {
  const { perPuzzle, overallAvg, totalSolveEvents, avgGapBetween } = solveTimes

  // Reorder per the game's puzzle list (i.e. the order set in Admin) so the
  // trends list mirrors the puzzle order designers maintain there.
  const ordered = useMemo(() => {
    if (!game?.puzzles?.length) return perPuzzle
    const byId = new Map(perPuzzle.map(p => [p.id, p]))
    return game.puzzles.map(p => byId.get(p.id)).filter(Boolean)
  }, [perPuzzle, game])

  if (!ordered.length) {
    return (
      <div className="rounded-xl bg-ink-900 border border-ink-700 p-4 text-center text-sm text-ink-500">
        No puzzles defined for this game.
      </div>
    )
  }

  const maxAvg = Math.max(1, ...ordered.map(p => p.avgSolveTime || 0))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <Stat label="Avg solve time" value={overallAvg != null ? fmtTime(overallAvg) : '—'} />
        <Stat label="Avg gap between solves" value={avgGapBetween != null ? fmtTime(avgGapBetween) : '—'} />
      </div>

      <div className="space-y-1.5 pt-1">
        {ordered.map(p => (
          <PuzzleSolveRow
            key={p.id}
            puzzle={p}
            maxAvg={maxAvg}
            stats={puzzleStats?.[p.id]}
          />
        ))}
      </div>

      <BenchmarksSubsection perPuzzle={ordered} />
    </div>
  )
}

function PuzzleSolveRow({ puzzle: p, maxAvg, stats }) {
  const { dispatch } = useStore()
  const hasAvg = p.avgSolveTime != null
  const widthPct = hasAvg ? Math.max(8, (p.avgSolveTime / maxAvg) * 100) : 0
  const goalSec = p.goalMinutes != null ? p.goalMinutes * 60 : null
  // Goal-aware coloring:
  //   delta > 60s   → red    (more than a minute slower than goal)
  //   delta < -60s  → yellow (more than a minute faster than goal)
  //   |delta| ≤ 60s → green  (within ±1 min of goal)
  // Without a goal we fall back to the neutral white avg + yellow bar.
  let avgClass = 'text-ink-50'
  let barClass = 'bg-yellow-400/70'
  if (goalSec != null && hasAvg) {
    const delta = p.avgSolveTime - goalSec
    if (delta > 60) {
      avgClass = 'text-rose-400'
      barClass = 'bg-rose-400/70'
    } else if (delta < -60) {
      avgClass = 'text-yellow-300'
      barClass = 'bg-yellow-400/70'
    } else {
      avgClass = 'text-emerald-400'
      barClass = 'bg-emerald-400/70'
    }
  }
  const allSolves = p.solves || []
  const clueCount = stats?.perCategory?.Clue || 0
  const hintCount = stats?.perCategory?.Hint || 0

  const openDemo = (sessionId) => {
    dispatch({ type: 'OPEN_SESSION_REVIEW', id: sessionId })
  }

  return (
    <details className={`group rounded-lg bg-ink-900 border border-ink-700 ${hasAvg ? '' : 'opacity-60'}`}>
      <summary className="p-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          {p.code && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700 tabular-nums">{p.code}</span>
          )}
          <span className="font-semibold text-sm text-ink-50 truncate flex-1">{p.name}</span>
          {(clueCount > 0 || hintCount > 0) && (
            <span className="flex items-center gap-1 tabular-nums">
              {clueCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold border"
                      style={{ backgroundColor: `${CLUE_COLOR}22`, color: CLUE_COLOR, borderColor: `${CLUE_COLOR}55` }}
                      title={`${clueCount} clue${clueCount === 1 ? '' : 's'}`}>
                  💡 {clueCount}
                </span>
              )}
              {hintCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold border"
                      style={{ backgroundColor: `${HINT_COLOR}22`, color: HINT_COLOR, borderColor: `${HINT_COLOR}55` }}
                      title={`${hintCount} hint${hintCount === 1 ? '' : 's'}`}>
                  🤝 {hintCount}
                </span>
              )}
            </span>
          )}
          <span className="text-[11px] text-ink-300 tabular-nums">
            {allSolves.length > 0 ? `${allSolves.length} solve${allSolves.length === 1 ? '' : 's'}` : 'no solves'}
          </span>
          <svg
            className="w-3.5 h-3.5 text-ink-300 transition-transform group-open:rotate-180 flex-shrink-0"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2">
          {goalSec != null && (
            <SolveCell label="🎯 Goal" value={goalSec} colorClass="text-emerald-300" />
          )}
          <SolveCell label="Avg" value={p.avgSolveTime} colorClass={avgClass} />
          <SolveCell label="Fastest" value={p.fastestSolve} colorClass="text-ink-50" />
          <SolveCell label="Slowest" value={p.slowestSolve} colorClass="text-ink-50" />
        </div>
        {hasAvg && (
          <div className="w-full h-1 mt-2 bg-ink-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${widthPct}%` }} />
          </div>
        )}
      </summary>

      {allSolves.length > 0 && (
        <div className="border-t border-ink-700 px-2.5 py-2 space-y-1">
          {allSolves.map((s, i) => (
            <button
              key={`${s.sessionId}-${i}`}
              onClick={() => openDemo(s.sessionId)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-ink-800 active:bg-ink-700 text-xs"
            >
              <span className="text-ink-200 font-medium tabular-nums flex-shrink-0">
                {s.sessionDate}
              </span>
              {s.sessionTime && (
                <span className="text-ink-300 tabular-nums flex-shrink-0">{fmtClockTime(s.sessionTime)}</span>
              )}
              <span className="text-ink-400 flex-1 text-right tabular-nums">
                {s.timeOnPuzzle != null && s.timeOnPuzzle > 0
                  ? `took ${fmtTime(s.timeOnPuzzle)}`
                  : `solved ${fmtCountdown(s.solvedTs)}`}
              </span>
              {s.isSue && (
                <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 flex-shrink-0">
                  SUE
                </span>
              )}
              <svg className="w-3 h-3 text-ink-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </details>
  )
}

function SolveCell({ label, value, colorClass = 'text-ink-50' }) {
  return (
    <div className="text-left">
      <div className="text-xs uppercase tracking-wide text-ink-200 font-medium">{label}</div>
      <div className={`tabular-nums text-base font-semibold ${value != null ? colorClass : 'text-ink-500'}`}>
        {value != null ? fmtTime(value) : '—'}
      </div>
    </div>
  )
}

// Per-puzzle benchmark target vs the avg actual solve time across demos.
// Only renders puzzles where a benchmark was set on the puzzle in Admin.
function BenchmarksSubsection({ perPuzzle }) {
  const benchmarked = perPuzzle
    .map(p => ({ ...p, benchmarkSec: parseBenchmark(p.benchmark) }))
    .filter(p => p.benchmarkSec != null)

  if (benchmarked.length === 0) return null

  return (
    <div className="pt-3 mt-1 border-t border-ink-700 space-y-2">
      <div className="text-base font-bold text-yellow-300 flex items-center gap-1.5">
        <span>⏱</span> Benchmarks
      </div>
      <div className="text-sm text-ink-200 -mt-1">
        Target solve time vs averaged actual across demos. Negative delta = team is ahead of the benchmark.
      </div>
      {benchmarked.map(p => {
        const hasAvg = p.avgSolvedTs != null
        const delta = hasAvg ? p.avgSolvedTs - p.benchmarkSec : null
        const ahead = delta != null && delta < 0
        return (
          <div key={p.id} className="rounded-lg bg-ink-900 border border-yellow-500/30 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              {p.code && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700 tabular-nums">{p.code}</span>
              )}
              <span className="font-semibold text-base text-ink-50 truncate">{p.name}</span>
              {p.benchmarkName && (
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-200 border border-yellow-500/40 font-medium">
                  ⏱ {p.benchmarkName}
                </span>
              )}
              <span className="tabular-nums text-sm font-semibold text-yellow-300">target {fmtCountdown(p.benchmarkSec)}</span>
            </div>
            <div className="text-sm mt-1.5 tabular-nums flex items-center gap-2 flex-wrap">
              {hasAvg ? (
                <>
                  <span className="text-ink-200">avg solved {fmtCountdown(p.avgSolvedTs)} ({p.solvedDemoCount} demo{p.solvedDemoCount === 1 ? '' : 's'})</span>
                  <span className={`font-semibold ${ahead ? 'text-emerald-300' : delta === 0 ? 'text-ink-300' : 'text-rose-300'}`}>
                    {delta === 0 ? 'on target' : `${ahead ? '−' : '+'}${fmtTime(Math.abs(delta))} ${ahead ? 'ahead' : 'behind'}`}
                  </span>
                </>
              ) : (
                <span className="text-ink-300 italic">not solved yet in any demo</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Cross-session issue digest — drives both the Tech Issues and Puzzle Issues
// pages. Aggregates every note tagged with the configured category across all
// sessions, groups by component (tech) or puzzle (changes), and lets the
// designer escalate a row to Action Items or hide it from the digest.
//
// "Hidden" notes are tracked globally on state.hiddenNoteIds. The original
// note is never altered — it still lives on its session's review timeline.
// Toggle "Show hidden" to surface them again with a Restore button.
// ============================================================================

const ISSUE_TONE = {
  tech:    { dot: 'bg-yellow-400', accent: 'text-yellow-300', border: 'border-yellow-500/30' },
  changes: { dot: 'bg-blue-400',   accent: 'text-blue-300',   border: 'border-blue-500/30' }
}

function IssueDigest({ kind, category, groupBy, emptyHint }) {
  const { state, dispatch, gameById, designerById, gameName } = useStore()
  const [filterGameId, setFilterGameId] = useState('all')
  const [showHidden, setShowHidden] = useState(false)
  // editNote holds { note, sessionId } when the user taps a row's edit pencil.
  // The NoteEditor modal is rendered at the bottom of the digest.
  const [editNote, setEditNote] = useState(null)

  const tone = ISSUE_TONE[kind] || ISSUE_TONE.tech
  const hiddenSet = useMemo(() => new Set(state.hiddenNoteIds || []), [state.hiddenNoteIds])

  // Resolve the live note off state when the editor opens, so edits land on
  // the freshest version (the row may have been mutated by another device).
  const editTarget = useMemo(() => {
    if (!editNote) return null
    const sess = state.sessions.find(s => s.id === editNote.sessionId)
    const note = sess?.notes.find(n => n.id === editNote.noteId)
    return note ? { note, sessionId: editNote.sessionId } : null
  }, [editNote, state.sessions])

  // Build the flat list of notes that match the category + game filter, then
  // partition by visibility. Each row carries its session metadata so the
  // grouped views below can reference dates, designers, and origin.
  const { rows, hiddenRows } = useMemo(() => {
    const visible = []
    const hidden = []
    for (const s of state.sessions) {
      if (filterGameId !== 'all' && s.gameId !== filterGameId) continue
      const game = gameById(s.gameId)
      for (const n of s.notes) {
        if (!(n.categories || []).includes(category)) continue
        const row = {
          noteId:        n.id,
          sessionId:     s.id,
          sessionDate:   s.date,
          sessionTime:   s.time,
          gameId:        s.gameId,
          gameName:      game?.name || '(deleted game)',
          designerId:    n.designerId,
          timestamp:     n.timestamp,
          text:          n.text,
          photoUrl:      n.photoUrl || null,
          puzzleIds:     n.puzzleIds || [],
          componentIds:  n.componentIds || []
        }
        if (hiddenSet.has(n.id)) hidden.push(row)
        else visible.push(row)
      }
    }
    return { rows: visible, hiddenRows: hidden }
  }, [state.sessions, filterGameId, category, hiddenSet, gameById])

  // Group by puzzle (changes) or component (tech). Each row attaches under
  // every tagged item; rows with no tags fall into "Untagged".
  const groups = useMemo(() => groupRows(rows, groupBy, state.games, filterGameId, gameById), [rows, groupBy, state.games, filterGameId, gameById])

  // Game tabs scoped to games that actually have notes for this category, so
  // the chip strip doesn't fill up with games that aren't relevant.
  const relevantGames = useMemo(() => {
    const ids = new Set()
    for (const s of state.sessions) {
      if (s.notes.some(n => (n.categories || []).includes(category))) ids.add(s.gameId)
    }
    return [...ids]
      .map(id => gameById(id))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [state.sessions, category, gameById])

  const escalate = (row) => {
    const stamp = fmtCountdown(row.timestamp)
    const title = `[${category} · ${row.gameName} · ${row.sessionDate} ${stamp}] ${row.text}`
    dispatch({
      type: 'ADD_ACTION_ITEM',
      item: {
        text: title,
        status: 'open',
        relatedCategory: category,
        sourceSessionIds: [row.sessionId],
        sourceNoteId: row.noteId
      }
    })
  }

  const hide = (row) => {
    dispatch({ type: 'HIDE_NOTE', noteId: row.noteId })
  }

  const restore = (row) => {
    dispatch({ type: 'UNHIDE_NOTE', noteId: row.noteId })
  }

  const openSession = (sessionId) => dispatch({ type: 'OPEN_SESSION_REVIEW', id: sessionId })
  const openEdit = (row) => setEditNote({ noteId: row.noteId, sessionId: row.sessionId })

  return (
    <>
      {/* Game scope chips */}
      {relevantGames.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          <button
            onClick={() => setFilterGameId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
              filterGameId === 'all'
                ? 'bg-accent-500 border-accent-500 text-ink-50'
                : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
            }`}
          >All games</button>
          {relevantGames.map(g => (
            <button
              key={g.id}
              onClick={() => setFilterGameId(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
                filterGameId === g.id
                  ? 'bg-accent-500 border-accent-500 text-ink-50'
                  : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
              }`}
            >{g.name}</button>
          ))}
        </div>
      )}

      {/* Tech-only: per-component bar chart at the top, scoped to current
          game filter. Skips render automatically when there are no rows. */}
      {kind === 'tech' && rows.length > 0 && (
        <ComponentNoteBarChart
          rows={rows}
          allGames={state.games}
          filterGameId={filterGameId}
        />
      )}

      {rows.length === 0 && hiddenRows.length === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-6 text-center">
          <div className="text-3xl mb-2">{kind === 'tech' ? '🛠' : '✏️'}</div>
          <div className="font-semibold mb-1">No {category.toLowerCase()} notes yet</div>
          <div className="text-sm text-ink-400 leading-relaxed">{emptyHint}</div>
        </div>
      ) : (
        <>
          <div className="text-xs text-ink-400 px-1">
            {rows.length} note{rows.length === 1 ? '' : 's'}
            {hiddenRows.length > 0 && (
              <> · <button
                onClick={() => setShowHidden(v => !v)}
                className="text-accent-400 active:text-accent-500 underline-offset-2 hover:underline"
              >
                {showHidden ? 'hide' : 'show'} {hiddenRows.length} hidden
              </button></>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-sm text-ink-400">
              {filterGameId === 'all'
                ? `No visible ${category.toLowerCase()} notes.`
                : 'No notes for this game.'}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(group => (
                <IssueGroup
                  key={group.key}
                  group={group}
                  tone={tone}
                  designerById={designerById}
                  onEscalate={escalate}
                  onHide={hide}
                  onOpen={openSession}
                  onEdit={openEdit}
                />
              ))}
            </div>
          )}

          {showHidden && hiddenRows.length > 0 && (
            <div className="rounded-2xl bg-ink-800/40 border border-dashed border-ink-700 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold flex items-center justify-between">
                <span>Hidden notes</span>
                <button
                  onClick={() => setShowHidden(false)}
                  className="text-ink-500 active:text-ink-200 text-base leading-none"
                  aria-label="Close hidden"
                >×</button>
              </div>
              {hiddenRows.map(row => (
                <HiddenRow
                  key={row.noteId}
                  row={row}
                  designer={designerById(row.designerId)}
                  onRestore={() => restore(row)}
                  onOpen={() => openSession(row.sessionId)}
                  onEdit={() => openEdit(row)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editTarget && (
        <NoteEditor
          note={editTarget.note}
          sessionId={editTarget.sessionId}
          onClose={() => setEditNote(null)}
        />
      )}
    </>
  )
}

// Group rows by puzzle (Puzzle Issues) or component (Tech Issues). Rows can
// belong to multiple groups when tagged with multiple ids; ungrouped rows go
// into a single "Untagged" bucket so they're still visible.
function groupRows(rows, groupBy, allGames, filterGameId, gameById) {
  // Build the universe of items we can group under. When a game filter is
  // active we only show that game's items; otherwise we show every item that
  // appears as a tag in `rows` (keeps "All games" view sane).
  const itemMap = new Map() // id → { id, name, code, gameId, gameName }
  const games = filterGameId === 'all' ? allGames : allGames.filter(g => g.id === filterGameId)
  for (const g of games) {
    const items = (groupBy === 'component' ? g.components : g.puzzles) || []
    for (const it of items) {
      itemMap.set(it.id, {
        id: it.id, name: it.name, code: it.code || '',
        gameId: g.id, gameName: g.name
      })
    }
  }

  const buckets = new Map() // itemId → { item, rows }
  const untagged = []
  const idsField = groupBy === 'component' ? 'componentIds' : 'puzzleIds'

  for (const row of rows) {
    const ids = (row[idsField] || []).filter(id => itemMap.has(id))
    if (ids.length === 0) {
      untagged.push(row)
      continue
    }
    for (const id of ids) {
      if (!buckets.has(id)) {
        buckets.set(id, { item: itemMap.get(id), rows: [] })
      }
      buckets.get(id).rows.push(row)
    }
  }

  const groups = [...buckets.values()].map(b => ({
    key: b.item.id,
    title: b.item.name,
    code: b.item.code,
    gameName: b.item.gameName,
    rows: b.rows.slice().sort((a, b) =>
      (b.sessionDate || '').localeCompare(a.sessionDate || '') ||
      (b.timestamp - a.timestamp)
    )
  }))

  // Most-mentioned first — that's where the actionable signal usually lives.
  groups.sort((a, b) => b.rows.length - a.rows.length || a.title.localeCompare(b.title))

  if (untagged.length > 0) {
    groups.push({
      key: '__untagged__',
      title: 'Untagged',
      code: '',
      gameName: '',
      rows: untagged.slice().sort((a, b) =>
        (b.sessionDate || '').localeCompare(a.sessionDate || '') ||
        (b.timestamp - a.timestamp)
      )
    })
  }

  return groups
}

function IssueGroup({ group, tone, designerById, onEscalate, onHide, onOpen, onEdit }) {
  return (
    <details className="group rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 active:bg-ink-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
            {group.code && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-900 text-ink-400 border border-ink-700 tabular-nums">
                {group.code}
              </span>
            )}
            <span className="font-semibold text-ink-50">{group.title}</span>
            {group.gameName && group.key !== '__untagged__' && (
              <span className="text-[11px] text-ink-400">· {group.gameName}</span>
            )}
          </div>
          <div className="text-[11px] text-ink-400 mt-0.5 tabular-nums">
            {group.rows.length} note{group.rows.length === 1 ? '' : 's'}
          </div>
        </div>
        <svg className="w-4 h-4 text-ink-400 transition-transform group-open:rotate-180 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {group.rows.map(row => (
          <IssueRow
            key={row.noteId}
            row={row}
            designer={designerById(row.designerId)}
            onEscalate={() => onEscalate(row)}
            onHide={() => onHide(row)}
            onOpen={() => onOpen(row.sessionId)}
            onEdit={onEdit ? () => onEdit(row) : null}
          />
        ))}
      </div>
    </details>
  )
}

function IssueRow({ row, designer, onEscalate, onHide, onOpen, onEdit }) {
  return (
    <div className="rounded-xl bg-ink-900 border border-ink-700 p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-ink-400 tabular-nums">
        <span className="font-mono">{fmtCountdown(row.timestamp)}</span>
        {designer && (
          <span className="font-bold" style={{ color: designer.color }}>{designer.initials}</span>
        )}
        <span className="text-ink-500">·</span>
        <button
          onClick={onOpen}
          className="truncate text-left active:text-accent-400 hover:text-accent-400 underline-offset-2 hover:underline"
        >
          {row.gameName} · {row.sessionDate}
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="ml-auto text-ink-500 active:text-ink-200 px-1"
            aria-label="Edit note"
            title="Edit note"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
      {/* Note + actions inline on the same row. Buttons share the compact
          Hide-button sizing so they cluster on the right rather than
          stretching across the full width of the card. */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 text-sm text-ink-100 leading-snug break-words">{row.text}</div>
        <button
          onClick={onEscalate}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-accent-500/15 border border-accent-500/40 text-accent-200 text-xs font-semibold active:bg-accent-500/25"
          title="Escalate to Action Item"
        >
          ↑ Escalate
        </button>
        <button
          onClick={onHide}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-ink-800 border border-ink-700 text-ink-300 text-xs font-medium active:bg-ink-700"
          title="Hide from this view (note stays in the demo)"
        >
          Hide
        </button>
      </div>
      {row.photoUrl && (
        <img src={row.photoUrl} alt="" className="rounded-lg max-h-48 w-full object-cover" />
      )}
    </div>
  )
}

function HiddenRow({ row, designer, onRestore, onOpen, onEdit }) {
  return (
    <div className="rounded-xl bg-ink-900 border border-ink-700 p-3 space-y-2 opacity-80">
      <div className="flex items-center gap-2 text-[11px] text-ink-400 tabular-nums">
        <span className="font-mono">{fmtCountdown(row.timestamp)}</span>
        {designer && (
          <span className="font-bold" style={{ color: designer.color }}>{designer.initials}</span>
        )}
        <span className="text-ink-500">·</span>
        <button
          onClick={onOpen}
          className="truncate text-left active:text-accent-400 hover:text-accent-400 underline-offset-2 hover:underline"
        >
          {row.gameName} · {row.sessionDate}
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="ml-auto text-ink-500 active:text-ink-200 px-1"
            aria-label="Edit note"
            title="Edit note"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
      <div className="text-sm text-ink-200 leading-snug break-words italic">{row.text}</div>
      {row.photoUrl && (
        <img src={row.photoUrl} alt="" className="rounded-lg max-h-48 w-full object-cover" />
      )}
      <button
        onClick={onRestore}
        className="w-full px-3 py-2 rounded-lg bg-ink-800 border border-ink-700 text-ink-200 text-xs font-medium active:bg-ink-700"
      >
        ↺ Restore
      </button>
    </div>
  )
}

// Horizontal bar chart shown at the top of the Tech Issues page. Counts the
// number of tech-issue notes tagged to each component, sorted descending.
// Notes that aren't tagged to any component fall into a single "Untagged"
// row at the bottom so they're still visible.
function ComponentNoteBarChart({ rows, allGames, filterGameId }) {
  const counts = useMemo(() => {
    const games = filterGameId === 'all' ? allGames : allGames.filter(g => g.id === filterGameId)
    const map = new Map() // id → { id, name, code, gameName, count }
    for (const g of games) {
      for (const c of g.components || []) {
        map.set(c.id, { id: c.id, name: c.name, code: c.code || '', gameName: g.name, count: 0 })
      }
    }
    let untagged = 0
    for (const r of rows) {
      const valid = (r.componentIds || []).filter(id => map.has(id))
      if (valid.length === 0) {
        untagged++
        continue
      }
      for (const id of valid) map.get(id).count++
    }
    const list = [...map.values()].filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    if (untagged > 0) {
      list.push({ id: '__untagged__', name: 'Untagged', code: '', gameName: '', count: untagged })
    }
    return list
  }, [rows, allGames, filterGameId])

  if (counts.length === 0) return null
  const max = Math.max(...counts.map(c => c.count))

  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 p-3 space-y-2">
      <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold flex items-center justify-between">
        <span>Tech issues by component</span>
        <span className="text-ink-500 normal-case tracking-normal">most first</span>
      </div>
      <div className="space-y-1.5">
        {counts.map(c => {
          const pct = max > 0 ? (c.count / max) * 100 : 0
          return (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <span className="w-28 sm:w-32 flex-shrink-0 truncate text-ink-200" title={c.name}>
                {c.name}
              </span>
              <div className="flex-1 h-5 bg-ink-900 rounded overflow-hidden border border-ink-700">
                <div
                  className="h-full"
                  style={{ width: `${pct}%`, backgroundColor: '#fb923c' }}
                />
              </div>
              <span className="text-ink-100 font-bold tabular-nums w-7 text-right">{c.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Clues/Hints digest — every Clue or Hint note across all sessions, grouped by
// the puzzle they're tagged with (rows tagged with no puzzle fall into an
// "Untagged" bucket). Each row carries an "Added to Clueset" yes/no toggle so
// the team can keep ticking off real-world clues that already made it into
// the in-game clueset; rows marked Yes hide by default until the toolbar
// toggle flips them back on.
// ============================================================================

const CLUE_CATEGORIES = ['Clue', 'Hint']

function ClueHintDigest() {
  const { state, dispatch, gameById, designerById } = useStore()
  const [filterGameId, setFilterGameId] = useState('all')
  const [showAdded, setShowAdded] = useState(false)
  // editNote → { noteId, sessionId } — opens NoteEditor when set, modal-style
  const [editNote, setEditNote] = useState(null)

  const cluesetSet = useMemo(() => new Set(state.cluesetNoteIds || []), [state.cluesetNoteIds])

  // Pull the latest note off state when the editor's open so concurrent edits
  // (e.g. via the Review timeline on another device) don't get clobbered.
  const editTarget = useMemo(() => {
    if (!editNote) return null
    const sess = state.sessions.find(s => s.id === editNote.sessionId)
    const note = sess?.notes.find(n => n.id === editNote.noteId)
    return note ? { note, sessionId: editNote.sessionId } : null
  }, [editNote, state.sessions])

  // Pull every Clue / Hint note across all sessions, then split by whether
  // it's already in the clueset. We keep both lists so the toolbar can show
  // an accurate count and the show-added toggle can re-surface them.
  const { rows, addedRows } = useMemo(() => {
    const visible = []
    const added = []
    for (const s of state.sessions) {
      if (filterGameId !== 'all' && s.gameId !== filterGameId) continue
      const game = gameById(s.gameId)
      for (const n of s.notes) {
        const cats = n.categories || []
        if (!cats.some(c => CLUE_CATEGORIES.includes(c))) continue
        const row = {
          noteId:       n.id,
          sessionId:    s.id,
          sessionDate:  s.date,
          sessionTime:  s.time,
          gameId:       s.gameId,
          gameName:     game?.name || '(deleted game)',
          designerId:   n.designerId,
          timestamp:    n.timestamp,
          text:         n.text,
          puzzleIds:    n.puzzleIds || [],
          isClue:       cats.includes('Clue'),
          isHint:       cats.includes('Hint')
        }
        if (cluesetSet.has(n.id)) added.push(row)
        else visible.push(row)
      }
    }
    return { rows: visible, addedRows: added }
  }, [state.sessions, filterGameId, cluesetSet, gameById])

  // Group strictly by puzzle. Building the puzzle universe from the games in
  // scope keeps cross-game noise out of the "All games" view.
  const groups = useMemo(() => {
    const inScope = filterGameId === 'all' ? rows : rows.filter(r => r.gameId === filterGameId)
    const allInScope = filterGameId === 'all' ? [...rows, ...addedRows] : [...rows, ...addedRows].filter(r => r.gameId === filterGameId)
    return groupClueRows(inScope, allInScope, showAdded ? addedRows : [], state.games, filterGameId, cluesetSet)
  }, [rows, addedRows, state.games, filterGameId, showAdded, cluesetSet])

  // Game tabs: only games that have at least one Clue or Hint note.
  const relevantGames = useMemo(() => {
    const ids = new Set()
    for (const s of state.sessions) {
      if (s.notes.some(n => (n.categories || []).some(c => CLUE_CATEGORIES.includes(c)))) {
        ids.add(s.gameId)
      }
    }
    return [...ids]
      .map(id => gameById(id))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [state.sessions, gameById])

  const toggleClueset = (row) => {
    const inClueset = cluesetSet.has(row.noteId)
    dispatch({
      type: inClueset ? 'UNMARK_CLUESET' : 'MARK_CLUESET',
      noteId: row.noteId
    })
  }

  const openSession = (sessionId) => dispatch({ type: 'OPEN_SESSION_REVIEW', id: sessionId })
  const openEdit = (row) => setEditNote({ noteId: row.noteId, sessionId: row.sessionId })

  // Headline counts of distinct clue / hint notes in the current scope. A note
  // tagged with both Clue and Hint is counted once in each bucket — that's
  // how it's surfaced visually below too.
  const visibleClueCount = rows.filter(r => r.isClue).length
  const visibleHintCount = rows.filter(r => r.isHint).length

  if (rows.length === 0 && addedRows.length === 0) {
    return (
      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-6 text-center">
        <div className="text-3xl mb-2">💡</div>
        <div className="font-semibold mb-1">No clue or hint notes yet</div>
        <div className="text-sm text-ink-400 leading-relaxed">
          Tag notes with Clue or Hint during a demo to track them here, grouped by the puzzle they belong to.
        </div>
      </div>
    )
  }

  return (
    <>
      {relevantGames.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          <button
            onClick={() => setFilterGameId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
              filterGameId === 'all'
                ? 'bg-accent-500 border-accent-500 text-ink-50'
                : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
            }`}
          >All games</button>
          {relevantGames.map(g => (
            <button
              key={g.id}
              onClick={() => setFilterGameId(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
                filterGameId === g.id
                  ? 'bg-accent-500 border-accent-500 text-ink-50'
                  : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
              }`}
            >{g.name}</button>
          ))}
        </div>
      )}

      {/* Show-added toggle. The whole row is the toggle so it's a fat tap target. */}
      <button
        onClick={() => setShowAdded(v => !v)}
        className={`w-full rounded-2xl border px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
          showAdded
            ? 'bg-emerald-500/10 border-emerald-500/40 active:bg-emerald-500/20'
            : 'bg-ink-800 border-ink-700 active:bg-ink-700'
        }`}
      >
        <span className={`w-9 h-5 rounded-full p-0.5 flex-shrink-0 transition-colors ${
          showAdded ? 'bg-emerald-400' : 'bg-ink-600'
        }`}>
          <span className={`block w-4 h-4 rounded-full bg-ink-50 transition-transform ${
            showAdded ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-50">
            {showAdded ? 'Showing Added Clues' : 'Show Added Clues'}
          </div>
          <div className="text-[11px] text-ink-400">
            {addedRows.length === 0
              ? 'Nothing in the clueset yet'
              : `${addedRows.length} note${addedRows.length === 1 ? '' : 's'} marked added`}
          </div>
        </div>
      </button>

      {/* Distinct clue / hint counts for the current visible (not-added) scope */}
      {(visibleClueCount > 0 || visibleHintCount > 0) && (
        <div className="flex items-center gap-2 px-1">
          <CountChip label="clues" count={visibleClueCount} color={CLUE_COLOR} />
          <CountChip label="hints" count={visibleHintCount} color={HINT_COLOR} />
          <span className="text-[11px] text-ink-500 ml-auto">
            {rows.length} note{rows.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-sm text-ink-400">
          {addedRows.length > 0 && !showAdded
            ? <>All clue/hint notes are marked added. <button onClick={() => setShowAdded(true)} className="text-accent-400 active:text-accent-500">Show them</button>.</>
            : 'No clue or hint notes for this game.'}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(group => (
            <CluePuzzleGroup
              key={group.key}
              group={group}
              cluesetSet={cluesetSet}
              designerById={designerById}
              onToggleClueset={toggleClueset}
              onOpenSession={openSession}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {editTarget && (
        <NoteEditor
          note={editTarget.note}
          sessionId={editTarget.sessionId}
          onClose={() => setEditNote(null)}
        />
      )}
    </>
  )
}

// Tiny pill that shows "N clues" or "M hints" with the type's distinctive
// color. Used in the digest toolbar + each puzzle group's summary.
function CountChip({ label, count, color }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold tabular-nums border"
      style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}55` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {count} {label}
    </span>
  )
}

// Build per-puzzle groups. `visibleRows` are the rows that should always
// render (not in clueset). `extraRows` are rows in clueset that also render
// because the show-added toggle is on. Counts in summary always reflect the
// visible-only set so the headline number matches what's collapsed inside.
function groupClueRows(visibleRows, allRowsInScope, extraRows, games, filterGameId, cluesetSet) {
  // Build the puzzle universe under the active game scope.
  const puzzleMap = new Map() // id → { id, name, code, gameId, gameName }
  const inScopeGames = filterGameId === 'all' ? games : games.filter(g => g.id === filterGameId)
  for (const g of inScopeGames) {
    for (const p of g.puzzles || []) {
      puzzleMap.set(p.id, { id: p.id, name: p.name, code: p.code || '', gameId: g.id, gameName: g.name })
    }
  }

  // Bucket: puzzleId → { item, visible, added }
  const buckets = new Map()
  const untagged = { visible: [], added: [] }

  const addRow = (row, target) => {
    const valid = (row.puzzleIds || []).filter(id => puzzleMap.has(id))
    if (valid.length === 0) {
      untagged[target].push(row)
      return
    }
    for (const id of valid) {
      if (!buckets.has(id)) {
        buckets.set(id, { item: puzzleMap.get(id), visible: [], added: [] })
      }
      buckets.get(id)[target].push(row)
    }
  }

  for (const r of visibleRows) addRow(r, 'visible')
  for (const r of extraRows)   addRow(r, 'added')

  // Only emit groups that have at least one row visible right now (visible
  // means "not in clueset"; added means "in clueset and toggle is on").
  const groups = []
  for (const b of buckets.values()) {
    if (b.visible.length === 0 && b.added.length === 0) continue
    groups.push({
      key:       b.item.id,
      title:     b.item.name,
      code:      b.item.code,
      gameName:  b.item.gameName,
      visible:   sortRows(b.visible),
      added:     sortRows(b.added)
    })
  }
  if (untagged.visible.length || untagged.added.length) {
    groups.push({
      key:       '__untagged__',
      title:     'Untagged',
      code:      '',
      gameName:  '',
      visible:   sortRows(untagged.visible),
      added:     sortRows(untagged.added)
    })
  }

  // Sort: most visible-rows first (where the work is), ties by name.
  groups.sort((a, b) => b.visible.length - a.visible.length || a.title.localeCompare(b.title))
  return groups
}

function sortRows(rows) {
  return rows.slice().sort((a, b) =>
    (b.sessionDate || '').localeCompare(a.sessionDate || '') ||
    (b.timestamp - a.timestamp)
  )
}

// One puzzle's collapsible card. Closed by default; the headline shows
// distinct clue + hint counts (counts a Clue+Hint note in both buckets) for
// the visible rows.
function CluePuzzleGroup({ group, cluesetSet, designerById, onToggleClueset, onOpenSession, onEdit }) {
  const visibleClues = group.visible.filter(r => r.isClue).length
  const visibleHints = group.visible.filter(r => r.isHint).length
  return (
    <details className="group rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 active:bg-ink-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            {group.code && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-900 text-ink-400 border border-ink-700 tabular-nums">
                {group.code}
              </span>
            )}
            <span className="font-semibold text-ink-50">{group.title}</span>
            {group.gameName && group.key !== '__untagged__' && (
              <span className="text-[11px] text-ink-400">· {group.gameName}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] tabular-nums flex-wrap">
            {visibleClues > 0 && (
              <span style={{ color: CLUE_COLOR }} className="font-semibold">
                {visibleClues} clue{visibleClues === 1 ? '' : 's'}
              </span>
            )}
            {visibleClues > 0 && visibleHints > 0 && <span className="text-ink-600">·</span>}
            {visibleHints > 0 && (
              <span style={{ color: HINT_COLOR }} className="font-semibold">
                {visibleHints} hint{visibleHints === 1 ? '' : 's'}
              </span>
            )}
            {visibleClues === 0 && visibleHints === 0 && (
              <span className="text-ink-400">no visible notes</span>
            )}
            {group.added.length > 0 && (
              <span className="text-ink-500">· {group.added.length} in clueset</span>
            )}
          </div>
        </div>
        <svg className="w-4 h-4 text-ink-400 transition-transform group-open:rotate-180 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {group.visible.length === 0 && group.added.length === 0 && (
          <div className="text-xs text-ink-500 px-1 py-1">No notes.</div>
        )}
        {group.visible.map(row => (
          <ClueRow
            key={row.noteId}
            row={row}
            inClueset={false}
            designer={designerById(row.designerId)}
            onToggleClueset={() => onToggleClueset(row)}
            onOpenSession={() => onOpenSession(row.sessionId)}
            onEdit={onEdit ? () => onEdit(row) : null}
          />
        ))}
        {group.added.map(row => (
          <ClueRow
            key={row.noteId}
            row={row}
            inClueset={true}
            designer={designerById(row.designerId)}
            onToggleClueset={() => onToggleClueset(row)}
            onOpenSession={() => onOpenSession(row.sessionId)}
            onEdit={onEdit ? () => onEdit(row) : null}
          />
        ))}
      </div>
    </details>
  )
}

function ClueRow({ row, inClueset, designer, onToggleClueset, onOpenSession, onEdit }) {
  // Build the badge + the row's accent color. A note tagged with both shows
  // a split-fill swatch on its left edge (yellow on top, violet on bottom)
  // so designers can visually scan a list and see ratio at a glance.
  const tagBadge = row.isClue && row.isHint
    ? { label: 'Clue + Hint' }
    : row.isHint
      ? { label: 'Hint' }
      : { label: 'Clue' }

  const badgeStyle = row.isClue && row.isHint
    ? { background: `linear-gradient(90deg, ${CLUE_COLOR}33 0%, ${CLUE_COLOR}33 50%, ${HINT_COLOR}33 50%, ${HINT_COLOR}33 100%)`, borderColor: `${HINT_COLOR}66`, color: HINT_COLOR }
    : row.isHint
      ? { backgroundColor: `${HINT_COLOR}26`, borderColor: `${HINT_COLOR}66`, color: HINT_COLOR }
      : { backgroundColor: `${CLUE_COLOR}26`, borderColor: `${CLUE_COLOR}66`, color: CLUE_COLOR }

  // Left accent stripe sits inside the rounded card to color-code the row.
  const accentBg = row.isClue && row.isHint
    ? `linear-gradient(180deg, ${CLUE_COLOR} 0%, ${CLUE_COLOR} 50%, ${HINT_COLOR} 50%, ${HINT_COLOR} 100%)`
    : row.isHint ? HINT_COLOR : CLUE_COLOR

  return (
    <div className={`relative rounded-xl border p-3 pl-4 space-y-2 overflow-hidden ${
      inClueset ? 'bg-ink-900/60 border-emerald-500/30 opacity-80' : 'bg-ink-900 border-ink-700'
    }`}>
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ background: accentBg }}
        aria-hidden
      />
      <div className="flex items-center gap-2 text-[11px] text-ink-400 tabular-nums flex-wrap">
        <span className="font-mono">{fmtCountdown(row.timestamp)}</span>
        {designer && (
          <span className="font-bold" style={{ color: designer.color }}>{designer.initials}</span>
        )}
        <span className="text-ink-500">·</span>
        <button
          onClick={onOpenSession}
          className="truncate text-left active:text-accent-400 hover:text-accent-400 underline-offset-2 hover:underline"
        >
          {row.gameName} · {row.sessionDate}
        </button>
        <span
          className="ml-auto text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full border"
          style={badgeStyle}
        >
          {tagBadge.label}
        </span>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-ink-500 active:text-ink-200 px-1"
            aria-label="Edit note"
            title="Edit note"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
      <div className="text-sm text-ink-100 leading-snug break-words">{row.text}</div>
      <ClusetToggle inClueset={inClueset} onChange={onToggleClueset} />
    </div>
  )
}

// Yes/No segmented toggle. Yes-state colors emerald so it reads as "done";
// No-state stays neutral. Tapping the inactive side flips the row.
function ClusetToggle({ inClueset, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
        Added to Clueset
      </span>
      <div className="flex bg-ink-950 border border-ink-700 rounded-full p-0.5 ml-auto">
        <button
          onClick={() => { if (inClueset) onChange() }}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
            !inClueset
              ? 'bg-ink-700 text-ink-50'
              : 'text-ink-400 active:text-ink-200'
          }`}
          aria-pressed={!inClueset}
        >No</button>
        <button
          onClick={() => { if (!inClueset) onChange() }}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
            inClueset
              ? 'bg-emerald-500 text-ink-950'
              : 'text-ink-400 active:text-ink-200'
          }`}
          aria-pressed={inClueset}
        >Yes</button>
      </div>
    </div>
  )
}

// ============================================================================
// Stacked bar chart — one column per puzzle, clue count + hint count stacked
// to form a single bar. Sorted by total descending (most asks on the left)
// so the puzzles that need the most help bubble up.
// ============================================================================

function CluesHintsBarChart({ game, puzzleStats }) {
  const data = useMemo(() => {
    const list = (game?.puzzles || []).map(p => {
      const stats = puzzleStats?.[p.id] || { perCategory: {} }
      const clues = stats.perCategory?.Clue || 0
      const hints = stats.perCategory?.Hint || 0
      return { id: p.id, name: p.name, code: p.code || '', clues, hints, total: clues + hints }
    })
    return list.filter(d => d.total > 0).sort((a, b) =>
      b.total - a.total || a.name.localeCompare(b.name)
    )
  }, [game, puzzleStats])

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-ink-900 border border-ink-700 p-4 text-center text-sm text-ink-500">
        No clue or hint notes tagged to puzzles yet.
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.total))
  // Cap chart height so it stays compact on phones; actual bar heights scale
  // off the largest column so the tallest hits 100%.
  const CHART_PX = 160

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
        {/* items-start so all columns share a top edge — combined with the
            fixed-height count + bar above, this guarantees every bar's
            bottom sits on the same baseline regardless of how long each
            puzzle name wraps below. */}
        <div className="flex items-start gap-2.5 pt-3" style={{ minWidth: `${data.length * 52}px` }}>
          {data.map(d => {
            const totalH = (d.total / max) * CHART_PX
            // Within each stack, divide proportional to clue/hint counts.
            const clueH = d.total > 0 ? (d.clues / d.total) * totalH : 0
            const hintH = d.total > 0 ? (d.hints / d.total) * totalH : 0
            return (
              <div key={d.id} className="flex flex-col items-center w-12 flex-shrink-0">
                <div className="text-[11px] font-bold text-ink-100 tabular-nums mb-1 h-4 leading-4">{d.total}</div>
                <div
                  className="w-9 rounded-md overflow-hidden bg-ink-900 border border-ink-700 flex flex-col-reverse flex-shrink-0"
                  style={{ height: CHART_PX }}
                  title={`${d.name} · ${d.clues} clue${d.clues === 1 ? '' : 's'}, ${d.hints} hint${d.hints === 1 ? '' : 's'}`}
                >
                  {d.clues > 0 && (
                    <div style={{ height: clueH, backgroundColor: CLUE_COLOR }} />
                  )}
                  {d.hints > 0 && (
                    <div style={{ height: hintH, backgroundColor: HINT_COLOR }} />
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] tabular-nums">
                  {d.clues > 0 && (
                    <span style={{ color: CLUE_COLOR }} className="font-semibold">{d.clues}</span>
                  )}
                  {d.clues > 0 && d.hints > 0 && <span className="text-ink-600">·</span>}
                  {d.hints > 0 && (
                    <span style={{ color: HINT_COLOR }} className="font-semibold">{d.hints}</span>
                  )}
                </div>
                {d.code && (
                  <div className="text-[9px] mt-1 px-1 rounded bg-ink-800 border border-ink-700 text-ink-400 tabular-nums truncate max-w-full">
                    {d.code}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-ink-300 text-center leading-tight break-words max-w-full">
                  {d.name}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-300 px-1 pt-1 border-t border-ink-700/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CLUE_COLOR }} /> Clues
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: HINT_COLOR }} /> Hints
        </span>
        <span className="text-ink-500 ml-auto">Sorted by total · most on the left</span>
      </div>
    </div>
  )
}
