import React, { useEffect, useRef, useState } from 'react'
import { useStore, fmtTime, DEMO_TARGET_SEC } from '../store.jsx'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js'
import { autoTagsFromText, matchNamedItems } from '../utils/autoTag.js'
import MicButton from './MicButton.jsx'
import NoteCard from './NoteCard.jsx'
import NoteEditor from './NoteEditor.jsx'
import ClickablePhoto from './ClickablePhoto.jsx'

export default function LiveLogging() {
  const { state, dispatch, activeSession, activeDesigner, gameName, gameById } = useStore()
  const [draft, setDraft] = useState('')
  const [pickedCategories, setPickedCategories] = useState([])
  const [discussionMode, setDiscussionMode] = useState(false)
  const photoInputRef = useRef(null)
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [editNote, setEditNote] = useState(null)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioStreamRef = useRef(null)

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
    return <LiveListing />
  }

  if (!activeDesigner) {
    return <DesignerPicker designers={state.designers} onPick={(id) => dispatch({ type: 'SET_ACTIVE_DESIGNER', id })} />
  }

  const currentSec = activeSession.timerRunning && activeSession.timerStartedAt
    ? Math.floor((Date.now() - activeSession.timerStartedAt) / 1000)
    : activeSession.timerElapsed

  const isOvertime = currentSec >= DEMO_TARGET_SEC
  const displaySec = isOvertime ? currentSec - DEMO_TARGET_SEC : DEMO_TARGET_SEC - currentSec

  const adjustTimer = (deltaSec) => {
    // deltaSec > 0: give the demo more time. < 0: take time away.
    if (!deltaSec) return
    dispatch({ type: 'TIMER_ADJUST', sessionId: activeSession.id, delta: deltaSec })
  }

  const togglePick = (c) => {
    setPickedCategories(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  const commit = (text, opts = {}) => {
    const trimmed = (text || '').trim()
    if (!trimmed && !opts.audioUrl) return
    const game = gameById(activeSession.gameId)
    const auto = !trimmed || opts.skipAutoTag ? [] : autoTagsFromText(trimmed, state.categories)
    const merged = [...new Set([...(opts.categories ?? pickedCategories), ...auto])]
    const puzzleIds    = !trimmed || opts.skipAutoTag ? [] : matchNamedItems(trimmed, game?.puzzles)
    const componentIds = !trimmed || opts.skipAutoTag ? [] : matchNamedItems(trimmed, game?.components)
    dispatch({
      type: 'ADD_NOTE',
      sessionId: activeSession.id,
      designerId: activeDesigner.id,
      timestamp: currentSec,
      categories: merged,
      puzzleIds,
      componentIds,
      text: trimmed,
      photoUrl: opts.photoUrl ?? pendingPhoto,
      audioUrl: opts.audioUrl ?? null,
      kind: opts.kind || 'note'
    })
    setDraft('')
    setPickedCategories([])
    setPendingPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  // ---- Audio recording (feedback discussion only) ----
  const startAudioRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return
    if (typeof MediaRecorder === 'undefined') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported?.(t)) || ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start(1000)
      mediaRecorderRef.current = recorder
      setRecordingAudio(true)
    } catch (err) {
      console.warn('Audio recording unavailable:', err)
      // Continue without audio — the discussion still works via speech recognition.
    }
  }

  const stopAudioRecording = ({ keep }) => new Promise((resolve) => {
    const recorder = mediaRecorderRef.current
    const stream = audioStreamRef.current
    const cleanup = () => {
      stream?.getTracks?.().forEach(t => t.stop())
      mediaRecorderRef.current = null
      audioStreamRef.current = null
      audioChunksRef.current = []
      setRecordingAudio(false)
    }
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      resolve(null)
      return
    }
    recorder.onstop = () => {
      if (!keep) { cleanup(); resolve(null); return }
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      cleanup()
      if (!blob.size) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    }
    try { recorder.stop() } catch { cleanup(); resolve(null) }
  })

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
      {/* Back to live demos list */}
      <button
        onClick={() => dispatch({ type: 'OPEN_SESSION_LIVE', id: null })}
        className="flex items-center gap-2 text-xs text-accent-400 active:text-accent-500"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Live demos
      </button>

      {/* Demo bar */}
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span className="font-semibold text-ink-200">{gameName(activeSession.gameId)}</span>
        {activeSession.time && <>
          <span>·</span>
          <span>{activeSession.time}</span>
        </>}
        <span>·</span>
        <span>team {activeSession.teamSize} · {activeSession.experience}</span>
      </div>

      {discussionMode ? (
        <FeedbackDiscussionPanel
          sr={{ ...sr, onTap: () => sr.isListening ? sr.stop() : sr.start() }}
          draft={draft}
          setDraft={setDraft}
          displaySec={displaySec}
          isOvertime={isOvertime}
          recordingAudio={recordingAudio}
          onCancel={async () => {
            sr.stop()
            sr.reset()
            await stopAudioRecording({ keep: false })
            setDraft('')
            setDiscussionMode(false)
          }}
          onEnd={async () => {
            if (sr.isListening) sr.stop()
            const text = (sr.finalTranscript || draft).trim()
            const audioUrl = await stopAudioRecording({ keep: true })
            if (text || audioUrl) {
              commit(text, {
                categories: ['Feedback Discussion'],
                kind: 'feedback',
                skipAutoTag: true,
                audioUrl
              })
            }
            sr.reset()
            setDiscussionMode(false)
          }}
        />
      ) : (
        <>
          {/* Timer */}
          <div className={`rounded-3xl bg-ink-800 border p-5 text-center ${
            isOvertime ? 'border-rose-500/50' : 'border-ink-700'
          }`}>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => adjustTimer(-60)}
                aria-label="Remove one minute from the demo"
                className="w-12 h-12 rounded-full bg-ink-700 text-ink-100 active:bg-ink-600 flex flex-col items-center justify-center leading-none"
              >
                <span className="text-2xl font-bold">−</span>
                <span className="text-[9px] font-medium tracking-wider opacity-75">1 MIN</span>
              </button>
              <div className={`flex-1 font-mono tabular-nums text-6xl font-bold tracking-tight ${
                isOvertime ? 'text-rose-400' : ''
              }`}>
                {isOvertime && '+'}{fmtTime(displaySec)}
              </div>
              <button
                onClick={() => adjustTimer(60)}
                aria-label="Add one minute to the demo"
                className="w-12 h-12 rounded-full bg-ink-700 text-ink-100 active:bg-ink-600 flex flex-col items-center justify-center leading-none"
              >
                <span className="text-2xl font-bold">+</span>
                <span className="text-[9px] font-medium tracking-wider opacity-75">1 MIN</span>
              </button>
            </div>
            <div className={`mt-1 text-[11px] uppercase tracking-wider font-semibold ${
              isOvertime ? 'text-rose-400' : 'text-ink-500'
            }`}>
              {isOvertime ? 'Overtime' : 'Time remaining'}
              {(activeSession.timerAdjustment || 0) !== 0 && (
                <span className="ml-2 text-ink-400 normal-case tracking-normal font-mono">
                  · adj {activeSession.timerAdjustment > 0 ? '+' : '−'}{fmtTime(Math.abs(activeSession.timerAdjustment))}
                </span>
              )}
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
                  if (confirm('Reset timer to 60:00?')) {
                    dispatch({ type: 'TIMER_RESET', sessionId: activeSession.id })
                  }
                }}
                className="px-4 py-3 rounded-full bg-ink-700 text-ink-100 font-medium active:bg-ink-600"
              >Reset</button>
            </div>
          </div>

          {/* Category quick-tags */}
          <div>
            <div className="flex items-center mb-1.5 px-1">
              <div className="text-xs uppercase tracking-wider text-ink-400">Quick tags</div>
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
                className="px-4 rounded-xl bg-emerald-500 active:bg-emerald-600 text-ink-950 font-semibold disabled:opacity-40"
              >Save</button>
            </form>
            {pendingPhoto && (
              <div className="mt-2 flex items-center gap-2">
                <ClickablePhoto src={pendingPhoto} className="w-12 h-12 rounded object-cover" />
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
              startAudioRecording()
              setTimeout(() => sr.start(), 50)
            }}
            className="w-full rounded-2xl bg-blue-500/15 border border-blue-400/50 active:bg-blue-500/25 py-4 px-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-400/20 border border-blue-400/40 flex items-center justify-center text-blue-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-blue-100">Start Feedback Discussion</div>
                <div className="text-[12px] text-blue-200/70">Long recording for player debrief — Q&A and ratings auto-extracted in review.</div>
              </div>
            </div>
          </button>

          {/* Finish Demo — finalizes and moves to review */}
          <button
            onClick={() => {
              if (confirm('Finish this demo and move to review?')) {
                dispatch({ type: 'END_SESSION', sessionId: activeSession.id })
                dispatch({ type: 'OPEN_SESSION_REVIEW', id: activeSession.id })
              }
            }}
            className="w-full rounded-2xl bg-emerald-500/15 border border-emerald-400/50 active:bg-emerald-500/25 py-4 px-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-400/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-emerald-100">Finish Demo</div>
                <div className="text-[12px] text-emerald-200/70">Stop the timer and move to review.</div>
              </div>
            </div>
          </button>
        </>
      )}

      {/* Notes feed */}
      {!discussionMode && (
        <div className="space-y-2">
          <div className="flex items-center px-1">
            <div className="text-xs uppercase tracking-wider text-ink-400">
              Feed · {activeSession.notes.length} notes
            </div>
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
                onEdit={() => setEditNote(n)}
              />
            ))
          )}
        </div>
      )}

      {editNote && (
        <NoteEditor
          note={editNote}
          sessionId={activeSession.id}
          onClose={() => setEditNote(null)}
        />
      )}
    </div>
  )
}

function FeedbackDiscussionPanel({ sr, draft, setDraft, displaySec, isOvertime, recordingAudio, onEnd, onCancel }) {
  return (
    <div className="rounded-3xl bg-blue-500/10 border border-blue-400/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-blue-300 font-semibold flex items-center gap-2">
            Feedback Discussion
            {recordingAudio && (
              <span className="inline-flex items-center gap-1 text-[10px] text-rose-300 normal-case tracking-normal font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                rec
              </span>
            )}
          </div>
          <div className="text-[11px] text-blue-200/70">Recording the debrief — audio is saved with the note.</div>
        </div>
        <span className={`font-mono text-sm tabular-nums ${isOvertime ? 'text-rose-300' : 'text-blue-200'}`}>
          {isOvertime && '+'}{fmtTime(displaySec)}
        </span>
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
          className="flex-[2] py-3 rounded-xl bg-emerald-500 active:bg-emerald-600 text-ink-950 font-bold">
          End & Save Discussion
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Listing — shown when no demo is active. Lists open demos + a Start button.
// ============================================================================
function LiveListing() {
  const { state, dispatch, gameName } = useStore()
  const open = state.sessions.filter(s => !s.ended).sort((a, b) => {
    // Sort: timer running first, then most recent date/time
    if (a.timerRunning && !b.timerRunning) return -1
    if (b.timerRunning && !a.timerRunning) return 1
    const da = new Date(a.date + 'T' + (a.time || '00:00')).getTime()
    const db = new Date(b.date + 'T' + (b.time || '00:00')).getTime()
    return db - da
  })

  const startNew = (
    <button
      onClick={() => dispatch({ type: 'SET_MODE', mode: 'setup' })}
      className="w-full rounded-2xl bg-emerald-500 active:bg-emerald-600 text-ink-950 py-5 font-bold text-lg shadow-lg shadow-emerald-500/20"
    >
      + Start New Demo
    </button>
  )

  if (open.length === 0) {
    return (
      <div className="px-4 pt-4 space-y-4">
        {startNew}
        <div className="text-center text-ink-500 text-sm pt-6">No demos in progress.</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-ink-400 px-1">Open demos</h2>
        {open.map(s => {
          const elapsed = s.timerRunning && s.timerStartedAt
            ? Math.floor((Date.now() - s.timerStartedAt) / 1000)
            : s.timerElapsed
          return (
            <button
              key={s.id}
              onClick={() => dispatch({ type: 'OPEN_SESSION_LIVE', id: s.id })}
              className="w-full text-left rounded-2xl bg-ink-800 border border-accent-500/40 p-4 active:bg-ink-700"
            >
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${s.timerRunning ? 'bg-accent-500 animate-pulse' : 'bg-ink-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{gameName(s.gameId)}</div>
                  <div className="text-sm text-ink-300 mt-0.5">
                    {s.time && <span>{s.time}</span>}
                    {s.time && <span className="text-ink-500 mx-1.5">·</span>}
                    <span>{s.date}</span>
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">{s.notes.length} notes</div>
                </div>
                <div className="font-mono text-xl tabular-nums">{fmtTime(elapsed)}</div>
              </div>
            </button>
          )
        })}
      </div>
      {startNew}
    </div>
  )
}

// ============================================================================
// DesignerPicker — full-screen prompt shown when no designer is selected.
// ============================================================================
function DesignerPicker({ designers, onPick }) {
  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="rounded-2xl bg-ink-800 border border-accent-400/40 p-5">
        <div className="text-accent-300 text-xs uppercase tracking-wider font-semibold mb-1">Who's logging?</div>
        <div className="text-sm text-ink-200">Pick your name so notes are attributed correctly. We'll remember this on this device.</div>
      </div>
      {designers.length === 0 ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center text-ink-400">
          No designers yet — add one in Admin → Designers.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {designers.map(d => (
            <button
              key={d.id}
              onClick={() => onPick(d.id)}
              className="flex items-center gap-3 p-4 rounded-2xl bg-ink-800 border border-ink-700 active:bg-ink-700 text-left"
            >
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-ink-950"
                style={{ backgroundColor: d.color }}
              >
                {d.initials}
              </span>
              <span className="font-semibold truncate">{d.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
