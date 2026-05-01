import React, { useMemo, useState } from 'react'
import { useStore, fmtCountdown, fmtClockTime } from '../store.jsx'
import NoteEditor from './NoteEditor.jsx'

const STATUS_OPTIONS = [
  { id: 'open',        label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done',        label: 'Done' }
]
const STATUS_CLASS = {
  open:        'bg-rose-500/15 text-rose-200 border-rose-500/40',
  in_progress: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  done:        'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
}
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(o => [o.id, o.label]))

const FILTERS = [
  { id: 'all',         label: 'All' },
  ...STATUS_OPTIONS
]

// Display order for the category sections. Tech Issue + Puzzle Issue lead
// because they're the canonical escalation paths from the digests; anything
// not in this list sorts after, alphabetically.
const CATEGORY_ORDER = [
  'Tech Issue',
  'Puzzle Issue',
  'Puzzle Logic Issue',
  'Game Flow Issue',
  'Frustration',
  'Wow Moment',
  'Puzzle Solved',
  'Hint',
  'Clue',
  'SFX',
  'Quote'
]

// Map relatedCategory → which note field to sub-group on. Tech issues live on
// components; everything else groups by puzzle. Items whose source note has
// no matching id fall into a single "Untagged" sub-group.
function subGroupKey(category) {
  return category === 'Tech Issue' ? 'component' : 'puzzle'
}

function findSourceNote(state, item) {
  if (!item.sourceNoteId) return null
  for (const s of state.sessions) {
    const note = s.notes.find(n => n.id === item.sourceNoteId)
    if (note) return { note, session: s }
  }
  return null
}

export default function ActionItems({ embedded = false }) {
  const { state, dispatch, gameById, gameName, designerById } = useStore()
  const [filter, setFilter] = useState('all')
  // editing → { noteId, sessionId } for the NoteEditor modal
  const [editing, setEditing] = useState(null)

  // Resolve the live note off state when editing so concurrent updates
  // (other devices, or in-place edits via Review) don't get clobbered.
  const editTarget = useMemo(() => {
    if (!editing) return null
    const sess = state.sessions.find(s => s.id === editing.sessionId)
    const note = sess?.notes.find(n => n.id === editing.noteId)
    return note ? { note, sessionId: editing.sessionId } : null
  }, [editing, state.sessions])

  const counts = useMemo(() => {
    const c = { all: 0, open: 0, in_progress: 0, done: 0 }
    for (const a of state.actionItems || []) {
      c.all++
      if (c[a.status] != null) c[a.status]++
    }
    return c
  }, [state.actionItems])

  // Build category → Map<subKey, { label, code, items, groupBy }>. Sub-group
  // assignment uses the FIRST matching component/puzzle id on the source note —
  // an item rarely needs to live in two places, and listing in only one keeps
  // the on-screen count truthful.
  const grouped = useMemo(() => {
    const filtered = filter === 'all'
      ? (state.actionItems || [])
      : (state.actionItems || []).filter(a => a.status === filter)

    const byCategory = new Map()

    for (const item of filtered) {
      const cat = item.relatedCategory || 'Other'
      const src = findSourceNote(state, item)
      const note = src?.note
      const game = src ? gameById(src.session.gameId) : null

      const groupBy = subGroupKey(cat)
      let subKey = '__untagged__'
      let subLabel = 'Untagged'
      let subCode = ''

      if (note && game) {
        if (groupBy === 'component') {
          for (const cId of note.componentIds || []) {
            const c = (game.components || []).find(x => x.id === cId)
            if (c) { subKey = c.id; subLabel = c.name; subCode = c.code || ''; break }
          }
        } else {
          for (const pId of note.puzzleIds || []) {
            const p = (game.puzzles || []).find(x => x.id === pId)
            if (p) { subKey = p.id; subLabel = p.name; subCode = p.code || ''; break }
          }
        }
      }

      if (!byCategory.has(cat)) byCategory.set(cat, new Map())
      const subMap = byCategory.get(cat)
      if (!subMap.has(subKey)) {
        subMap.set(subKey, { label: subLabel, code: subCode, items: [], groupBy })
      }
      subMap.get(subKey).items.push({ item, src })
    }

    return byCategory
  }, [state.actionItems, state.sessions, state.games, filter, gameById])

  // Flatten the Map into [cat, [[subKey, group], ...]] tuples sorted by:
  //   1. category in CATEGORY_ORDER
  //   2. sub-group with the most items first
  //   3. items inside a sub-group: open → in_progress → done, then newest
  const sortedGroups = useMemo(() => {
    const catOrder = (c) => {
      const i = CATEGORY_ORDER.indexOf(c)
      return i === -1 ? CATEGORY_ORDER.length : i
    }
    const cats = [...grouped.keys()].sort((a, b) =>
      catOrder(a) - catOrder(b) || a.localeCompare(b)
    )
    return cats.map(cat => {
      const subs = [...grouped.get(cat).entries()]
      subs.sort((a, b) => b[1].items.length - a[1].items.length || a[1].label.localeCompare(b[1].label))
      for (const [, g] of subs) {
        g.items.sort((a, b) => {
          const sa = STATUS_OPTIONS.findIndex(s => s.id === a.item.status)
          const sb = STATUS_OPTIONS.findIndex(s => s.id === b.item.status)
          const oa = sa === -1 ? 99 : sa
          const ob = sb === -1 ? 99 : sb
          if (oa !== ob) return oa - ob
          return (b.item.createdAt || 0) - (a.item.createdAt || 0)
        })
      }
      return [cat, subs]
    })
  }, [grouped])

  const totalShown = useMemo(() => {
    let n = 0
    for (const [, subs] of sortedGroups) for (const [, g] of subs) n += g.items.length
    return n
  }, [sortedGroups])

  const updateStatus = (item, status) => {
    dispatch({ type: 'UPDATE_ACTION_ITEM', id: item.id, patch: { status } })
  }

  const remove = (item) => {
    if (!confirm('Delete this action item? The original note is not affected.')) return
    dispatch({ type: 'DELETE_ACTION_ITEM', id: item.id })
  }

  const openSource = (src) => {
    if (src) dispatch({ type: 'OPEN_SESSION_REVIEW', id: src.session.id })
  }

  const openEdit = (src) => {
    if (src) setEditing({ noteId: src.note.id, sessionId: src.session.id })
  }

  const wrapperClass = embedded ? 'space-y-3' : 'px-4 pt-3 space-y-3'

  return (
    <div className={wrapperClass}>
      {!embedded && (
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
      )}

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

      {totalShown === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-6 text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="font-semibold mb-1">
            {filter === 'all' ? 'No action items yet' : `No ${STATUS_LABEL[filter]?.toLowerCase()} items`}
          </div>
          <div className="text-sm text-ink-400 leading-relaxed">
            Escalate Tech Issues or Puzzle Issues from the Trends screen to track them here.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([cat, subs]) => {
            const total = subs.reduce((n, [, g]) => n + g.items.length, 0)
            return (
              <section key={cat}>
                <h2 className="text-[11px] uppercase tracking-wider text-ink-300 font-bold px-1 mb-2 flex items-center gap-2">
                  <span>{cat}</span>
                  <span className="text-ink-500 font-medium">· {total}</span>
                </h2>
                <div className="space-y-3">
                  {subs.map(([subKey, g]) => (
                    <div key={subKey} className="rounded-2xl bg-ink-800/50 border border-ink-700 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-700/60 bg-ink-800/80">
                        <span className="text-sm">{g.groupBy === 'component' ? '⚙' : '🧩'}</span>
                        {g.code && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 text-ink-400 border border-ink-700 tabular-nums">
                            {g.code}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-ink-100 truncate">{g.label}</span>
                        <span className="text-[10px] text-ink-500 ml-auto tabular-nums">
                          {g.items.length}
                        </span>
                      </div>
                      <div className="p-2 space-y-2">
                        {g.items.map(({ item, src }) => (
                          <ActionCard
                            key={item.id}
                            item={item}
                            src={src}
                            designer={src ? designerById(src.note.designerId) : null}
                            gameLabel={src ? gameName(src.session.gameId) : ''}
                            onStatusChange={(s) => updateStatus(item, s)}
                            onRemove={() => remove(item)}
                            onOpen={() => openSource(src)}
                            onEdit={src ? () => openEdit(src) : null}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {editTarget && (
        <NoteEditor
          note={editTarget.note}
          sessionId={editTarget.sessionId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// One action item. The source note's text is the headline (it's the actual
// thing the designer wrote on the floor); the synthesized item.text — which
// used to lead with bracketed metadata — is dropped from view.
function ActionCard({ item, src, designer, gameLabel, onStatusChange, onRemove, onOpen, onEdit }) {
  const note = src?.note
  const headline = note?.text || item.text || ''

  return (
    <div className="rounded-xl bg-ink-900 border border-ink-700 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <StatusSelect status={item.status} onChange={onStatusChange} />
        <div className="flex-1" />
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-ink-500 active:text-ink-200 px-1"
            aria-label="Edit note"
            title="Edit note"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-ink-500 active:text-rose-400 px-1 -mr-1"
          aria-label="Delete action item"
          title="Delete action item"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      <div className="text-base leading-snug text-ink-50 break-words">
        {headline}
      </div>

      {src && (
        <button
          onClick={onOpen}
          className="w-full text-left text-[11px] bg-ink-950 border border-ink-800 rounded-lg px-2.5 py-1.5 flex items-center gap-2 tabular-nums hover:border-ink-700 active:bg-ink-900"
        >
          <span className="font-mono text-ink-300">{fmtCountdown(src.note.timestamp)}</span>
          {designer && (
            <span className="font-bold" style={{ color: designer.color }}>
              {designer.initials}
            </span>
          )}
          <span className="text-ink-500">·</span>
          <span className="text-ink-400 truncate">
            {gameLabel} · {src.session.date}{src.session.time && ` ${fmtClockTime(src.session.time)}`}
          </span>
          <svg className="w-3 h-3 text-ink-500 ml-auto flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Native-select status pill. Native picker gives the best mobile UX (real
// system bottom sheet); we hide the OS chevron and draw our own to match the
// existing pill aesthetic. Status colour is driven entirely by the value so
// the visual cue stays consistent with the read-only badge in NoteCard.
function StatusSelect({ status, onChange }) {
  const cls = STATUS_CLASS[status] || STATUS_CLASS.open
  return (
    <div className="relative">
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none cursor-pointer text-[11px] uppercase tracking-wider font-bold pl-2.5 pr-7 py-1 rounded-full border outline-none focus:ring-2 focus:ring-accent-500/50 ${cls}`}
        aria-label="Status"
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.id} value={o.id} className="bg-ink-900 text-ink-100 normal-case tracking-normal">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-80"
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}
