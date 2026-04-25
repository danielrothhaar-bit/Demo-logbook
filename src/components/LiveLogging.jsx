import React, { useEffect, useRef, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js'
import { autoTagsFromText } from '../utils/autoTag.js'
import MicButton from './MicButton.jsx'
import NoteCard from './NoteCard.jsx'

export default function LiveLogging() {
  const { state, dispatch, activeSession, activeDesigner, gameName } = useStore()
  const [draft, setDraft] = useState('')
  const [pickedCategories, setPickedCategories] = useState([])
  const [discussionMode, setDiscussionMode] = useState(false)
  const photoInputRef = useRef(null)
  const [pendingPhoto, setPendingPhoto] = useState(null)

  // Single speech-recognition instance lifted up so Save can also stop it
  const sr = useSpeechRecognition()

  // Sync live transcript into draft (so the user sees what was heard)
  useEffect(() => {
    if (sr.isListening) {
      const live = (sr.finalTranscript + ' ' + sr.interim).trim()
      if (live) setDraft(live)
    }
  }, [sr.isListening, sr.finalTranscript, sr.interim])

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

  const commit = (text, opts = {}) => {
    if (!text?.trim()) return
    const trimmed = text.trim()
    const auto = opts.skipAutoTag ? [] : autoTagsFromText(trimmed, state.categories)
    const merged = [...new Set([...(opts.categories ?? pickedCategories), ...auto])]
    dispatch({
      type: 'ADD_NOTE',
      sessionId: activeSession.id,
      designerId: activeDesigner.id,
      timestamp: currentSec,
      categories: merged,
      text: trimmed,
      photoUrl: opts.photoUrl ?? pendingPhoto,
      kind: opts.kind || 'note'
    })
    setDraft('')
    setPickedCategories([])
    setPendingPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  // Build mic handler — Save and tap-mic share commit logic
  const stopAndCommit = () => {
    // Stop the recognizer; finalTranscript is already in draft via the effect
    if (sr.isListening) sr.stop()
    const text = (sr.finalTranscript || draft).trim()
    if (text) commit(text)
    sr.reset()
  }

  const onMicTap = () => {
    if (!sr.supported) return
    if (sr.needsTapAgain) { sr.resume(); return }
    if (sr.isListening) {
      stopAndCommit()
    } else {
      sr.start()
    }
  }

  const submitTyped = (e) => {
    e?.preventDefault?.()
    // If mic is hot, stop it first so we don't keep listening after save
    if (sr.isListening) sr.stop()
    const text = (sr.finalTranscript || draft).trim()
    if (!text) return
    commit(text)
    sr.reset()
  }

  const handlePhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPendingPhoto(reader.result)
    reader.readAsDataURL(f)
  }

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

  // Render order: discussion mode replaces the normal logging UI
  const ordered = [...activeSession.notes].sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="px-4 pt-3 space-y-4">
      {/* Session bar */}
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span className="font-semibold text-ink-200">{gameName(activeSession.gameId)}</span>
        <span>·</span>
        <span>code <span className="font-mono text-ink-200">{activeSession.sessionCode}</span></span>
        <span>·</span>
        <span>team {activeSession.teamSize} · {activeSession.experience}</span>
      </div>

      {discussionMode ? (
        <FeedbackDiscussionPanel
          sr={{ ...sr, onTap: () => sr.isListening ? sr.stop() : sr.start() }}
          draft={draft}
          setDraft={setDraft}
          currentSec={currentSec}
          onCancel={() => {
            sr.stop()
            sr.reset()
            setDraft('')
            setDiscussionMode(false)
          }}
          onEnd={() => {
            if (sr.isListening) sr.stop()
            const text = (sr.finalTranscript || draft).trim()
            if (text) {
              commit(text, {
                categories: ['Feedback Discussion'],
                kind: 'feedback',
                skipAutoTag: true
              })
            }
            sr.reset()
            setDiscussionMode(false)
          }}
        />
      ) : (
        <>
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
                onClick={() => dispatch({ type: 'SET_MODE', mode: 'admin' })}
                className="text-xs text-accent-400 active:text-accent-500"
              >Edit in Admin</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.categories.filter(c => c !== 'Feedback Discussion').map(c => {
                const picked = pickedCategories.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => togglePick(c)}
                    onDoubleClick={() => quickLogTag(c)}
                    className={`px-3 py-2.5 rounded-full text-sm font-medium border transition-colors ${
                      picked ? 'bg-accent-500 border-accent-500 text-ink-50'
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
            <MicButton sr={{ ...sr, onTap: onMicTap }} />

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
                disabled={!draft.trim() && !sr.finalTranscript}
                className="px-4 rounded-xl bg-accent-500 active:bg-accent-600 text-ink-50 font-semibold disabled:opacity-40"
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

          {/* Feedback Discussion entry */}
          <button
            onClick={() => {
              setDiscussionMode(true)
              setDraft('')
              sr.reset()
              setTimeout(() => sr.start(), 50)
            }}
            className="w-full rounded-2xl bg-cyan-500/10 border border-cyan-400/40 active:bg-cyan-500/20 py-4 px-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-cyan-100">Start Feedback Discussion</div>
                <div className="text-[12px] text-cyan-200/70">Long recording for player debrief — Q&A and ratings auto-extracted in review.</div>
              </div>
            </div>
          </button>
        </>
      )}

      {/* Notes feed */}
      {!discussionMode && (
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
      )}
    </div>
  )
}

function FeedbackDiscussionPanel({ sr, draft, setDraft, currentSec, onEnd, onCancel }) {
  return (
    <div className="rounded-3xl bg-cyan-500/10 border border-cyan-400/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-cyan-300 font-semibold">Feedback Discussion</div>
          <div className="text-[11px] text-cyan-200/70">Recording the debrief — keep talking. Q&A breakdown happens in review.</div>
        </div>
        <span className="font-mono text-sm text-cyan-200 tabular-nums">{fmtTime(currentSec)}</span>
      </div>

      <MicButton
        sr={sr}
        size="lg"
        label={{
          listening: 'Recording discussion… long-press End when done.',
          idle: 'Tap to start recording the discussion.'
        }}
      />

      <div className="rounded-2xl bg-ink-900 border border-ink-800 p-3 max-h-64 overflow-y-auto">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">Live transcript</div>
        {(draft || sr.interim) ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {draft}
            {sr.interim && <span className="text-ink-400"> {sr.interim}</span>}
          </div>
        ) : (
          <div className="text-ink-500 text-sm italic">Waiting for speech…</div>
        )}
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Or paste / edit the transcript here…"
        rows={3}
        className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2 outline-none focus:border-accent-500 resize-none text-sm"
      />

      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-3 rounded-xl bg-ink-700 active:bg-ink-600 font-medium">Cancel</button>
        <button onClick={onEnd}
          className="flex-[2] py-3 rounded-xl bg-cyan-500 active:bg-cyan-600 text-ink-950 font-bold">
          End & Save Discussion
        </button>
      </div>
    </div>
  )
}
