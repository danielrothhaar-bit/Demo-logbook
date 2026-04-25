import React, { useMemo, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import NoteCard from './NoteCard.jsx'
import NoteEditor from './NoteEditor.jsx'
import {
  findConsensus, findDivergence, findDuplicates, summarize
} from '../utils/synthesis.js'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'synthesis', label: 'Synthesis' },
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
      fmtTime(n.timestamp),
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
                      {s.time && <span>{s.time}</span>}
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
  const { dispatch } = useStore()
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
        className="w-full rounded-2xl bg-rose-500/15 border border-rose-400/40 active:bg-rose-500/25 py-3.5 px-4 flex items-center gap-3 text-rose-100"
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
        <Synthesis consensus={consensus} divergence={divergence} duplicates={duplicates} />
      )}

      {tab === 'summary' && (
        <Summary summary={summary} session={reviewSession} />
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
    ? new Date(session.timerFirstStartedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
            className="flex-[2] py-2.5 rounded-xl bg-accent-500 active:bg-accent-600 text-ink-50 font-bold">Save</button>
        </div>

        <button onClick={removeSession}
          className="w-full py-3 rounded-xl bg-rose-500/10 border border-rose-500/40 active:bg-rose-500/20 text-rose-200 font-semibold">
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
              <span>{session.time}</span>
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
          <div className="text-xs text-ink-400 mb-1">Time range: {fmtTime(range[0])} – {fmtTime(range[1])}</div>
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
          {fmtTime(group.startTs)}
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
                <span className="font-mono text-ink-400 mr-2">{fmtTime(n.timestamp)}</span>
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

function Synthesis({ consensus, divergence, duplicates }) {
  const { designerById, categoryColor } = useStore()
  const POSITIVE_SET = new Set(['Wow Moment', 'Puzzle Solved'])
  return (
    <div className="space-y-4">
      <Section title="Consensus observations" hint="Multiple designers logged the same kind of moment within ~90s.">
        {consensus.length === 0 && <Empty text="No consensus moments detected." />}
        {consensus.map((c, i) => (
          <div key={i} className="rounded-2xl bg-ink-800 border border-emerald-500/40 p-3 animate-fadeUp">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-ink-300">{fmtTime(c.startTs)}–{fmtTime(c.endTs)}</span>
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
              <span className="font-mono text-ink-300">{fmtTime(d.startTs)}–{fmtTime(d.endTs)}</span>
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

function Summary({ summary, session }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-accent-500/15 to-emerald-500/10 border border-accent-500/30 p-4">
        <div className="text-xs uppercase tracking-wider text-accent-400 mb-1">Auto-summary</div>
        <div className="text-sm text-ink-200">
          Heuristic synthesis of {session.notes.length} notes from this demo.
        </div>
      </div>

      <Section title="Top issues" emoji="🔥">
        {summary.issues.length === 0 ? <Empty text="No issues flagged." /> :
          summary.issues.map((i, idx) => (
            <SummaryRow key={idx} index={idx + 1} text={i.text}
              meta={`${fmtTime(i.timestamp)} · ${i.category}${i.designerCount > 1 ? ` · ${i.designerCount} designers agree` : ''}`} />
          ))
        }
      </Section>

      <Section title="Top wins" emoji="✨">
        {summary.wins.length === 0 ? <Empty text="No wins flagged." /> :
          summary.wins.map((w, idx) => (
            <SummaryRow key={idx} index={idx + 1} text={w.text}
              meta={`${fmtTime(w.timestamp)} · ${w.category}${w.designerCount > 1 ? ` · ${w.designerCount} designers agree` : ''}`} positive />
          ))
        }
      </Section>
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
