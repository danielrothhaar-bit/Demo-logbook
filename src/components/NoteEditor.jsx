import React, { useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'

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

export default function NoteEditor({ note, sessionId, onClose }) {
  const { state, dispatch } = useStore()
  const [text, setText] = useState(note.text)
  const [designerId, setDesignerId] = useState(note.designerId)
  const [tsStr, setTsStr] = useState(fmtTime(note.timestamp))
  const tsValid = parseMMSS(tsStr) != null

  const save = () => {
    const ts = parseMMSS(tsStr)
    if (ts == null) return
    dispatch({
      type: 'UPDATE_NOTE',
      sessionId,
      noteId: note.id,
      patch: { text: text.trim(), designerId, timestamp: ts }
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
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Timestamp (mm:ss)</div>
            <input value={tsStr} onChange={(e) => setTsStr(e.target.value)} placeholder="00:00"
              className={`w-full bg-ink-900 border rounded-lg px-3 py-2.5 outline-none font-mono tabular-nums ${
                tsValid ? 'border-ink-700 focus:border-accent-500' : 'border-rose-500'
              }`} />
            {!tsValid && <div className="text-[11px] text-rose-300 mt-1">Use the format mm:ss (seconds 00–59).</div>}
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Designer</div>
            <select value={designerId} onChange={(e) => setDesignerId(e.target.value)}
              className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2.5 outline-none focus:border-accent-500">
              {state.designers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.initials})</option>)}
            </select>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1">Note</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
              className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500 resize-none" />
          </div>
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
            className="px-5 py-3 rounded-xl bg-accent-500 active:bg-accent-600 disabled:opacity-40 text-ink-50 font-bold">Save</button>
        </div>
      </div>
    </div>
  )
}
