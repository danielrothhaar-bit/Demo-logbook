import React, { useMemo, useState } from 'react'
import { useStore, fmtCountdown, fmtClockTime } from '../store.jsx'

const STATUS_FLOW = ['open', 'in_progress', 'done']
const STATUS_LABEL = {
  open:        'Open',
  in_progress: 'In progress',
  done:        'Done'
}
const STATUS_CLASS = {
  open:        'bg-rose-500/15 text-rose-200 border-rose-500/40',
  in_progress: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  done:        'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
}

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'open',        label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done',        label: 'Done' }
]

// Look up the originating note + session for a source-noteId-bearing item.
// Falls back gracefully if the note has since been deleted.
function findSourceNote(state, item) {
  if (!item.sourceNoteId) return null
  for (const s of state.sessions) {
    const note = s.notes.find(n => n.id === item.sourceNoteId)
    if (note) return { note, session: s }
  }
  return null
}

export default function ActionItems() {
  const { state, dispatch, gameName, designerById } = useStore()
  const [filter, setFilter] = useState('all')

  const items = useMemo(() => {
    const list = (state.actionItems || []).slice().sort((a, b) => {
      // Open first, then in_progress, then done; within group newest first.
      const order = (s) => STATUS_FLOW.indexOf(s)
      const oa = order(a.status) === -1 ? 99 : order(a.status)
      const ob = order(b.status) === -1 ? 99 : order(b.status)
      if (oa !== ob) return oa - ob
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
    return filter === 'all' ? list : list.filter(a => a.status === filter)
  }, [state.actionItems, filter])

  const counts = useMemo(() => {
    const c = { all: 0, open: 0, in_progress: 0, done: 0 }
    for (const a of state.actionItems || []) {
      c.all++
      if (c[a.status] != null) c[a.status]++
    }
    return c
  }, [state.actionItems])

  const cycleStatus = (item) => {
    const idx = STATUS_FLOW.indexOf(item.status)
    const next = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length] || 'open'
    dispatch({ type: 'UPDATE_ACTION_ITEM', id: item.id, patch: { status: next } })
  }

  const remove = (item) => {
    if (!confirm('Delete this action item? The original note is not affected.')) return
    dispatch({ type: 'DELETE_ACTION_ITEM', id: item.id })
  }

  const openSource = (item) => {
    const src = findSourceNote(state, item)
    if (src) dispatch({ type: 'OPEN_SESSION_REVIEW', id: src.session.id })
  }

  return (
    <div className="px-4 pt-3 space-y-3">
      <button
        onClick={() => dispatch({ type: 'SET_MODE', mode: 'trends' })}
        className="flex items-center gap-2 text-xs text-accent-400 active:text-accent-500"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Trends
      </button>

      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-4 px-4">
        {FILTERS.map(f => {
          const active = filter === f.id
          const n = counts[f.id] || 0
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                active
                  ? 'bg-accent-500 border-accent-500 text-ink-50'
                  : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
              }`}
            >
              <span>{f.label}</span>
              <span className={`text-[10px] tabular-nums ${active ? 'opacity-90' : 'text-ink-400'}`}>
                {n}
              </span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-6 text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="font-semibold mb-1">
            {filter === 'all' ? 'No action items yet' : `No ${STATUS_LABEL[filter]?.toLowerCase()} items`}
          </div>
          <div className="text-sm text-ink-400 leading-relaxed">
            Escalate Tech Issues or Game Changes from the Trends screen to track them here.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const src = findSourceNote(state, item)
            const designer = src ? designerById(src.note.designerId) : null
            return (
              <div key={item.id}
                className="rounded-2xl bg-ink-800 border border-ink-700 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => cycleStatus(item)}
                    className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border whitespace-nowrap ${STATUS_CLASS[item.status] || STATUS_CLASS.open}`}
                    title="Tap to advance status"
                  >
                    {STATUS_LABEL[item.status] || 'Open'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug text-ink-50">{item.text}</div>
                    {item.relatedCategory && (
                      <div className="text-[11px] text-ink-400 mt-1">{item.relatedCategory}</div>
                    )}
                  </div>
                  <button onClick={() => remove(item)}
                    className="text-ink-500 active:text-rose-400 px-1 -mr-1 flex-shrink-0"
                    aria-label="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>

                {src && (
                  <button
                    onClick={() => openSource(item)}
                    className="w-full text-left text-[11px] bg-ink-900 border border-ink-700 rounded-lg p-2 hover:border-ink-600 active:bg-ink-800"
                  >
                    <div className="flex items-center gap-2 text-ink-400 mb-0.5 tabular-nums">
                      <span className="font-mono">{fmtCountdown(src.note.timestamp)}</span>
                      {designer && (
                        <span className="font-bold" style={{ color: designer.color }}>
                          {designer.initials}
                        </span>
                      )}
                      <span className="text-ink-500">·</span>
                      <span className="truncate">{gameName(src.session.gameId)}</span>
                      <span className="text-ink-500">·</span>
                      <span>{src.session.date}{src.session.time && ` ${fmtClockTime(src.session.time)}`}</span>
                    </div>
                    <div className="text-ink-200 leading-snug line-clamp-2">{src.note.text}</div>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
