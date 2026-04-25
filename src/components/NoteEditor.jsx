import React, { useMemo, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import { analyzeNoteText } from '../utils/autoTag.js'

// mm:ss → seconds, returns null if invalid
function parseMMSS(str) {
  if (!str) return null
  const m = String(str).match(/^(\d{1,3}):(\d{1,2})$/)
  if (!m) return null
  const minutes = parseInt(m[1], 10)
  const seconds = parseInt(m[2], 10)
  if (seconds > 59) return null
  return minutes * 60 + seconds
}

const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export default function NoteEditor({ note, sessionId, onClose }) {
  const { state, dispatch, categoryColor, gameById } = useStore()

  const session = state.sessions.find(s => s.id === sessionId)
  const game = session ? gameById(session.gameId) : null

  const [text, setText]               = useState(note.text)
  const [designerId, setDesignerId]   = useState(note.designerId)
  const [tsStr, setTsStr]             = useState(fmtTime(note.timestamp))
  const [categories, setCategories]   = useState(note.categories || [])
  const [puzzleIds, setPuzzleIds]     = useState(note.puzzleIds || [])
  const [componentIds, setComponentIds] = useState(note.componentIds || [])

  const tsValid = parseMMSS(tsStr) != null
  const isFeedback = note.kind === 'feedback'

  // Categories available as quick tags. Hide Feedback Discussion for normal
  // notes (it's a separate mode), but keep it for feedback notes that
  // legitimately carry the tag.
  const availableCats = useMemo(() => (
    isFeedback ? state.categories : state.categories.filter(c => c !== 'Feedback Discussion')
  ), [state.categories, isFeedback])

  const reDetect = () => {
    const detected = analyzeNoteText(text, { categories: state.categories, game })
    setCategories(prev => [...new Set([...prev, ...detected.categories])])
    setPuzzleIds(prev => [...new Set([...prev, ...detected.puzzleIds])])
    setComponentIds(prev => [...new Set([...prev, ...detected.componentIds])])
  }

  const save = () => {
    const ts = parseMMSS(tsStr)
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
      <div className="w-full max-w-md bg-ink-800 border border-ink-700 rounded-3xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Edit note</h3>
          <button onClick={onClose} className="text-ink-400 active:text-ink-200 text-2xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Time (mm:ss)</div>
              <input value={tsStr} onChange={(e) => setTsStr(e.target.value)} placeholder="00:00"
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
          {!tsValid && <div className="text-[11px] text-rose-300 -mt-2">Use the format mm:ss (seconds 00–59).</div>}

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

          <TagSection title="Quick tags">
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
            <TagSection title="Puzzles">
              {game.puzzles.map(p => {
                const active = puzzleIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPuzzleIds(prev => toggle(prev, p.id))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 transition-colors ${
                      active
                        ? 'bg-violet-500/30 border-violet-400 text-violet-100'
                        : 'bg-ink-900 border-ink-700 text-ink-200 active:bg-ink-700'
                    }`}
                  >
                    <span>🧩</span>
                    {p.code && <span className="font-mono opacity-70">{p.code}</span>}
                    <span>{p.name}</span>
                  </button>
                )
              })}
            </TagSection>
          )}

          {game?.components?.length > 0 && (
            <TagSection title="Components">
              {game.components.map(c => {
                const active = componentIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setComponentIds(prev => toggle(prev, c.id))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 transition-colors ${
                      active
                        ? 'bg-pink-500/30 border-pink-400 text-pink-100'
                        : 'bg-ink-900 border-ink-700 text-ink-200 active:bg-ink-700'
                    }`}
                  >
                    <span>⚙</span>
                    {c.code && <span className="font-mono opacity-70">{c.code}</span>}
                    <span>{c.name}</span>
                  </button>
                )
              })}
            </TagSection>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button onClick={remove}
            className="px-3 py-3 rounded-xl bg-rose-500/10 border border-rose-500/40 active:bg-rose-500/20 text-rose-200 font-medium">
            Delete
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-3 rounded-xl bg-ink-700 active:bg-ink-600 font-medium">Cancel</button>
          <button onClick={save} disabled={!tsValid || !text.trim()}
            className="px-5 py-3 rounded-xl bg-emerald-500 active:bg-emerald-600 disabled:opacity-40 text-ink-950 font-bold">Save</button>
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
