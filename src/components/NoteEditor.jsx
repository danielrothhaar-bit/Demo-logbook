import React, { useMemo, useState } from 'react'
import { useStore, fmtCountdown, parseCountdown } from '../store.jsx'
import { analyzeNoteText } from '../utils/autoTag.js'

const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

// Mirrors the action-button tag set in Live Logging — these are the only tags
// designers can apply via the editor. Existing notes that carry legacy tags
// still expose them so the user can remove them.
const ACTION_TAGS = [
  'Puzzle Solved',
  'Game Change',
  'Tech Issue',
  'Wow Moment',
  'Frustration',
  'Hint',
  'Clue',
  'SFX'
]

export default function NoteEditor({ note, sessionId, onClose }) {
  const { state, dispatch, categoryColor, gameById } = useStore()

  const session = state.sessions.find(s => s.id === sessionId)
  const game = session ? gameById(session.gameId) : null

  const [text, setText]               = useState(note.text)
  const [designerId, setDesignerId]   = useState(note.designerId)
  const [tsStr, setTsStr]             = useState(fmtCountdown(note.timestamp))
  const [categories, setCategories]   = useState(note.categories || [])
  const [puzzleIds, setPuzzleIds]     = useState(note.puzzleIds || [])
  const [componentIds, setComponentIds] = useState(note.componentIds || [])

  const tsValid = parseCountdown(tsStr) != null
  const isFeedback = note.kind === 'feedback'

  // Tag list: the action-button tags (plus Feedback Discussion for feedback
  // notes), with any pre-existing tag on this note that isn't in that base
  // set surfaced too so the user can still see and remove legacy tags.
  const availableCats = useMemo(() => {
    const base = isFeedback ? [...ACTION_TAGS, 'Feedback Discussion'] : ACTION_TAGS
    const extras = (note.categories || []).filter(c => !base.includes(c))
    return [...base, ...extras]
  }, [isFeedback, note.categories])

  const reDetect = () => {
    const detected = analyzeNoteText(text, { categories: availableCats })
    setCategories(prev => [...new Set([...prev, ...detected.categories])])
  }

  const save = () => {
    const ts = parseCountdown(tsStr)
    if (ts == null) return
    dispatch({
      type: 'UPDATE_NOTE',
      sessionId,
      noteId: note.id,
      patch: {
        text: text.trim(),
        designerId,
        timestamp: ts,
        categories,
        puzzleIds,
        componentIds
      }
    })
    onClose()
  }

  const remove = () => {
    if (!confirm('Delete this note?')) return
    dispatch({ type: 'DELETE_NOTE', sessionId, noteId: note.id })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/85 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-ink-800 border border-ink-700 rounded-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Top action bar — sticky so it stays reachable while scrolling long forms */}
        <div className="sticky top-0 z-20 bg-ink-800 border-b border-ink-700 px-3 py-2.5 flex items-center gap-2 rounded-t-3xl">
          <button onClick={remove}
            className="px-4 py-2.5 rounded-xl bg-rose-600 active:bg-rose-700 text-white font-semibold">
            Delete
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-ink-700 active:bg-ink-600 font-medium">Cancel</button>
          <button onClick={save} disabled={!tsValid || !text.trim()}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 active:bg-emerald-600 disabled:opacity-40 text-ink-950 font-bold">Save</button>
        </div>

        <div className="p-5 space-y-3">
          <h3 className="font-semibold">Edit note</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Time remaining</div>
              <input value={tsStr} onChange={(e) => setTsStr(e.target.value)} placeholder="60:00"
                className={`w-full bg-ink-900 border rounded-lg px-3 py-2 outline-none font-mono tabular-nums ${
                  tsValid ? 'border-ink-700 focus:border-accent-500' : 'border-rose-500'
                }`} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Designer</div>
              <select value={designerId} onChange={(e) => setDesignerId(e.target.value)}
                className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500">
                {state.designers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.initials})</option>)}
              </select>
            </div>
          </div>
          {!tsValid
            ? <div className="text-[11px] text-rose-300 -mt-2">Use mm:ss countdown form. Prefix with + for overtime (e.g. +02:30).</div>
            : <div className="text-[11px] text-ink-500 -mt-2">Countdown — prefix with + for overtime (e.g. +02:30).</div>
          }

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs uppercase tracking-wider text-ink-400">Note</div>
              <button
                type="button"
                onClick={reDetect}
                className="text-[11px] text-accent-400 active:text-accent-500 px-2 py-1 -mr-1"
                title="Re-scan the text and add any tags it would auto-attach"
              >
                Re-detect tags
              </button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500 resize-none" />
          </div>

          <TagSection title="Tags">
            {availableCats.map(c => {
              const active = categories.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategories(prev => toggle(prev, c))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active ? 'border-transparent text-ink-950' : 'border-ink-700'
                  }`}
                  style={
                    active
                      ? { backgroundColor: categoryColor(c) }
                      : { color: categoryColor(c) }
                  }
                >
                  {c}
                </button>
              )
            })}
          </TagSection>

          {game?.puzzles?.length > 0 && (
            <MultiSelectDropdown
              title="Puzzles"
              placeholder="Select puzzles…"
              options={game.puzzles.map(p => ({ id: p.id, label: p.name, code: p.code, prefix: '🧩' }))}
              selected={puzzleIds}
              onToggle={(id) => setPuzzleIds(prev => toggle(prev, id))}
              activeClass="bg-violet-500/20 text-violet-100"
            />
          )}

          {game?.components?.length > 0 && (
            <MultiSelectDropdown
              title="Components"
              placeholder="Select components…"
              options={game.components.map(c => ({ id: c.id, label: c.name, code: c.code, prefix: '⚙' }))}
              selected={componentIds}
              onToggle={(id) => setComponentIds(prev => toggle(prev, id))}
              activeClass="bg-pink-500/20 text-pink-100"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TagSection({ title, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-400 mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

// Collapsible multi-select. Uses <details> so open/close state is native and
// click-outside doesn't auto-collapse — keeps interaction predictable on mobile.
function MultiSelectDropdown({ title, placeholder, options, selected, onToggle, activeClass = '' }) {
  const selectedOptions = options.filter(o => selected.includes(o.id))
  const summaryText = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} selected`

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-400 mb-1.5">{title}</div>
      <details className="group rounded-xl bg-ink-900 border border-ink-700">
        <summary className="px-3 py-2.5 cursor-pointer text-sm flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
          <span className={`truncate ${selectedOptions.length === 0 ? 'text-ink-400' : 'text-ink-100'}`}>
            {summaryText}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
               className="text-ink-400 transition-transform group-open:rotate-180 flex-shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="border-t border-ink-700 max-h-56 overflow-y-auto">
          {options.map(o => {
            const active = selected.includes(o.id)
            return (
              <label key={o.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-ink-700/50 last:border-b-0 ${
                  active ? activeClass : 'active:bg-ink-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(o.id)}
                  className="w-4 h-4 accent-accent-500 flex-shrink-0"
                />
                <span className="flex-shrink-0">{o.prefix}</span>
                {o.code && <span className="font-mono text-[11px] text-ink-400 flex-shrink-0">{o.code}</span>}
                <span className="flex-1 truncate">{o.label}</span>
              </label>
            )
          })}
        </div>
      </details>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedOptions.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 ${activeClass || 'bg-ink-700 text-ink-100'}`}
              title="Click to remove"
            >
              <span>{o.prefix}</span>
              <span>{o.label}</span>
              <span className="opacity-60">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
