import React, { useMemo, useState } from 'react'
import { useStore, fmtTime, fmtCountdown, parseBenchmark } from '../store.jsx'
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

function GameTrends({ games, gameId, setGameId, gameById, state, categoryColor }) {
  const game = gameById(gameId) || games[0]
  const agg = useMemo(() => aggregateAcrossSessions(state.sessions, game.id), [state.sessions, game.id])
  const solveTimes = useMemo(() => aggregatePuzzleSolveTimes(state.sessions, game), [state.sessions, game])
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

      <DemoStats game={game} agg={agg} />

      {agg.total === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-ink-400">
          No demos logged for this game yet.
        </div>
      ) : (
        <>
          <PuzzleSolveTimes solveTimes={solveTimes} />

          <Leaderboard
            title="Top problem puzzles"
            hint="Sorted by negative notes (frustration, logic, tech, flow)."
            items={game.puzzles}
            stats={agg.puzzleStats}
            totalDemos={agg.total}
            sortBy="negative"
            kind="puzzle"
            emptyText="No puzzles linked to issues yet."
          />

          <Leaderboard
            title="Top problem components"
            hint="Components frequently linked to negative notes."
            items={game.components}
            stats={agg.componentStats}
            totalDemos={agg.total}
            sortBy="negative"
            kind="component"
            emptyText="No components linked to issues yet."
            techIssueRank
          />

          <Leaderboard
            title="Top wow moments"
            hint="Where players have the strongest positive reactions."
            items={[
              ...game.puzzles.map(p => ({ ...p, _kind: 'puzzle' })),
              ...game.components.map(c => ({ ...c, _kind: 'component' }))
            ]}
            stats={{ ...agg.puzzleStats, ...agg.componentStats }}
            totalDemos={agg.total}
            sortBy="positive"
            kind="mixed"
            emptyText="No wow moments tagged to puzzles or components yet."
            limit={5}
          />

          <CategoryMix categoryCounts={agg.categoryCounts} categoryColor={categoryColor} />
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
  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4">
      <div className="font-semibold text-lg mb-3">{game.name}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Demos logged" value={String(agg.total)} />
        <Stat label="Date range"
          value={agg.dateRange ? `${agg.dateRange.from} → ${agg.dateRange.to}` : '—'}
          small />
        <Stat label="Avg duration" value={agg.avgDuration ? fmtTime(agg.avgDuration) : '—'} mono />
        <Stat label="Avg notes / demo" value={String(agg.avgNotesPerDemo || 0)} />
      </div>
    </div>
  )
}

function Stat({ label, value, small, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`font-bold ${small ? 'text-xs' : 'text-xl'} ${mono ? 'font-mono tabular-nums' : ''} text-ink-100`}>{value}</div>
    </div>
  )
}

function Leaderboard({ title, hint, items, stats, totalDemos, sortBy, kind, emptyText, techIssueRank, limit }) {
  const enriched = (items || [])
    .map(item => ({
      ...item,
      stats: stats[item.id] || { total: 0, negative: 0, positive: 0, demos: 0, perCategory: {}, notes: [] }
    }))
    .filter(x => sortBy === 'positive' ? x.stats.positive > 0 : x.stats.negative > 0)

  if (sortBy === 'positive') {
    enriched.sort((a, b) => b.stats.positive - a.stats.positive)
  } else {
    enriched.sort((a, b) => {
      // Tech-issue tilt for components: prefer items with more Tech Issue counts on ties
      if (techIssueRank) {
        const ta = a.stats.perCategory['Tech Issue'] || 0
        const tb = b.stats.perCategory['Tech Issue'] || 0
        if (ta !== tb) return tb - ta
      }
      return b.stats.negative - a.stats.negative
    })
  }

  const visible = limit ? enriched.slice(0, limit) : enriched

  return (
    <div>
      <div className="px-1 mb-2">
        <div className="text-xs uppercase tracking-wider text-ink-400">{title}</div>
        {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
      </div>
      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4 text-sm text-ink-500 text-center">
            {emptyText}
          </div>
        )}
        {visible.map(item => (
          <LeaderboardRow key={item.id} item={item} totalDemos={totalDemos}
            kind={item._kind || kind} mode={sortBy} />
        ))}
      </div>
    </div>
  )
}

function LeaderboardRow({ item, totalDemos, kind, mode }) {
  const { designerById, categoryColor } = useStore()
  const [open, setOpen] = useState(false)
  const s = item.stats
  const neutral = Math.max(0, s.total - s.negative - s.positive)
  const headlineNum = mode === 'positive' ? s.positive : s.negative
  const headlineColor = mode === 'positive' ? 'text-emerald-300' : 'text-rose-300'
  const kindIcon = kind === 'component' ? '⚙' : '🧩'
  const demoPct = totalDemos > 0 ? Math.round((s.demos / totalDemos) * 100) : 0

  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-3 active:bg-ink-700"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg flex-shrink-0 mt-0.5">{kindIcon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {item.code && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 text-ink-400 border border-ink-700">
                  {item.code}
                </span>
              )}
              <span className="font-semibold truncate">{item.name}</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              {s.demos} of {totalDemos} demos ({demoPct}%) · {s.total} note{s.total === 1 ? '' : 's'}
            </div>
            <SplitBar negative={s.negative} positive={s.positive} neutral={neutral} />
            <div className="flex items-center gap-3 text-[11px] mt-1">
              <span className="text-rose-300"><b>{s.negative}</b> neg</span>
              <span className="text-emerald-300"><b>{s.positive}</b> pos</span>
              {neutral > 0 && <span className="text-ink-400"><b>{neutral}</b> other</span>}
            </div>
          </div>
          <div className={`text-3xl font-bold tabular-nums leading-none flex-shrink-0 ${headlineColor}`}>
            {headlineNum}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-ink-700 bg-ink-900/40 p-3 space-y-2">
          {/* Per-category breakdown */}
          {Object.keys(s.perCategory).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(s.perCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${categoryColor(c)}22`, color: categoryColor(c) }}>
                  {c} · {n}
                </span>
              ))}
            </div>
          )}
          {/* Notes */}
          <div className="space-y-1.5">
            {s.notes.slice(0, 6).map(n => {
              const d = designerById(n.designerId)
              return (
                <div key={n.id} className="text-xs text-ink-200 bg-ink-900 rounded-lg p-2">
                  <span className="font-mono text-ink-400 mr-2">{fmtCountdown(n.timestamp)}</span>
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

function SplitBar({ negative, positive, neutral }) {
  const total = negative + positive + neutral
  if (total === 0) return null
  const pct = (n) => `${(n / total) * 100}%`
  return (
    <div className="w-full h-1.5 mt-1.5 bg-ink-900 rounded-full overflow-hidden flex">
      {negative > 0 && <div className="h-full bg-rose-400" style={{ width: pct(negative) }} />}
      {neutral > 0 && <div className="h-full bg-ink-600" style={{ width: pct(neutral) }} />}
      {positive > 0 && <div className="h-full bg-emerald-400" style={{ width: pct(positive) }} />}
    </div>
  )
}

function PuzzleSolveTimes({ solveTimes }) {
  const { perPuzzle, overallAvg, totalSolveEvents, avgGapBetween, longestAvg, shortestAvg } = solveTimes

  if (totalSolveEvents === 0) {
    return (
      <div>
        <div className="px-1 mb-2">
          <div className="text-xs uppercase tracking-wider text-ink-400">Puzzle solve times</div>
          <div className="text-[11px] text-ink-500 mt-0.5">
            How long puzzles take to solve, averaged across every demo of this game.
          </div>
        </div>
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4 text-center text-sm text-ink-500">
          No puzzles solved yet. Use the yellow Puzzle Solved button during a demo to start tracking.
        </div>
      </div>
    )
  }

  const ranked = [...perPuzzle]
    .filter(p => p.avgSolveTime != null)
    .sort((a, b) => b.avgSolveTime - a.avgSolveTime)

  const maxAvg = ranked[0]?.avgSolveTime || 1

  return (
    <div>
      <div className="px-1 mb-2">
        <div className="text-xs uppercase tracking-wider text-ink-400">Puzzle solve times</div>
        <div className="text-[11px] text-ink-500 mt-0.5">
          Time from a puzzle's first mention to when it's marked solved, averaged across all demos.
        </div>
      </div>

      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <SolveStat label="Avg solve time" value={overallAvg != null ? fmtTime(overallAvg) : '—'} mono />
          <SolveStat label="Avg gap between solves" value={avgGapBetween != null ? fmtTime(avgGapBetween) : '—'} mono />
          <SolveStat label="Total solves logged" value={String(totalSolveEvents)} />
          <SolveStat label="Puzzles with timing" value={`${ranked.length} of ${perPuzzle.length}`} />
        </div>

        {(longestAvg || shortestAvg) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {longestAvg && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-rose-300 font-semibold">Longest on average</div>
                <div className="font-semibold text-rose-100 mt-0.5 truncate">{longestAvg.name}</div>
                <div className="text-[11px] text-rose-200/80 mt-0.5 font-mono tabular-nums">
                  avg {fmtTime(longestAvg.avgSolveTime)} · {longestAvg.solveCount} solve{longestAvg.solveCount === 1 ? '' : 's'}
                </div>
              </div>
            )}
            {shortestAvg && shortestAvg.id !== longestAvg?.id && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold">Shortest on average</div>
                <div className="font-semibold text-emerald-100 mt-0.5 truncate">{shortestAvg.name}</div>
                <div className="text-[11px] text-emerald-200/80 mt-0.5 font-mono tabular-nums">
                  avg {fmtTime(shortestAvg.avgSolveTime)} · {shortestAvg.solveCount} solve{shortestAvg.solveCount === 1 ? '' : 's'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5 pt-1">
          {ranked.map(p => {
            const widthPct = Math.max(8, (p.avgSolveTime / maxAvg) * 100)
            return (
              <div key={p.id} className="rounded-lg bg-ink-900 border border-ink-700 p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {p.code && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700">{p.code}</span>
                  )}
                  <span className="font-semibold text-sm text-ink-100 truncate flex-1">{p.name}</span>
                  <span className="font-mono tabular-nums text-sm text-yellow-300">{fmtTime(p.avgSolveTime)}</span>
                </div>
                <div className="w-full h-1.5 mt-1.5 bg-ink-800 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400/70 rounded-full" style={{ width: `${widthPct}%` }} />
                </div>
                <div className="text-[11px] text-ink-400 mt-1 font-mono tabular-nums">
                  {p.solveCount} solve{p.solveCount === 1 ? '' : 's'}
                  {p.fastestSolve != null && p.solveCount > 1 && (
                    <span> · fastest {fmtTime(p.fastestSolve)} · slowest {fmtTime(p.slowestSolve)}</span>
                  )}
                </div>
              </div>
            )
          })}
          {perPuzzle.filter(p => p.avgSolveTime == null && p.solveCount > 0).map(p => (
            <div key={p.id} className="rounded-lg bg-ink-900 border border-ink-700 p-2.5 opacity-60">
              <div className="flex items-center gap-2 flex-wrap">
                {p.code && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700">{p.code}</span>
                )}
                <span className="font-semibold text-sm text-ink-200 truncate flex-1">{p.name}</span>
                <span className="text-[11px] text-ink-400">no timing</span>
              </div>
              <div className="text-[11px] text-ink-500 mt-1">
                Solved {p.solveCount}× but no first-mention before solve, so no duration.
              </div>
            </div>
          ))}
        </div>

        <BenchmarksSubsection perPuzzle={perPuzzle} />
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
      <div className="text-[10px] uppercase tracking-wider text-yellow-300 font-semibold flex items-center gap-1.5">
        <span>⏱</span> Benchmarks
      </div>
      <div className="text-[11px] text-ink-500 -mt-1">
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
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700">{p.code}</span>
              )}
              <span className="font-semibold text-sm text-ink-100 truncate flex-1">{p.name}</span>
              {p.benchmarkName && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-200 border border-yellow-500/40 font-medium">
                  ⏱ {p.benchmarkName}
                </span>
              )}
              <span className="font-mono tabular-nums text-[11px] text-yellow-300">target {fmtCountdown(p.benchmarkSec)}</span>
            </div>
            <div className="text-[11px] mt-1 font-mono tabular-nums flex items-center gap-2 flex-wrap">
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

function SolveStat({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`font-bold text-lg ${mono ? 'font-mono tabular-nums' : ''} text-ink-100`}>{value}</div>
    </div>
  )
}

function CategoryMix({ categoryCounts, categoryColor }) {
  const entries = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = Math.max(...entries.map(([, n]) => n))
  return (
    <div>
      <div className="px-1 mb-2">
        <div className="text-xs uppercase tracking-wider text-ink-400">Category mix</div>
        <div className="text-[11px] text-ink-500 mt-0.5">Across every demo of this game.</div>
      </div>
      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-3 space-y-2">
        {entries.map(([cat, count]) => (
          <div key={cat}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: categoryColor(cat) }} className="font-medium">{cat}</span>
              <span className="text-ink-400">{count}</span>
            </div>
            <div className="w-full h-2 bg-ink-900 rounded-full overflow-hidden">
              <div className="h-full rounded-full"
                style={{ width: `${Math.max(4, (count / max) * 100)}%`, backgroundColor: categoryColor(cat) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
