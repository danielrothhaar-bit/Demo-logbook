import React, { useMemo, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import { aggregateAcrossSessions } from '../utils/synthesis.js'

const STATUSES = [
  { id: 'open',         label: 'Open',         color: '#f87171' },
  { id: 'in_progress',  label: 'In progress',  color: '#fbbf24' },
  { id: 'fixed',        label: 'Fixed',        color: '#34d399' },
  { id: 'needs_retest', label: 'Needs retest', color: '#60a5fa' }
]

export default function Trends() {
  const { state, dispatch, designerById, categoryColor, gameById } = useStore()
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
  const gameSessions = state.sessions.filter(s => s.gameId === game.id).sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  const agg = useMemo(() => aggregateAcrossSessions(state.sessions, game.id), [state.sessions, game.id])

  return (
    <div className="px-4 pt-3 space-y-4">
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

      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4">
        <div className="flex items-baseline gap-3">
          <div className="text-3xl font-bold">{gameSessions.length}</div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">demos of <span className="text-ink-200">{game.name}</span></div>
        </div>
        {gameSessions.length > 0 && (
          <div className="text-xs text-ink-400 mt-1">
            {gameSessions[0]?.date} → {gameSessions[gameSessions.length - 1]?.date}
          </div>
        )}
      </div>

      {/* Recurring friction points */}
      <Section title="Recurring friction" hint="Same minute flagged across multiple demos.">
        {agg.recurringFriction.length === 0 ? (
          <Empty text="No recurring friction yet." />
        ) : (
          agg.recurringFriction.map(b => (
            <div key={b.minute} className="rounded-2xl bg-ink-800 border border-rose-500/30 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-mono text-sm">~{String(b.minute).padStart(2,'0')}:00</div>
                <div className="text-xs">
                  <span className="font-bold text-rose-300">{b.sessionIds.length}</span>
                  <span className="text-ink-400"> of {gameSessions.length} demos</span>
                </div>
              </div>
              <RatioBar value={b.sessionIds.length} max={gameSessions.length} color="#f87171" />
              <div className="mt-2 space-y-1.5">
                {b.notes.slice(0, 3).map(n => {
                  const d = designerById(n.designerId)
                  const sess = state.sessions.find(s => s.id === n.sessionId)
                  return (
                    <div key={n.id} className="text-xs text-ink-200 bg-ink-900 rounded-lg p-2">
                      <span className="font-mono text-ink-400 mr-2">{fmtTime(n.timestamp)}</span>
                      <span className="font-bold mr-1.5" style={{ color: d?.color }}>{d?.initials}</span>
                      <span className="text-ink-400 mr-2">({sess?.date})</span>
                      {n.text}
                    </div>
                  )
                })}
                {b.notes.length > 3 && (
                  <div className="text-[11px] text-ink-500">+{b.notes.length - 3} more</div>
                )}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Category mix */}
      <Section title="Category mix">
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-3">
          {Object.keys(agg.categoryCounts).length === 0 ? (
            <Empty text="No notes yet for this game." />
          ) : (
            Object.entries(agg.categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
              const max = Math.max(...Object.values(agg.categoryCounts))
              return (
                <div key={cat} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: categoryColor(cat) }} className="font-medium">{cat}</span>
                    <span className="text-ink-400">{count}</span>
                  </div>
                  <RatioBar value={count} max={max} color={categoryColor(cat)} />
                </div>
              )
            })
          )}
        </div>
      </Section>

      {/* Action items */}
      <Section title="Action items" hint="Promoted from demo reviews. Tap status to advance.">
        <div className="space-y-2">
          {state.actionItems.map(a => {
            const sCount = a.sourceSessionIds.length
            return (
              <div key={a.id} className="rounded-2xl bg-ink-800 border border-ink-700 p-3">
                <div className="flex items-start gap-3">
                  <StatusPill action={a} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug">{a.text}</div>
                    <div className="text-[11px] text-ink-400 mt-1">
                      from {sCount} demo{sCount === 1 ? '' : 's'}
                      {a.relatedCategory && <> · {a.relatedCategory}</>}
                    </div>
                  </div>
                </div>
                {a.relatedKeyword && <BeforeAfter actionItem={a} />}
              </div>
            )
          })}
          {state.actionItems.length === 0 && <Empty text="No action items tracked yet." />}
        </div>
      </Section>
    </div>
  )
}

function StatusPill({ action }) {
  const { dispatch } = useStore()
  const idx = STATUSES.findIndex(s => s.id === action.status)
  const cur = STATUSES[idx] || STATUSES[0]
  const next = STATUSES[(idx + 1) % STATUSES.length]
  return (
    <button
      onClick={() => dispatch({ type: 'UPDATE_ACTION_ITEM', id: action.id, patch: { status: next.id } })}
      className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: `${cur.color}22`, color: cur.color }}
      title={`Tap to mark ${next.label.toLowerCase()}`}
    >
      {cur.label}
    </button>
  )
}

function BeforeAfter({ actionItem }) {
  const { state } = useStore()
  const before = []
  const after = []
  const sourceSet = new Set(actionItem.sourceSessionIds)
  const latestSourceDate = Math.max(...state.sessions
    .filter(s => sourceSet.has(s.id))
    .map(s => new Date(s.date).getTime()))

  for (const s of state.sessions) {
    const has = s.notes.some(n =>
      (n.text || '').toLowerCase().includes(actionItem.relatedKeyword.toLowerCase()) ||
      n.categories?.includes(actionItem.relatedCategory)
    )
    const t = new Date(s.date).getTime()
    if (t <= latestSourceDate) before.push({ s, has })
    else after.push({ s, has })
  }

  const beforeRate = before.length ? before.filter(x => x.has).length / before.length : 0
  const afterRate  = after.length  ? after.filter(x => x.has).length  / after.length  : null

  if (afterRate === null) return null
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <Stat label="Before fix" value={`${Math.round(beforeRate * 100)}%`} sub={`${before.length} runs`} />
      <Stat label="After fix" value={`${Math.round(afterRate * 100)}%`} sub={`${after.length} runs`} positive={afterRate < beforeRate} />
    </div>
  )
}

function Stat({ label, value, sub, positive }) {
  return (
    <div className={`rounded-xl p-2 border ${positive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-ink-900 border-ink-700'}`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-ink-400">{sub}</div>
    </div>
  )
}

function RatioBar({ value, max, color }) {
  const pct = max ? Math.max(4, (value / max) * 100) : 0
  return (
    <div className="w-full h-2 bg-ink-900 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <div>
      <div className="px-1 mb-2">
        <div className="text-xs uppercase tracking-wider text-ink-400">{title}</div>
        {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Empty({ text }) {
  return <div className="text-ink-500 text-sm px-1 py-2">{text}</div>
}
