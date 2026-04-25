import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import MicButton from './MicButton.jsx'
import NoteCard from './NoteCard.jsx'
import CategoryEditor from './CategoryEditor.jsx'

export default function LiveLogging() {
  const { state, dispatch, activeSession, activeDesigner } = useStore()
  const [draft, setDraft] = useState('')
  const [pickedCategories, setPickedCategories] = useState([])
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [showSessionInfo, setShowSessionInfo] = useState(false)
  const photoInputRef = useRef(null)
  const [pendingPhoto, setPendingPhoto] = useState(null)

  if (!activeSession) {
    return (
      <div className="px-4 pt-10 text-center text-ink-300">
        No active session. Start one from the home screen.
      </div>
    )
  }

  const currentSec = activeSession.timerRunning && activeSession.timerStartedAt
    ? Math.floor((Date.now() - activeSession.timerStartedAt) / 1000)
    : activeSession.timerElapsed

  const togglePick = (c) => {
    setPickedCategories(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  const commit = (text) => {
    if (!text?.trim()) return
    dispatch({
      type: 'ADD_NOTE',
      sessionId: activeSession.id,
      designerId: activeDesigner.id,
      timestamp: currentSec,
      categories: pickedCategories,
      text: text.trim(),
      photoUrl: pendingPhoto
    })
    setDraft('')
    setPickedCategories([])
    setPendingPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const submitTyped = (e) => {
    e?.preventDefault?.()
    commit(draft)
  }

  const handlePhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPendingPhoto(reader.result)
    reader.readAsDataURL(f)
  }

  // Quick-tag commit: tap a tag with no draft → log a single-tag observation at current ts
  const quickLogTag = (c) => {
    dispatch({
      type: 'ADD_NOTE',
      sessionId: activeSession.id,
      designerId: activeDesigner.id,
      timestamp: currentSec,
      categories: [c],
      text: `[${c}]`
    })
  }

  // Sort notes ascending by timestamp for live feed (newest at top in chronological reverse)
  const ordered = [...activeSession.notes].sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="px-4 pt-3 space-y-4">
      {/* Session bar */}
      <button
        onClick={() => setShowSessionInfo(s => !s)}
        className="w-full flex items-center gap-2 text-left text-xs text-ink-400 active:text-ink-200"
      >
        <span className="font-semibold text-ink-200">{activeSession.roomName}</span>
        <span>·</span>
        <span>code <span className="font-mono text-ink-200">{activeSession.sessionCode}</span></span>
        <span>·</span>
        <span>team {activeSession.teamSize} · {activeSession.experience}</span>
      </button>

      {/* Timer */}
      <div className="rounded-3xl bg-ink-800 border border-ink-700 p-5 text-center">
        <div className="font-mono tabular-nums text-6xl font-bold tracking-tight">
          {fmtTime(currentSec)}
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          {activeSession.timerRunning ? (
            <button
              onClick={() => dispatch({ type: 'TIMER_PAUSE', sessionId: activeSession.id })}
              className="px-6 py-3 rounded-full bg-amber-400 text-ink-950 font-semibold active:bg-amber-500"
            >Pause</button>
          ) : (
            <button
              onClick={() => dispatch({ type: 'TIMER_START', sessionId: activeSession.id })}
              className="px-6 py-3 rounded-full bg-emerald-500 text-ink-950 font-semibold active:bg-emerald-600"
            >{activeSession.timerElapsed > 0 ? 'Resume' : 'Start'}</button>
          )}
          <button
            onClick={() => {
              if (confirm('Reset timer to 00:00?')) {
                dispatch({ type: 'TIMER_RESET', sessionId: activeSession.id })
              }
            }}
            className="px-4 py-3 rounded-full bg-ink-700 text-ink-100 font-medium active:bg-ink-600"
          >Reset</button>
        </div>
      </div>

      {/* Category quick-tags */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="text-xs uppercase tracking-wider text-ink-400">Quick tags</div>
          <button
            onClick={() => setShowCategoryEditor(true)}
            className="text-xs text-accent-400 active:text-accent-500"
          >Edit</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.categories.map(c => {
            const picked = pickedCategories.includes(c)
            return (
              <button
                key={c}
                onClick={() => togglePick(c)}
                onDoubleClick={() => quickLogTag(c)}
                className={`px-3 py-2.5 rounded-full text-sm font-medium border transition-colors ${
                  picked ? 'bg-accent-500 border-accent-500 text-ink-950'
                         : 'bg-ink-800 border-ink-700 text-ink-100 active:bg-ink-700'
                }`}
              >{c}</button>
            )
          })}
        </div>
        <div className="text-[11px] text-ink-500 mt-1 px-1">
          Tap to attach to next note. Double-tap to log instantly.
        </div>
      </div>

      {/* Voice + draft */}
      <div className="rounded-3xl bg-ink-900 border border-ink-800 p-4">
        <MicButton onCommit={commit} draft={draft} setDraft={setDraft} />

        <form onSubmit={submitTyped} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a note…"
            className="flex-1 bg-ink-800 border border-ink-700 rounded-xl px-3 py-3 outline-none focus:border-accent-500"
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
              pendingPhoto ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-ink-800 border-ink-700 text-ink-300 active:bg-ink-700'
            }`}
            aria-label="Attach photo"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M16 5l-1.5-2h-5L8 5" />
            </svg>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-4 rounded-xl bg-accent-500 active:bg-accent-600 text-ink-950 font-semibold disabled:opacity-40"
          >Save</button>
        </form>
        {pendingPhoto && (
          <div className="mt-2 flex items-center gap-2">
            <img src={pendingPhoto} alt="" className="w-12 h-12 rounded object-cover" />
            <span className="text-xs text-ink-400 flex-1">Photo will attach to next saved note</span>
            <button onClick={() => setPendingPhoto(null)} className="text-xs text-rose-300 active:text-rose-400">Remove</button>
          </div>
        )}
      </div>

      {/* Notes feed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs uppercase tracking-wider text-ink-400">
            Feed · {activeSession.notes.length} notes
          </div>
          <button
            onClick={() => {
              if (confirm('End this session and move to review?')) {
                dispatch({ type: 'END_SESSION', sessionId: activeSession.id })
                dispatch({ type: 'OPEN_SESSION_REVIEW', id: activeSession.id })
              }
            }}
            className="text-xs text-rose-300 active:text-rose-400"
          >End session</button>
        </div>
        {ordered.length === 0 ? (
          <div className="text-ink-400 text-sm text-center py-6">
            No notes yet. Tap the mic, or use a quick tag.
          </div>
        ) : (
          ordered.map(n => (
            <NoteCard
              key={n.id}
              note={n}
              onDelete={() => {
                if (confirm('Delete this note?')) {
                  dispatch({ type: 'DELETE_NOTE', sessionId: activeSession.id, noteId: n.id })
                }
              }}
            />
          ))
        )}
      </div>

      {showCategoryEditor && (
        <CategoryEditor onClose={() => setShowCategoryEditor(false)} />
      )}
    </div>
  )
}
