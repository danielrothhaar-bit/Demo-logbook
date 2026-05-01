import React, { useMemo, useState } from 'react'
import { useStore, fmtCountdown, parseCountdown } from '../store.jsx'
import { analyzeNoteText } from '../utils/autoTag.js'

const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

// Mirrors the action-button tag set in Live Logging — these are the only tags
// designers can apply via the editor. Existing notes that carry legacy tags
// still expose them so the user can remove them.
const ACTION_TAGS = [
  'Puzzle Solved',
  'Puzzle Issue',
  'Tech Issue',
  'Wow Moment',
  'Frustration',
  'Hint',
  'Clue',
  'SFX',
  'SUE',
  'Quote'
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
              <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">User</div>
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

          {/* SUE toggle — same state as the chip above, promoted to a dedicated
              control because the tag has special semantics (excludes the puzzle
              solve from cross-session averages). */}
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-700 cursor-pointer active:bg-ink-700">
            <input
              type="checkbox"
              checked={categories.includes('SUE')}
              onChange={(e) => setCategories(prev =>
                e.target.checked
                  ? (prev.includes('SUE') ? prev : [...prev, 'SUE'])
                  : prev.filter(c => c !== 'SUE')
              )}
              className="w-5 h-5 accent-orange-500 flex-shrink-0"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-orange-300">Mark as SUE</div>
              <div className="text-[11px] text-ink-500">Excluded from trends averages; still shown on the timeline.</div>
            </div>
          </label>

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

          {game?.components?.length > 0 && (() => {
            // When Tech Issue is tagged, narrow the picker to components flagged
            // as tech-bearing in Admin — same filter the Live Tech Issue modal
            // applies. Pre-existing selections that aren't tech are still shown
            // so the user can see + remove them rather than getting silently
            // dropped from the visible list.
            const techMode = categories.includes('Tech Issue')
            const visibleComponents = techMode
              ? game.components.filter(c => c.hasTech || componentIds.includes(c.id))
              : game.components
            return (
              <MultiSelectDropdown
                title="Components"
                placeholder={techMode ? 'Select tech component…' : 'Select components…'}
                options={visibleComponents.map(c => ({ id: c.id, label: c.name, code: c.code, prefix: '⚙' }))}
                selected={componentIds}
                onToggle={(id) => setComponentIds(prev => toggle(prev, id))}
                activeClass="bg-pink-500/20 text-pink-100"
                hint={techMode
                  ? `Filtered to tech components (Tech Issue tagged) · ${visibleComponents.length} of ${game.components.length}`
                  : null}
              />
            )
          })()}
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
//
// A search input renders above the list when there are 5+ options to filter
// through. Matches against label + code, case-insensitive. The input is sticky
// so it stays in view as the list scrolls.
function MultiSelectDropdown({ title, placeholder, options, selected, onToggle, activeClass = '', hint = null }) {
  const [query, setQuery] = useState('')
  const showSearch = options.length >= 5

  const selectedOptions = options.filter(o => selected.includes(o.id))
  const summaryText = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} selected`

  const q = query.trim().toLowerCase()
  const filtered = !q
    ? options
    : options.filter(o =>
        o.label.toLowerCase().includes(q) ||
        (o.code || '').toLowerCase().includes(q)
      )

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
        <div className="border-t border-ink-700 max-h-72 overflow-y-auto">
          {showSearch && (
            <div className="sticky top-0 z-10 bg-ink-900 border-b border-ink-700 p-2">
              <div className="relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                     className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-ink-950 border border-ink-700 rounded-lg pl-8 pr-7 py-1.5 text-sm text-ink-100 placeholder-ink-500 outline-none focus:border-accent-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-500 active:text-ink-200 px-1"
                    aria-label="Clear search"
                  >×</button>
                )}
              </div>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-ink-500">
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map(o => {
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
            })
          )}
        </div>
      </details>
      {hint && (
        <div className="text-[10px] text-ink-500 mt-1 px-1">{hint}</div>
      )}
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
