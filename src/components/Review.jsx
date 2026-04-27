import React, { useMemo, useState } from 'react'
import { useStore, fmtTime, fmtCountdown, fmtClockTime, parseCountdown, DEMO_TARGET_SEC } from '../store.jsx'
import NoteCard from './NoteCard.jsx'
import NoteEditor from './NoteEditor.jsx'
import {
  findConsensus, findDivergence, findDuplicates, summarize,
  analyzePuzzles, frustrationDensity, findStuckZones, sessionMetrics
} from '../utils/synthesis.js'

const TABS = [
  { id: 'timeline', label: 'Notes' },
  { id: 'synthesis', label: 'Timeline' },
  { id: 'summary', label: 'Summary' }
]

const todayISO = () => new Date().toISOString().slice(0, 10)

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadSessionCsv(session, { gameName, designerById, gameById }) {
  const game = gameById(session.gameId)
  const designerNames = [...new Set(session.notes.map(n => n.designerId))]
    .map(id => designerById(id)?.name)
    .filter(Boolean)
  const totalSec = session.timerElapsed || (session.notes.length
    ? Math.max(0, ...session.notes.map(n => n.timestamp))
    : 0)

  const lines = []
  lines.push(['Game', gameName(session.gameId)].map(csvCell).join(','))
  lines.push(['Date', session.date || ''].map(csvCell).join(','))
  lines.push(['Time', session.time || ''].map(csvCell).join(','))
  lines.push(['Team Size', session.teamSize ?? ''].map(csvCell).join(','))
  lines.push(['Experience', session.experience || ''].map(csvCell).join(','))
  lines.push(['Designers', designerNames.join('; ')].map(csvCell).join(','))
  lines.push(['Total Notes', session.notes.length].map(csvCell).join(','))
  lines.push(['Elapsed', fmtTime(totalSec)].map(csvCell).join(','))
  const adj = session.timerAdjustment || 0
  lines.push(['Time Adjusted', adj === 0 ? '00:00' : (adj > 0 ? '+' : '-') + fmtTime(Math.abs(adj))]
    .map(csvCell).join(','))
  lines.push(['Status', session.ended ? 'Ended' : 'In progress'].map(csvCell).join(','))
  lines.push('')
  lines.push(['Timestamp', 'Designer', 'Kind', 'Categories', 'Text', 'Puzzles', 'Components', 'Has Photo']
    .map(csvCell).join(','))

  const sorted = [...session.notes].sort((a, b) => a.timestamp - b.timestamp)
  for (const n of sorted) {
    const d = designerById(n.designerId)
    const puzzles = (n.puzzleIds || [])
      .map(id => game?.puzzles?.find(p => p.id === id)?.name).filter(Boolean).join('; ')
    const components = (n.componentIds || [])
      .map(id => game?.components?.find(c => c.id === id)?.name).filter(Boolean).join('; ')
    lines.push([
      fmtCountdown(n.timestamp),
      d?.name || '',
      n.kind || 'note',
      (n.categories || []).join('; '),
      n.text || '',
      puzzles,
      components,
      n.photoUrl ? 'yes' : 'no'
    ].map(csvCell).join(','))
  }

  const csv = lines.join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const safeName = (gameName(session.gameId) || 'demo').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  const a = document.createElement('a')
  a.href = url
  a.download = `demo-${safeName}-${session.date || 'unknown'}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function Review() {
  const { reviewSession } = useStore()
  if (!reviewSession) {
    return <SessionPicker />
  }
  return <ReviewBody session={reviewSession} />
}

// ============================================================================
// Landing list — defaults to today's sessions, with date + game filters
// ============================================================================

function SessionPicker() {
  const { state, dispatch, gameName, designerById, gameById } = useStore()

  const [filterGameIds, setFilterGameIds] = useState([])
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo,   setDateTo]   = useState(todayISO())
  const [filterDesignerIds, setFilterDesignerIds] = useState([])

  const toggle = (arr, setter, v) =>
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  const filtered = useMemo(() => {
    return state.sessions
      .filter(s => filterGameIds.length === 0 || filterGameIds.includes(s.gameId))
      .filter(s => !dateFrom || s.date >= dateFrom)
      .filter(s => !dateTo   || s.date <= dateTo)
      .filter(s => {
        if (filterDesignerIds.length === 0) return true
        const sessionDesigners = new Set(s.notes.map(n => n.designerId))
        return filterDesignerIds.some(d => sessionDesigners.has(d))
      })
      .sort((a, b) => {
        const d = new Date(b.date).getTime() - new Date(a.date).getTime()
        return d !== 0 ? d : (b.timerFirstStartedAt || 0) - (a.timerFirstStartedAt || 0)
      })
  }, [state.sessions, filterGameIds, dateFrom, dateTo, filterDesignerIds])

  const setRange = (days) => {
    const today = todayISO()
    if (days === 0) { setDateFrom(today); setDateTo(today); return }
    if (days === Infinity) { setDateFrom(''); setDateTo(''); return }
    const d = new Date()
    d.setDate(d.getDate() - days)
    setDateFrom(d.toISOString().slice(0, 10))
    setDateTo(today)
  }

  const isToday = dateFrom === todayISO() && dateTo === todayISO()

  return (
    <div className="px-4 pt-3 space-y-3">
      {/* Quick range chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {[
          { label: 'Today', test: () => isToday, days: 0 },
          { label: 'Last 7d', days: 7 },
          { label: 'Last 30d', days: 30 },
          { label: 'All', days: Infinity }
        ].map(({ label, days }) => (
          <button key={label} onClick={() => setRange(days)}
            className="px-3 py-2 rounded-full text-sm font-medium border whitespace-nowrap bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700">
            {label}
          </button>
        ))}
      </div>

      <details className="rounded-2xl bg-ink-800/60 border border-ink-700">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center justify-between">
          <span>Filters</span>
          <span className="text-xs text-ink-400">
            {(filterGameIds.length + filterDesignerIds.length > 0)
              ? `${filterGameIds.length + filterDesignerIds.length} active`
              : (isToday ? 'today' : 'custom')}
          </span>
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <div>
            <div className="text-xs text-ink-400 mb-1">Date range</div>
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 bg-ink-900 border border-ink-700 rounded-lg px-2 py-2 text-sm" />
              <span className="text-ink-500">→</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 bg-ink-900 border border-ink-700 rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>

          <div>
            <div className="text-xs text-ink-400 mb-1">Game</div>
            <div className="flex flex-wrap gap-1.5">
              {state.games.map(g => {
                const active = filterGameIds.includes(g.id)
                return (
                  <button key={g.id} onClick={() => toggle(filterGameIds, setFilterGameIds, g.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      active ? 'bg-accent-500 border-accent-500 text-ink-50' : 'bg-ink-900 border-ink-700 text-ink-200'
                    }`}>
                    {g.name}
                  </button>
                )
              })}
              {state.games.length === 0 && <span className="text-xs text-ink-500">No games yet — add in Admin.</span>}
            </div>
          </div>

          <div>
            <div className="text-xs text-ink-400 mb-1">Designer</div>
            <div className="flex flex-wrap gap-1.5">
              {state.designers.map(d => {
                const active = filterDesignerIds.includes(d.id)
                return (
                  <button key={d.id} onClick={() => toggle(filterDesignerIds, setFilterDesignerIds, d.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                      active ? 'border-transparent text-ink-950' : 'border-ink-700 text-ink-200'
                    }`}
                    style={active ? { backgroundColor: d.color } : {}}>
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </details>

      <div className="text-xs text-ink-400 px-1">
        {filtered.length} of {state.sessions.length} demos
        {isToday && filtered.length === 0 && state.sessions.length > 0 &&
          <> — <button onClick={() => setRange(Infinity)} className="text-accent-400 active:text-accent-500">show all</button></>}
      </div>

      <div className="space-y-2">
        {filtered.map(s => {
          const sessionDesigners = [...new Set(s.notes.map(n => n.designerId))].map(id => designerById(id)).filter(Boolean)
          return (
            <div key={s.id} className="rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
              <button
                onClick={() => dispatch({ type: 'OPEN_SESSION_REVIEW', id: s.id })}
                className="w-full text-left p-4 active:bg-ink-700"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">
                      {gameName(s.gameId)}
                      {!s.ended && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-500/20 text-accent-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" /> Live
                      </span>}
                    </div>
                    <div className="text-sm text-ink-300 mt-0.5">
                      {s.time && <span>{fmtClockTime(s.time)}</span>}
                      {s.time && <span className="text-ink-500 mx-1.5">·</span>}
                      <span>{s.date}</span>
                    </div>
                    <div className="text-[11px] text-ink-500 mt-0.5">
                      Team of {s.teamSize} · {s.experience} · {s.notes.length} notes
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {sessionDesigners.map(d => (
                      <span key={d.id}
                        className="w-7 h-7 rounded-full border-2 border-ink-800 flex items-center justify-center text-[10px] font-bold text-ink-950"
                        style={{ backgroundColor: d.color }}>
                        {d.initials}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
              <div className="border-t border-ink-700 px-3 py-2 flex items-center justify-end gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    downloadSessionCsv(s, { gameName, designerById, gameById })
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-ink-700 border border-ink-600 text-ink-100 active:bg-ink-600 font-medium"
                >
                  Export Demo
                </button>
                {s.ended && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Restart "${gameName(s.gameId)}" demo and resume in Live?`)) {
                        dispatch({ type: 'RESTART_SESSION', sessionId: s.id })
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 active:bg-emerald-500/25 font-medium"
                  >
                    Restart Demo
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-ink-500 text-sm text-center py-6">No demos match the filters.</div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Single-session review
// ============================================================================

function ReviewBody({ session: reviewSession }) {
  const { dispatch, gameById } = useStore()
  const reviewGame = gameById(reviewSession.gameId)
  const [tab, setTab] = useState('timeline')
  const [filterCats, setFilterCats] = useState([])
  const [filterDesigners, setFilterDesigners] = useState([])
  const [mergeDuplicates, setMergeDuplicates] = useState(false)
  const [tsRange, setTsRange] = useState([0, 0])
  const [editNote, setEditNote] = useState(null)
  const [search, setSearch] = useState('')

  // Cover every note timestamp so the default range never silently hides notes
  // (notes can extend past timerElapsed if the timer was paused/reset/adjusted).
  const totalSec = Math.max(
    reviewSession.timerElapsed || 0,
    ...reviewSession.notes.map(n => n.timestamp ?? 0),
    0
  )
  const range = tsRange[1] === 0 ? [0, Math.max(totalSec, 60)] : tsRange

  const synthNotes = useMemo(() =>
    reviewSession.notes.filter(n => n.kind !== 'feedback'), [reviewSession.notes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reviewSession.notes.filter(n => {
      if (filterCats.length && !n.categories.some(c => filterCats.includes(c))) return false
      if (filterDesigners.length && !filterDesigners.includes(n.designerId)) return false
      if (n.timestamp < range[0] || n.timestamp > range[1]) return false
      if (q && !(n.text || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [reviewSession.notes, filterCats, filterDesigners, range, search])

  const consensus  = useMemo(() => findConsensus(synthNotes),  [synthNotes])
  const divergence = useMemo(() => findDivergence(synthNotes), [synthNotes])
  const duplicates = useMemo(() => findDuplicates(synthNotes), [synthNotes])
  const summary    = useMemo(() => summarize(synthNotes),      [synthNotes])
  const puzzleStats = useMemo(() => analyzePuzzles(synthNotes, reviewGame), [synthNotes, reviewGame])
  const stuckZones  = useMemo(() => findStuckZones(synthNotes),              [synthNotes])
  const density     = useMemo(() => frustrationDensity(synthNotes, totalSec), [synthNotes, totalSec])
  const metrics     = useMemo(() => sessionMetrics(synthNotes, reviewGame, totalSec), [synthNotes, reviewGame, totalSec])

  const timeline = useMemo(() => {
    const dupNoteIds = new Set()
    const dupCards = []
    if (mergeDuplicates) {
      for (const g of duplicates) {
        g.notes.forEach(n => dupNoteIds.add(n.id))
        if (g.notes.every(n => filtered.some(f => f.id === n.id))) {
          dupCards.push({
            kind: 'merged',
            id: 'dup-' + g.notes.map(n => n.id).join('-'),
            timestamp: g.startTs,
            group: g
          })
        }
      }
    }
    const items = filtered
      .filter(n => !mergeDuplicates || !dupNoteIds.has(n.id))
      .map(n => ({ kind: 'note', id: n.id, timestamp: n.timestamp, note: n }))
    return [...items, ...dupCards].sort((a, b) => a.timestamp - b.timestamp)
  }, [filtered, duplicates, mergeDuplicates])

  return (
    <div className="px-4 pt-3 space-y-3">
      {/* Big red Back button — out of the header card */}
      <button
        onClick={() => dispatch({ type: 'OPEN_SESSION_REVIEW', id: null })}
        className="w-full rounded-2xl bg-black border border-black active:bg-ink-900 py-3.5 px-4 flex items-center gap-3 text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span className="font-semibold">Back to demos</span>
      </button>

      <ReviewHeader session={reviewSession} totalSec={totalSec} />

      <div className="flex gap-1 bg-ink-800 border border-ink-700 rounded-full p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors ${
              tab === t.id ? 'bg-accent-500 text-ink-50' : 'text-ink-200 active:bg-ink-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'timeline' && (
        <>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full bg-ink-800 border border-ink-700 rounded-full px-4 py-2.5 pl-10 outline-none focus:border-accent-500 text-sm"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 active:text-ink-200 text-lg leading-none"
              >×</button>
            )}
          </div>

          <Filters
            session={reviewSession}
            filterCats={filterCats} setFilterCats={setFilterCats}
            filterDesigners={filterDesigners} setFilterDesigners={setFilterDesigners}
            range={range} setTsRange={setTsRange} totalSec={Math.max(totalSec, 60)}
            mergeDuplicates={mergeDuplicates} setMergeDuplicates={setMergeDuplicates}
          />
          <div className="text-xs text-ink-400 px-1">
            {filtered.length} of {reviewSession.notes.length} notes
            {mergeDuplicates && duplicates.length > 0 && ` · ${duplicates.length} duplicate group${duplicates.length>1?'s':''} merged`}
          </div>
          <div className="space-y-2">
            {timeline.length === 0 && (
              <div className="text-ink-400 text-sm text-center py-6">No notes match these filters.</div>
            )}
            {timeline.map(item => (
              item.kind === 'note'
                ? <NoteCard key={item.id} note={item.note}
                    onEdit={() => setEditNote(item.note)} />
                : <MergedCard key={item.id} group={item.group} />
            ))}
          </div>
        </>
      )}

      {tab === 'synthesis' && (
        <Synthesis
          consensus={consensus}
          divergence={divergence}
          duplicates={duplicates}
          puzzleStats={puzzleStats}
          stuckZones={stuckZones}
          density={density}
          totalSec={totalSec}
        />
      )}

      {tab === 'summary' && (
        <Summary summary={summary} metrics={metrics} session={reviewSession} />
      )}

      {editNote && (
        <NoteEditor note={editNote} sessionId={reviewSession.id} onClose={() => setEditNote(null)} />
      )}
    </div>
  )
}

function ReviewHeader({ session, totalSec }) {
  const { state, dispatch, designerById, gameName, gameById } = useStore()
  const [editing, setEditing] = useState(false)
  const [gameId, setGameId] = useState(session.gameId)
  const [teamSize, setTeamSize] = useState(session.teamSize)
  const [experience, setExperience] = useState(session.experience)
  const [date, setDate] = useState(session.date)
  const [time, setTime] = useState(session.time || '')

  const designers = [...new Set(session.notes.map(n => n.designerId))].map(id => designerById(id)).filter(Boolean)

  const startedAtClock = session.timerFirstStartedAt
    ? fmtClockTime(new Date(session.timerFirstStartedAt))
    : null

  const save = () => {
    dispatch({
      type: 'UPDATE_SESSION_META',
      sessionId: session.id,
      patch: { gameId, teamSize, experience, date, time }
    })
    setEditing(false)
  }

  const removeSession = () => {
    if (!confirm(`Permanently delete this ${gameName(session.gameId)} demo and all its ${session.notes.length} notes? This cannot be undone.`)) return
    dispatch({ type: 'DELETE_SESSION', sessionId: session.id })
    dispatch({ type: 'OPEN_SESSION_REVIEW', id: null })
  }

  if (editing) {
    return (
      <div className="rounded-2xl bg-ink-800 border border-accent-500/40 p-4 space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Game</div>
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}
            className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500">
            {state.games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Team size</div>
          <div className="flex items-center gap-3">
            <button onClick={() => setTeamSize(Math.max(1, teamSize - 1))}
              className="w-10 h-10 rounded-full bg-ink-900 border border-ink-700 active:bg-ink-700 text-xl">−</button>
            <div className="flex-1 text-center text-2xl font-mono tabular-nums">{teamSize}</div>
            <button onClick={() => setTeamSize(Math.min(12, teamSize + 1))}
              className="w-10 h-10 rounded-full bg-ink-900 border border-ink-700 active:bg-ink-700 text-xl">+</button>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Experience</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'new', label: 'New' },
              { id: 'experienced', label: 'Experienced' },
              { id: 'enthusiast', label: 'Enthusiast' }
            ].map(opt => (
              <button key={opt.id} onClick={() => setExperience(opt.id)}
                className={`py-2 rounded-lg text-sm font-medium border ${
                  experience === opt.id ? 'bg-accent-500 border-accent-500 text-ink-50'
                                        : 'bg-ink-900 border-ink-700 text-ink-200 active:bg-ink-700'
                }`}>{opt.label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Date</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full max-w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500" />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Time</div>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={1800}
              className="w-full max-w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(false)}
            className="flex-1 py-2.5 rounded-xl bg-ink-700 active:bg-ink-600 font-medium">Cancel</button>
          <button onClick={save}
            className="flex-[2] py-2.5 rounded-xl bg-emerald-500 active:bg-emerald-600 text-ink-950 font-bold">Save</button>
        </div>

        <button onClick={removeSession}
          className="w-full py-3 rounded-xl bg-rose-600 active:bg-rose-700 text-white font-semibold">
          Delete this Demo
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg leading-tight flex flex-wrap items-baseline gap-x-2">
            <span>{gameName(session.gameId)}</span>
            <span className="text-ink-500">|</span>
            <span>{session.date}</span>
            {session.time && <>
              <span className="text-ink-500">|</span>
              <span>{fmtClockTime(session.time)}</span>
            </>}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-400">Guests</dt>
              <dd className="text-sm font-medium text-ink-100">{session.teamSize}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-400">Experience</dt>
              <dd className="text-sm font-medium text-ink-100 capitalize">{session.experience}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-400">Elapsed</dt>
              <dd className="text-sm font-mono tabular-nums text-ink-100">{fmtTime(totalSec)}</dd>
            </div>
            {startedAtClock && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-ink-400">Actual start</dt>
                <dd className="text-sm font-medium text-ink-100">{startedAtClock}</dd>
              </div>
            )}
            {(session.timerAdjustment || 0) !== 0 && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-ink-400">Time adjusted</dt>
                <dd className={`text-sm font-mono tabular-nums ${
                  session.timerAdjustment > 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}>
                  {session.timerAdjustment > 0 ? '+' : '−'}{fmtTime(Math.abs(session.timerAdjustment))}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex -space-x-2">
          {designers.map(d => (
            <span key={d.id}
              className="w-7 h-7 rounded-full border-2 border-ink-800 flex items-center justify-center text-[10px] font-bold text-ink-950"
              style={{ backgroundColor: d.color }}>
              {d.initials}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={() => downloadSessionCsv(session, { gameName, designerById, gameById })}
          className="text-xs text-ink-100 px-3 py-1.5 rounded-lg bg-accent-500/15 border border-accent-500/40 active:bg-accent-500/25 font-medium flex items-center gap-1.5"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export Demo
        </button>
        <button onClick={() => setEditing(true)}
          className="text-xs text-ink-300 active:text-ink-100 px-2 py-1 rounded-lg bg-ink-700 active:bg-ink-600">
          Edit details
        </button>
      </div>
    </div>
  )
}

function Filters({ session, filterCats, setFilterCats, filterDesigners, setFilterDesigners, range, setTsRange, totalSec, mergeDuplicates, setMergeDuplicates }) {
  const { designerById, categoryColor } = useStore()
  const cats = [...new Set(session.notes.flatMap(n => n.categories))]
  const designers = [...new Set(session.notes.map(n => n.designerId))].map(id => designerById(id)).filter(Boolean)

  const toggle = (arr, setter, v) => {
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  }

  return (
    <details className="rounded-2xl bg-ink-800/60 border border-ink-700">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center justify-between">
        <span>Filters</span>
        <span className="text-xs text-ink-400">
          {filterCats.length + filterDesigners.length > 0 ? `${filterCats.length + filterDesigners.length} active` : 'all'}
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div>
          <div className="text-xs text-ink-400 mb-1">Categories</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map(c => {
              const active = filterCats.includes(c)
              return (
                <button key={c} onClick={() => toggle(filterCats, setFilterCats, c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${active ? 'border-accent-500' : 'border-ink-700'}`}
                  style={active ? { backgroundColor: categoryColor(c), color: '#0b0f17' } : { color: categoryColor(c) }}>
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-xs text-ink-400 mb-1">Designers</div>
          <div className="flex flex-wrap gap-1.5">
            {designers.map(d => {
              const active = filterDesigners.includes(d.id)
              return (
                <button key={d.id} onClick={() => toggle(filterDesigners, setFilterDesigners, d.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                    active ? 'border-transparent text-ink-950' : 'border-ink-700 text-ink-200'
                  }`}
                  style={active ? { backgroundColor: d.color } : {}}>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-xs text-ink-400 mb-1">Time range: {fmtCountdown(range[0])} → {fmtCountdown(range[1])}</div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={totalSec} value={range[0]}
              onChange={(e) => setTsRange([Math.min(+e.target.value, range[1]), range[1]])}
              className="flex-1 accent-red-500" />
            <input type="range" min={0} max={totalSec} value={range[1]}
              onChange={(e) => setTsRange([range[0], Math.max(+e.target.value, range[0])])}
              className="flex-1 accent-red-500" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mergeDuplicates} onChange={(e) => setMergeDuplicates(e.target.checked)}
            className="w-5 h-5 accent-red-500" />
          Merge likely duplicates
        </label>
      </div>
    </details>
  )
}

function MergedCard({ group }) {
  const { designerById, categoryColor } = useStore()
  const cats = [...new Set(group.notes.flatMap(n => n.categories))]
  const designers = group.designerIds.map(id => designerById(id)).filter(Boolean)
  return (
    <div className="rounded-2xl p-3 bg-ink-800 border border-emerald-500/30 animate-fadeUp">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-xs tabular-nums text-ink-400 bg-ink-900 rounded px-1.5 py-0.5">
          {fmtCountdown(group.startTs)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 rounded-full px-2 py-0.5 font-semibold">
          Merged · {group.notes.length}×
        </span>
        <div className="flex flex-wrap gap-1 flex-1">
          {cats.map(c => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${categoryColor(c)}22`, color: categoryColor(c) }}>{c}</span>
          ))}
        </div>
        <div className="flex -space-x-1.5">
          {designers.map(d => (
            <span key={d.id} className="w-5 h-5 rounded-full border border-ink-800 flex items-center justify-center text-[9px] font-bold text-ink-950"
                  style={{ backgroundColor: d.color }} title={d.name}>{d.initials}</span>
          ))}
        </div>
      </div>
      <div className="text-[15px] leading-snug text-ink-50">{group.mergedText}</div>
      <details className="mt-2">
        <summary className="text-[11px] text-ink-400 cursor-pointer">Show all {group.notes.length} originals</summary>
        <div className="mt-2 space-y-1.5">
          {group.notes.map(n => {
            const d = designerById(n.designerId)
            return (
              <div key={n.id} className="text-xs text-ink-300 bg-ink-900 rounded-lg p-2">
                <span className="font-mono text-ink-400 mr-2">{fmtCountdown(n.timestamp)}</span>
                <span className="font-bold mr-2" style={{ color: d?.color }}>{d?.initials}</span>
                {n.text}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

function Synthesis({ consensus, divergence, duplicates, puzzleStats, stuckZones, density, totalSec }) {
  const { designerById, categoryColor } = useStore()
  const POSITIVE_SET = new Set(['Wow Moment', 'Puzzle Solved'])
  return (
    <div className="space-y-4">
      <PuzzleSolveTimelineSection puzzles={puzzleStats} totalSec={totalSec} />

      <PuzzleProgressSection puzzles={puzzleStats} />

      <FrustrationTimelineSection density={density} />

      <Section title="Stuck zones" hint="Runs of negative notes without a positive resolution in between.">
        {stuckZones.length === 0 && <Empty text="No sustained stuck zones detected." />}
        {stuckZones.map((z, i) => (
          <div key={i} className="rounded-2xl bg-ink-800 border border-rose-500/40 p-3 animate-fadeUp">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="font-mono text-ink-300">{fmtCountdown(z.startTs)}–{fmtCountdown(z.endTs)}</span>
              <span className="text-rose-300 font-semibold">{z.notes.length} negative notes</span>
              <span className="text-ink-400">over {fmtTime(z.duration)}</span>
              {z.designerIds.length > 1 && (
                <span className="text-ink-400">· {z.designerIds.length} designers</span>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {z.notes.map(n => {
                const d = designerById(n.designerId)
                return (
                  <div key={n.id} className="text-sm text-rose-100 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                    <span className="font-mono text-[10px] text-rose-300/70 mr-2">{fmtCountdown(n.timestamp)}</span>
                    <span className="font-bold mr-2" style={{ color: d?.color }}>{d?.initials}</span>
                    {n.text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Consensus observations" hint="Multiple designers logged the same kind of moment within ~90s.">
        {consensus.length === 0 && <Empty text="No consensus moments detected." />}
        {consensus.map((c, i) => (
          <div key={i} className="rounded-2xl bg-ink-800 border border-emerald-500/40 p-3 animate-fadeUp">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-ink-300">{fmtCountdown(c.startTs)}–{fmtCountdown(c.endTs)}</span>
              <span className="px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${categoryColor(c.category)}22`, color: categoryColor(c.category) }}>
                {c.category}
              </span>
              <span className="text-emerald-300 font-semibold">· {c.designerIds.length} designers agree</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {c.notes.map(n => {
                const d = designerById(n.designerId)
                return (
                  <div key={n.id} className="text-sm text-ink-100 bg-ink-900 rounded-lg p-2">
                    <span className="font-bold mr-2" style={{ color: d?.color }}>{d?.initials}</span>{n.text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Divergence" hint="Designers logged opposite reactions in the same window.">
        {divergence.length === 0 && <Empty text="No contradictions detected." />}
        {divergence.map((d, i) => (
          <div key={i} className="rounded-2xl bg-ink-800 border border-rose-500/40 p-3 animate-fadeUp">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-ink-300">{fmtCountdown(d.startTs)}–{fmtCountdown(d.endTs)}</span>
              <span className="text-rose-300 font-semibold">Mixed reactions</span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {d.notes.map(n => {
                const designer = designerById(n.designerId)
                const isPos = n.categories?.some(c => POSITIVE_SET.has(c))
                return (
                  <div key={n.id} className={`text-sm rounded-lg p-2 border ${
                    isPos ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-100'
                  }`}>
                    <span className="font-bold mr-2" style={{ color: designer?.color }}>{designer?.initials}</span>
                    {n.text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Likely duplicates" hint="Same observation logged by 2+ designers ~30s apart.">
        {duplicates.length === 0 && <Empty text="No duplicates detected." />}
        {duplicates.map((g, i) => (
          <MergedCard key={i} group={g} />
        ))}
      </Section>
    </div>
  )
}

function PuzzleSolveTimelineSection({ puzzles, totalSec }) {
  const solved = (puzzles || [])
    .filter(p => p.solvedTs != null)
    .sort((a, b) => a.solvedTs - b.solvedTs)

  // Puzzles with a benchmark target (any puzzle, even unsolved) — render as
  // vertical guide lines so designers can see actual solve vs target.
  const benchmarks = (puzzles || [])
    .map(p => ({ ...p, benchSec: parseCountdown(p.benchmark) }))
    .filter(p => p.benchSec != null)
  const benchSecById = {}
  for (const b of benchmarks) benchSecById[b.id] = b.benchSec

  if (!solved.length && !benchmarks.length) {
    return (
      <Section title="Puzzle solve timeline" hint="When each puzzle was marked solved this demo.">
        <Empty text="No puzzles marked solved yet." />
      </Section>
    )
  }

  // Always extend the axis through 60:00 so the timer-end line is visible,
  // and out to the latest event (solve or benchmark) plus any overtime.
  const span = Math.max(
    totalSec || 0,
    DEMO_TARGET_SEC,
    ...solved.map(p => p.solvedTs),
    ...benchmarks.map(p => p.benchSec)
  )

  // 10-minute grid ticks across the axis underneath the track.
  const TICK_STEP = 600
  const ticks = []
  for (let t = 0; t <= span; t += TICK_STEP) ticks.push(t)
  const showTimerEndLine = span >= DEMO_TARGET_SEC
  const BENCHMARK_TOLERANCE_SEC = 180 // ±3 min from goal still counts as "on time"

  return (
    <Section title="Puzzle solve timeline" hint={`${solved.length} of ${puzzles.length} puzzles solved.`}>
      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4 space-y-2">
        <div className="relative h-20 mt-6">
          {/* 10-minute grid ticks — drawn first so everything else stacks on top. */}
          {ticks.map(t => {
            if (t === 0 || t > span) return null
            if (showTimerEndLine && t === DEMO_TARGET_SEC) return null
            const pct = (t / span) * 100
            return (
              <div key={`grid-${t}`}
                className="absolute top-0 bottom-0 w-px bg-ink-700/50"
                style={{ left: `${pct}%` }}
              />
            )
          })}

          {/* Timer-end line — solid, with a small label so it can't be missed. */}
          {showTimerEndLine && (
            <div
              className="absolute top-0 bottom-0 -translate-x-1/2"
              style={{ left: `${(DEMO_TARGET_SEC / span) * 100}%` }}
            >
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-rose-500/80" />
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/60 text-[9px] font-bold text-rose-200 whitespace-nowrap">
                ⏰ Timer end
              </div>
            </div>
          )}

          {/* Center axis bar */}
          <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-ink-700 rounded-full" />

          {/* Benchmark vertical guide lines — yellow goal markers. */}
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
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/40 text-[10px] font-semibold text-yellow-200 whitespace-nowrap shadow-sm"
                  title={`Benchmark · ${p.name} · ${fmtCountdown(p.benchSec)}`}
                >
                  ⏱ {label}
                </div>
              </div>
            )
          })}

          {/* Solve dots — green/red for benchmarked puzzles based on ±3-min window, else yellow. */}
          {solved.map((p, i) => {
            const pct = Math.min(100, Math.max(0, (p.solvedTs / span) * 100))
            const benchSec = benchSecById[p.id]
            const hasBenchmark = benchSec != null
            const onTime = hasBenchmark && Math.abs(p.solvedTs - benchSec) <= BENCHMARK_TOLERANCE_SEC
            const dotClass = !hasBenchmark
              ? 'bg-yellow-400 shadow-yellow-400/30'
              : onTime
                ? 'bg-emerald-400 shadow-emerald-400/40'
                : 'bg-rose-500 shadow-rose-500/40'
            const deltaLabel = hasBenchmark
              ? (() => {
                  const delta = p.solvedTs - benchSec
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
                <div className="absolute left-1/2 -translate-x-1/2 -top-9 px-2 py-1 rounded-md bg-ink-900 border border-ink-700 text-[11px] text-ink-100 font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 shadow-xl">
                  {p.name}
                  <span className="text-ink-400 font-mono ml-1">· {fmtCountdown(p.solvedTs)}</span>
                  {deltaLabel && (
                    <span className={`ml-1 ${onTime ? 'text-emerald-300' : 'text-rose-300'}`}>· {deltaLabel}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Minute axis underneath — vertical tick + label per 10 minutes. */}
        <div className="relative h-5">
          {ticks.map(t => {
            if (t > span) return null
            const pct = (t / span) * 100
            const isTimerEnd = showTimerEndLine && t === DEMO_TARGET_SEC
            return (
              <div key={`label-${t}`}
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${pct}%` }}
              >
                <span className={`w-px h-1.5 ${isTimerEnd ? 'bg-rose-400' : 'bg-ink-500'}`} />
                <span className={`text-[10px] font-mono tabular-nums whitespace-nowrap ${
                  isTimerEnd ? 'text-rose-300 font-semibold' : 'text-ink-400'
                }`}>
                  {t / 60}m
                </span>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-400 pt-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> solved
          </span>
          {benchmarks.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> within ±3 min of benchmark
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> off benchmark by &gt;3 min
              </span>
            </>
          )}
        </div>

        <div className="space-y-1.5 pt-1">
          {solved.map((p, i) => {
            const prev = i > 0 ? solved[i - 1] : null
            const gap = prev ? p.solvedTs - prev.solvedTs : null
            return (
              <div key={p.id} className="flex items-start gap-2 text-xs bg-ink-900 border border-ink-700 rounded-lg p-2">
                <span className="w-5 h-5 rounded-full bg-yellow-400 text-ink-950 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.code && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700">{p.code}</span>
                    )}
                    <span className="font-semibold text-ink-100 truncate">{p.name}</span>
                  </div>
                  <div className="text-[11px] text-ink-400 mt-0.5 font-mono tabular-nums">
                    solved {fmtCountdown(p.solvedTs)}
                    {p.timeOnPuzzle != null && p.timeOnPuzzle > 0 && (
                      <span> · took {fmtTime(p.timeOnPuzzle)}</span>
                    )}
                    {gap != null && (
                      <span> · {fmtTime(gap)} after #{i}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

function PuzzleProgressSection({ puzzles }) {
  const { designerById } = useStore()
  const [openId, setOpenId] = useState(null)

  if (!puzzles.length) {
    return (
      <Section title="Puzzle progress" hint="Solve status per puzzle for this demo.">
        <Empty text="No puzzles defined for this game. Add them in Admin → Games → puzzles." />
      </Section>
    )
  }

  // Order: untouched last, then attempted-but-stuck (most frustration first),
  // then solved (slowest first so trouble spots stay near the top).
  const ordered = [...puzzles].sort((a, b) => {
    const order = { attempted: 0, solved: 1, untouched: 2 }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    if (a.status === 'attempted') return b.frustrationScore - a.frustrationScore
    if (a.status === 'solved') return (b.timeOnPuzzle || 0) - (a.timeOnPuzzle || 0)
    return 0
  })

  const solvedCount = puzzles.filter(p => p.status === 'solved').length

  return (
    <Section title="Puzzle progress" hint={`${solvedCount} of ${puzzles.length} solved this demo.`}>
      <div className="grid grid-cols-1 gap-2">
        {ordered.map(p => {
          const expanded = openId === p.id
          return (
            <div key={p.id} className="rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
              <button
                onClick={() => setOpenId(expanded ? null : p.id)}
                className="w-full text-left p-3 active:bg-ink-700"
              >
                <div className="flex items-start gap-3">
                  <PuzzleStatusBadge status={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.code && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 text-ink-400 border border-ink-700">
                          {p.code}
                        </span>
                      )}
                      <span className="font-semibold truncate">{p.name}</span>
                    </div>
                    <PuzzleStatusLine puzzle={p} />
                  </div>
                  {(p.negativeCount > 0 || p.hintCount > 0) && (
                    <div className="flex flex-col items-end gap-0.5 text-[11px] tabular-nums">
                      {p.negativeCount > 0 && <span className="text-rose-300">{p.negativeCount} neg</span>}
                      {p.hintCount > 0 && <span className="text-amber-300">{p.hintCount} hint</span>}
                    </div>
                  )}
                </div>
              </button>
              {expanded && p.relatedNotes.length > 0 && (
                <div className="border-t border-ink-700 bg-ink-900/40 p-3 space-y-1.5">
                  {p.relatedNotes.map(n => {
                    const d = designerById(n.designerId)
                    const neg = (n.categories || []).some(c => ['Game Flow Issue','Puzzle Logic Issue','Tech Issue','Frustration'].includes(c))
                    const pos = (n.categories || []).some(c => ['Wow Moment','Puzzle Solved'].includes(c))
                    return (
                      <div key={n.id} className={`text-xs rounded-lg p-2 border ${
                        pos ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100'
                            : neg ? 'bg-rose-500/10 border-rose-500/20 text-rose-100'
                                  : 'bg-ink-900 border-ink-800 text-ink-200'
                      }`}>
                        <span className="font-mono text-[10px] mr-2 opacity-70">{fmtCountdown(n.timestamp)}</span>
                        <span className="font-bold mr-2" style={{ color: d?.color }}>{d?.initials}</span>
                        {n.text}
                      </div>
                    )
                  })}
                </div>
              )}
              {expanded && p.relatedNotes.length === 0 && (
                <div className="border-t border-ink-700 bg-ink-900/40 p-3 text-xs text-ink-500 italic">
                  No notes mentioned this puzzle.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function PuzzleStatusBadge({ status }) {
  if (status === 'solved') {
    return (
      <span className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  if (status === 'attempted') {
    return (
      <span className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-500/15 border border-amber-500/40 text-amber-300 flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </span>
    )
  }
  return (
    <span className="w-9 h-9 rounded-full flex items-center justify-center bg-ink-700 border border-ink-600 text-ink-400 flex-shrink-0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  )
}

function PuzzleStatusLine({ puzzle: p }) {
  const parts = []
  if (p.status === 'solved') {
    parts.push(`solved at ${fmtCountdown(p.solvedTs)}`)
    if (p.timeOnPuzzle != null && p.timeOnPuzzle > 0) {
      parts.push(`took ${fmtTime(p.timeOnPuzzle)}`)
    }
  } else if (p.status === 'attempted') {
    if (p.firstTouchTs != null) parts.push(`first hit ${fmtCountdown(p.firstTouchTs)}`)
    parts.push('not solved')
  } else {
    parts.push('not mentioned')
  }
  return (
    <div className="text-[11px] text-ink-400 mt-0.5 truncate">
      {parts.join(' · ')}
    </div>
  )
}

function FrustrationTimelineSection({ density }) {
  const { binSec, bins, peakIndex, peakCount } = density
  const totalNeg = bins.reduce((sum, b) => sum + b.count, 0)
  if (totalNeg === 0) {
    return (
      <Section title="Frustration timeline" hint="Where negative notes piled up across the demo.">
        <Empty text="No frustration / friction notes — clean run." />
      </Section>
    )
  }
  return (
    <Section title="Frustration timeline" hint={`${totalNeg} negative note${totalNeg === 1 ? '' : 's'} bucketed by minute.`}>
      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-3">
        <div className="flex items-end gap-0.5 h-20">
          {bins.map(b => {
            const ratio = peakCount ? b.count / peakCount : 0
            const isPeak = b.index === peakIndex && b.count > 0
            return (
              <div
                key={b.index}
                className="flex-1 flex flex-col justify-end h-full"
                title={`${fmtCountdown(b.startTs)} – ${fmtCountdown(b.endTs)}: ${b.count} note${b.count === 1 ? '' : 's'}`}
              >
                <div
                  className={`w-full rounded-t ${
                    b.count === 0
                      ? 'bg-ink-700/60'
                      : isPeak
                        ? 'bg-rose-400'
                        : 'bg-rose-500/60'
                  }`}
                  style={{ height: b.count === 0 ? '6%' : `${Math.max(12, ratio * 100)}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[10px] text-ink-500 mt-1.5 font-mono tabular-nums">
          <span>{fmtCountdown(0)}</span>
          {peakIndex >= 0 && peakCount > 0 && (
            <span className="text-rose-300">peak {peakCount}× near {fmtCountdown(bins[peakIndex].startTs)}</span>
          )}
          <span>{fmtCountdown(bins[bins.length - 1].endTs)}</span>
        </div>
      </div>
    </Section>
  )
}

function Summary({ summary, metrics, session }) {
  const fmtSecs = (s) => s != null ? fmtTime(s) : '—'

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Puzzles solved"
          value={metrics.totalPuzzles
            ? `${metrics.solved.length}/${metrics.totalPuzzles}`
            : '—'}
          sub={metrics.totalPuzzles ? `${Math.round(metrics.solveRate * 100)}%` : ''}
          accent={metrics.solveRate >= 0.8 ? 'emerald' : metrics.solveRate >= 0.5 ? 'amber' : 'rose'}
        />
        <StatCard
          label="Frustration"
          value={String(metrics.negCount)}
          sub={`${metrics.hintCount} hint${metrics.hintCount === 1 ? '' : 's'}`}
          accent={metrics.negCount === 0 ? 'emerald' : metrics.negCount > 6 ? 'rose' : 'amber'}
        />
        <StatCard
          label="Wow moments"
          value={String(metrics.posCount)}
          accent="emerald"
        />
        <StatCard
          label="Total notes"
          value={String(metrics.totalNotes)}
          sub={fmtTime(metrics.durationSec)}
          accent="ink"
        />
      </div>

      {/* Hardest puzzle / Fastest solve callouts */}
      {(metrics.hardest || metrics.fastestSolve || metrics.slowestSolve) && (
        <div className="grid grid-cols-1 gap-2">
          {metrics.hardest && (
            <Callout
              tone="rose"
              label="Hardest this demo"
              title={metrics.hardest.name}
              meta={[
                `${metrics.hardest.negativeCount} negative note${metrics.hardest.negativeCount === 1 ? '' : 's'}`,
                metrics.hardest.hintCount > 0 ? `${metrics.hardest.hintCount} hint${metrics.hardest.hintCount === 1 ? '' : 's'}` : null,
                metrics.hardest.status === 'solved'
                  ? `solved at ${fmtCountdown(metrics.hardest.solvedTs)}`
                  : 'unsolved'
              ].filter(Boolean).join(' · ')}
            />
          )}
          {metrics.fastestSolve && (
            <Callout
              tone="emerald"
              label="Fastest solve"
              title={metrics.fastestSolve.name}
              meta={`${fmtSecs(metrics.fastestSolve.timeOnPuzzle)} from first mention to solve · solved at ${fmtCountdown(metrics.fastestSolve.solvedTs)}`}
            />
          )}
          {metrics.slowestSolve && metrics.slowestSolve.id !== metrics.fastestSolve?.id && (
            <Callout
              tone="amber"
              label="Longest solve"
              title={metrics.slowestSolve.name}
              meta={`${fmtSecs(metrics.slowestSolve.timeOnPuzzle)} from first mention to solve · solved at ${fmtCountdown(metrics.slowestSolve.solvedTs)}`}
            />
          )}
        </div>
      )}

      <Section title="Top issues" emoji="🔥">
        {summary.issues.length === 0 ? <Empty text="No issues flagged." /> :
          summary.issues.map((i, idx) => (
            <SummaryRow key={idx} index={idx + 1} text={i.text}
              meta={`${fmtCountdown(i.timestamp)} · ${i.category}${i.designerCount > 1 ? ` · ${i.designerCount} designers agree` : ''}`} />
          ))
        }
      </Section>

      <Section title="Top wins" emoji="✨">
        {summary.wins.length === 0 ? <Empty text="No wins flagged." /> :
          summary.wins.map((w, idx) => (
            <SummaryRow key={idx} index={idx + 1} text={w.text}
              meta={`${fmtCountdown(w.timestamp)} · ${w.category}${w.designerCount > 1 ? ` · ${w.designerCount} designers agree` : ''}`} positive />
          ))
        }
      </Section>

      <div className="text-[11px] text-ink-500 text-center pt-2">
        Heuristic synthesis of {session.notes.length} notes from this demo.
      </div>
    </div>
  )
}

const ACCENT_CLASSES = {
  emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100',
  amber:   'bg-amber-500/15 border-amber-500/40 text-amber-100',
  rose:    'bg-rose-500/15 border-rose-500/40 text-rose-100',
  ink:     'bg-ink-800 border-ink-700 text-ink-100'
}

function StatCard({ label, value, sub, accent = 'ink' }) {
  return (
    <div className={`rounded-2xl border p-3 ${ACCENT_CLASSES[accent] || ACCENT_CLASSES.ink}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] opacity-75 mt-0.5">{sub}</div>}
    </div>
  )
}

function Callout({ tone, label, title, meta }) {
  const tones = {
    rose:    'bg-rose-500/10 border-rose-500/40 text-rose-100',
    emerald: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-100',
    amber:   'bg-amber-500/10 border-amber-500/40 text-amber-100'
  }
  const labelTones = {
    rose: 'text-rose-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300'
  }
  return (
    <div className={`rounded-2xl border p-3 ${tones[tone] || tones.amber}`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${labelTones[tone] || ''}`}>{label}</div>
      <div className="font-semibold text-base mt-0.5">{title}</div>
      <div className="text-[12px] opacity-80 mt-0.5 font-mono tabular-nums">{meta}</div>
    </div>
  )
}

function Section({ title, hint, emoji, children }) {
  return (
    <div>
      <div className="px-1 mb-2">
        <div className="text-xs uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
          {emoji && <span>{emoji}</span>}{title}
        </div>
        {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SummaryRow({ index, text, meta, positive }) {
  return (
    <div className={`rounded-2xl p-3 border ${positive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-ink-800 border-ink-700'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
          positive ? 'bg-emerald-400 text-ink-950' : 'bg-rose-400 text-ink-950'
        }`}>{index}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm leading-snug">{text}</div>
          <div className="text-[11px] text-ink-400 mt-1 font-mono tabular-nums">{meta}</div>
        </div>
      </div>
    </div>
  )
}

function Empty({ text }) {
  return <div className="text-ink-500 text-sm px-1 py-2">{text}</div>
}
