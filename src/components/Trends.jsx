import React, { useMemo, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import { aggregateAcrossSessions } from '../utils/synthesis.js'

export default function Trends() {
  const { state, categoryColor, gameById } = useStore()
  const games = state.games
  const [gameId, setGameId] = useState(games[0]?.id || '')

  if (games.length === 0) {
    return (
      <div className="px-4 pt-6">
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center">
          <div className="font-semibold mb-1">No games yet</div>
          <div className="text-sm text-ink-400">Add games in Admin to see trends.</div>
        </div>
      </div>
    )
  }

  const game = gameById(gameId) || games[0]
  const agg = useMemo(() => aggregateAcrossSessions(state.sessions, game.id), [state.sessions, game.id])

  return (
    <div className="px-4 pt-3 space-y-4">
      {/* Game switcher */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {games.map(g => (
          <button
            key={g.id}
            onClick={() => setGameId(g.id)}
            className={`px-3 py-2 rounded-full text-sm font-medium border whitespace-nowrap ${
              g.id === game.id ? 'bg-accent-500 text-ink-50 border-accent-500' : 'bg-ink-800 border-ink-700 text-ink-200'
            }`}
          >{g.name}</button>
        ))}
      </div>

      <DemoStats game={game} agg={agg} />

      {agg.total === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-ink-400">
          No demos logged for this game yet.
        </div>
      ) : (
        <>
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
    </div>
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
                  <span className="font-mono text-ink-400 mr-2">{fmtTime(n.timestamp)}</span>
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
