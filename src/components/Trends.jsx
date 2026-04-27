import React, { useMemo, useState } from 'react'
import { useStore, fmtTime, fmtCountdown, fmtClockTime, parseBenchmark, DEMO_TARGET_SEC } from '../store.jsx'
import { aggregateAcrossSessions, aggregatePuzzleSolveTimes } from '../utils/synthesis.js'
import ClickablePhoto from './ClickablePhoto.jsx'

const PAGES = [
  { id: 'trends', label: 'Game Trends' },
  { id: 'photos', label: 'Team Photos' }
]

export default function Trends() {
  const { state, categoryColor, gameById, newestGame } = useStore()
  const games = state.games
  // Default to the newest game on each entry into Trends.
  const [gameId, setGameId] = useState(() => newestGame()?.id || '')
  const [page, setPage] = useState('trends')

  return (
    <div className="px-4 pt-3 space-y-4">
      <div className="flex gap-1 bg-ink-800 border border-ink-700 rounded-full p-1">
        {PAGES.map(p => (
          <button
            key={p.id}
            onClick={() => setPage(p.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors ${
              page === p.id ? 'bg-accent-500 text-ink-50' : 'text-ink-200 active:bg-ink-700'
            }`}
          >{p.label}</button>
        ))}
      </div>

      {page === 'photos' ? (
        <TeamPhotos />
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

  // Sessions narrowed to the active team-type filter. Everything that
  // aggregates below sees only these so the toggle affects the whole view.
  const filteredSessions = useMemo(
    () => teamFilter === 'all'
      ? state.sessions
      : state.sessions.filter(s => s.experience === teamFilter),
    [state.sessions, teamFilter]
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

      <DemoStats game={game} agg={agg} />

      {agg.total === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-ink-400">
          {teamFilter === 'all'
            ? 'No demos logged for this game yet.'
            : `No ${teamFilter} demos for this game yet.`}
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
            title="Puzzle solve times"
            hint="Average, fastest, and slowest solve per puzzle."
          >
            <PuzzleSolveTimes solveTimes={solveTimes} game={game} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Top problem puzzles"
            hint="Ranked by Frustration + Game Change notes."
          >
            <Leaderboard
              items={game.puzzles}
              stats={agg.puzzleStats}
              totalDemos={agg.total}
              scoreCategories={['Frustration', 'Game Change']}
              kind="puzzle"
              emptyText="No frustration or game-change notes on puzzles yet."
              tone="rose"
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Top problem components"
            hint="Ranked by Frustration + Game Change notes."
          >
            <Leaderboard
              items={game.components}
              stats={agg.componentStats}
              totalDemos={agg.total}
              scoreCategories={['Frustration', 'Game Change']}
              kind="component"
              emptyText="No frustration or game-change notes on components yet."
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
  yellow:  'text-yellow-300'
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

          {/* Average solve dots — colored vs benchmark when one exists */}
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
            return (
              <div
                key={p.id}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                style={{ left: `${pct}%` }}
              >
                <span className={`block w-7 h-7 rounded-full ${dotClass} border-2 border-ink-800 flex items-center justify-center text-[12px] font-bold text-ink-950 leading-none shadow-lg`}>
                  {i + 1}
                </span>
                <div className={`absolute -top-9 ${chipAlign(pct)} px-2 py-1 rounded-md bg-ink-900 border border-ink-700 text-[11px] text-ink-100 font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 shadow-xl`}>
                  {p.name}
                  <span className="text-ink-400 tabular-nums ml-1">· avg {fmtCountdown(p.avgSolvedTs)}</span>
                  {p.solvedDemoCount > 0 && (
                    <span className="text-ink-500 ml-1">({p.solvedDemoCount}×)</span>
                  )}
                  {deltaLabel && (
                    <span className={`ml-1 ${onTime ? 'text-emerald-300' : 'text-rose-300'}`}>· {deltaLabel}</span>
                  )}
                </div>
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

function PuzzleSolveTimes({ solveTimes, game }) {
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
          <PuzzleSolveRow key={p.id} puzzle={p} maxAvg={maxAvg} />
        ))}
      </div>

      <BenchmarksSubsection perPuzzle={ordered} />
    </div>
  )
}

function PuzzleSolveRow({ puzzle: p, maxAvg }) {
  const { dispatch } = useStore()
  const hasAvg = p.avgSolveTime != null
  const widthPct = hasAvg ? Math.max(8, (p.avgSolveTime / maxAvg) * 100) : 0
  const goalSec = p.goalMinutes != null ? p.goalMinutes * 60 : null
  const avgOffGoal = goalSec != null && hasAvg && Math.abs(p.avgSolveTime - goalSec) > 60
  // Avg goes red when the average deviates more than ±60 sec from the puzzle's
  // configured Goal Time; otherwise it stays white like fastest/slowest.
  const avgClass = avgOffGoal ? 'text-rose-400' : 'text-ink-50'
  const allSolves = p.solves || []

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
          {goalSec != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-medium tabular-nums"
                  title={`Goal solve time: ${p.goalMinutes} min`}>
              🎯 {p.goalMinutes}m
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
          <SolveCell label="Avg" value={p.avgSolveTime} colorClass={avgClass} />
          <SolveCell label="Fastest" value={p.fastestSolve} colorClass="text-ink-50" />
          <SolveCell label="Slowest" value={p.slowestSolve} colorClass="text-ink-50" />
        </div>
        {hasAvg && (
          <div className="w-full h-1 mt-2 bg-ink-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${avgOffGoal ? 'bg-rose-400/70' : 'bg-yellow-400/70'}`} style={{ width: `${widthPct}%` }} />
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
    <div className="pt-3 mt-1 border-t border-ink-700 space-y-1.5">
      <div className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
        <span>⏱</span> Benchmarks
      </div>
      <div className="text-xs text-ink-200 -mt-1">
        Target solve time vs averaged actual across demos. Negative delta = team is ahead of the benchmark.
      </div>
      {benchmarked.map(p => {
        const hasAvg = p.avgSolvedTs != null
        const delta = hasAvg ? p.avgSolvedTs - p.benchmarkSec : null
        const ahead = delta != null && delta < 0
        return (
          <div key={p.id} className="rounded-lg bg-ink-900 border border-yellow-500/30 p-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              {p.code && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700 tabular-nums">{p.code}</span>
              )}
              <span className="font-semibold text-sm text-ink-100 truncate">{p.name}</span>
              {p.benchmarkName && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-200 border border-yellow-500/40 font-medium">
                  ⏱ {p.benchmarkName}
                </span>
              )}
              <span className="tabular-nums text-[11px] text-yellow-300">target {fmtCountdown(p.benchmarkSec)}</span>
            </div>
            <div className="text-[11px] mt-1 tabular-nums flex items-center gap-2 flex-wrap">
              {hasAvg ? (
                <>
                  <span className="text-ink-400">avg solved {fmtCountdown(p.avgSolvedTs)} ({p.solvedDemoCount} demo{p.solvedDemoCount === 1 ? '' : 's'})</span>
                  <span className={ahead ? 'text-emerald-300' : delta === 0 ? 'text-ink-300' : 'text-rose-300'}>
                    {delta === 0 ? 'on target' : `${ahead ? '−' : '+'}${fmtTime(Math.abs(delta))} ${ahead ? 'ahead' : 'behind'}`}
                  </span>
                </>
              ) : (
                <span className="text-ink-500 italic">not solved yet in any demo</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
