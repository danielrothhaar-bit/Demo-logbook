import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, fmtTime, fmtClockTime, DEMO_TARGET_SEC } from '../store.jsx'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js'
import MicButton from './MicButton.jsx'
import NoteCard from './NoteCard.jsx'
import NoteEditor from './NoteEditor.jsx'
import ClickablePhoto from './ClickablePhoto.jsx'

// Action button grid — each button opens a modal with the relevant fields
// (text / puzzle / component / photo) and saves a note with the matching
// category tag. Replaces the old "type a note + quick tags" layout.
const ACTIONS = [
  { id: 'puzzle_solved', label: 'Puzzle Solved', accent: 'emerald', tag: 'Puzzle Solved', hasText: false, hasPuzzle: true, requirePuzzle: true, filterSolved: true, hasComponent: false, noPhoto: true, hasSueToggle: true },
  { id: 'game_change',   label: 'Game Change',   accent: 'blue',    tag: 'Game Change',   hasText: true,  hasPuzzle: true, hasComponent: false },
  { id: 'tech_issue',    label: 'Tech Issue',    accent: 'yellow',  tag: 'Tech Issue',    hasText: true,  hasPuzzle: false, hasComponent: true, filterTechComponents: true },
  { id: 'note',          label: 'Note',          accent: 'grey',    tag: null,            hasText: true,  hasPuzzle: false, hasComponent: false, requireText: true },
  { id: 'wow',           label: 'Wow',           accent: 'cyan',    tag: 'Wow Moment',    hasText: true,  hasPuzzle: true, hasComponent: false },
  { id: 'frustration',   label: 'Frustration',   accent: 'rose',    tag: 'Frustration',   hasText: true,  hasPuzzle: true, hasComponent: false },
  { id: 'hint',          label: 'Hint',          accent: 'violet',  tag: 'Hint',          hasText: true,  hasPuzzle: true, hasComponent: false },
  { id: 'clue',          label: 'Clue',          accent: 'orange',  tag: 'Clue',          hasText: true,  hasPuzzle: true, hasComponent: false }
]

const ACCENT = {
  emerald: { btn: 'bg-emerald-500 active:bg-emerald-600 text-ink-950', dot: 'bg-emerald-400' },
  blue:    { btn: 'bg-blue-500 active:bg-blue-600 text-white',          dot: 'bg-blue-400' },
  orange:  { btn: 'bg-orange-500 active:bg-orange-600 text-white',      dot: 'bg-orange-400' },
  yellow:  { btn: 'bg-yellow-400 active:bg-yellow-500 text-ink-950',    dot: 'bg-yellow-300' },
  cyan:    { btn: 'bg-cyan-400 active:bg-cyan-500 text-ink-950',        dot: 'bg-cyan-300' },
  grey:    { btn: 'bg-ink-300 active:bg-ink-400 text-ink-950',          dot: 'bg-ink-300' },
  rose:    { btn: 'bg-rose-600 active:bg-rose-700 text-white',          dot: 'bg-rose-400' },
  violet:  { btn: 'bg-violet-400 active:bg-violet-500 text-ink-950',    dot: 'bg-violet-400' }
}

export default function LiveLogging() {
  const { state, dispatch, activeSession, activeDesigner, gameName, gameById } = useStore()
  const [discussionMode, setDiscussionMode] = useState(false)
  const [editNote, setEditNote] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [draft, setDraft] = useState('')
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioStreamRef = useRef(null)
  const teamPhotoInputRef = useRef(null)
  const sr = useSpeechRecognition()

  // Live transcript → draft (only meaningful in feedback discussion view).
  useEffect(() => {
    if (sr.isListening && discussionMode) {
      const live = (sr.finalTranscript + ' ' + sr.interim).trim()
      if (live) setDraft(live)
    }
  }, [sr.isListening, sr.finalTranscript, sr.interim, discussionMode])

  if (!activeSession) return <LiveListing />
  if (!activeDesigner) {
    return <DesignerPicker designers={state.designers} onPick={(id) => dispatch({ type: 'SET_ACTIVE_DESIGNER', id })} />
  }

  const game = gameById(activeSession.gameId)

  const currentSec = activeSession.timerRunning && activeSession.timerStartedAt
    ? Math.floor((Date.now() - activeSession.timerStartedAt) / 1000)
    : activeSession.timerElapsed

  const isOvertime = currentSec >= DEMO_TARGET_SEC
  const displaySec = isOvertime ? currentSec - DEMO_TARGET_SEC : DEMO_TARGET_SEC - currentSec

  const adjustTimer = (deltaSec) => {
    if (!deltaSec) return
    dispatch({ type: 'TIMER_ADJUST', sessionId: activeSession.id, delta: deltaSec })
  }

  // Already-solved puzzle ids — used to filter the Puzzle Solved picker so a
  // puzzle can only be marked solved once per session.
  const solvedPuzzleIds = useMemo(() => {
    const ids = new Set()
    for (const n of activeSession.notes) {
      if ((n.categories || []).includes('Puzzle Solved')) {
        for (const pid of (n.puzzleIds || [])) ids.add(pid)
      }
    }
    return ids
  }, [activeSession.notes])

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

  // Save the note from a generic action modal.
  const handleActionConfirm = (action, payload) => {
    let text = (payload.text || '').trim()
    if (!text) {
      if (action.id === 'puzzle_solved') {
        const p = (game?.puzzles || []).find(x => x.id === payload.puzzleIds[0])
        text = p ? `${p.name} Puzzle solved` : '[Puzzle Solved]'
      } else if (action.tag) {
        text = `[${action.tag}]`
      } else {
        text = payload.photoUrl ? '(photo)' : '(note)'
      }
    }
    const categories = action.tag ? [action.tag] : []
    // Modal can pass through extra category tags (e.g. SUE on Puzzle Solved).
    if (Array.isArray(payload.extraCategories)) {
      for (const c of payload.extraCategories) {
        if (c && !categories.includes(c)) categories.push(c)
      }
    }
    // Auto-add the SFX tag whenever the note's text mentions "SFX" (word
    // boundary, case-insensitive). Designers don't have a button for it.
    if (/\bsfx\b/i.test(text) && !categories.includes('SFX')) {
      categories.push('SFX')
    }
    dispatch({
      type: 'ADD_NOTE',
      sessionId: activeSession.id,
      designerId: activeDesigner.id,
      timestamp: currentSec,
      categories,
      puzzleIds: payload.puzzleIds || [],
      componentIds: payload.componentIds || [],
      text,
      photoUrl: payload.photoUrl || null,
      kind: 'note'
    })
    setPendingAction(null)
  }

  const totalPuzzles = (game?.puzzles || []).length
  const puzzleSolvedDisabled = totalPuzzles === 0 || solvedPuzzleIds.size >= totalPuzzles

  // Snap a team photo and save it as a tagged note. The "Team Photo" tag is
  // what the Trends → Team Photos gallery filters on, so this just feeds that
  // collection directly without needing the rest of the action modal.
  const handleTeamPhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      dispatch({
        type: 'ADD_NOTE',
        sessionId: activeSession.id,
        designerId: activeDesigner.id,
        timestamp: currentSec,
        categories: ['Team Photo'],
        puzzleIds: [],
        componentIds: [],
        text: '[Team Photo]',
        photoUrl: reader.result,
        kind: 'note'
      })
    }
    reader.readAsDataURL(f)
    if (teamPhotoInputRef.current) teamPhotoInputRef.current.value = ''
  }

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
          <span>{fmtClockTime(activeSession.time)}</span>
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
              const cats = ['Feedback Discussion']
              if (/\bsfx\b/i.test(text)) cats.push('SFX')
              dispatch({
                type: 'ADD_NOTE',
                sessionId: activeSession.id,
                designerId: activeDesigner.id,
                timestamp: currentSec,
                categories: cats,
                puzzleIds: [],
                componentIds: [],
                text,
                audioUrl,
                kind: 'feedback'
              })
            }
            sr.reset()
            setDraft('')
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
            {/* Fine-tune by 1 second — useful when the demo started a beat
                late and the countdown needs nudging without a full minute. */}
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                onClick={() => adjustTimer(-1)}
                aria-label="Remove one second"
                className="px-3 py-1 rounded-full bg-ink-700 text-ink-200 active:bg-ink-600 text-[11px] font-mono font-semibold tabular-nums"
              >
                −1s
              </button>
              <button
                onClick={() => adjustTimer(1)}
                aria-label="Add one second"
                className="px-3 py-1 rounded-full bg-ink-700 text-ink-200 active:bg-ink-600 text-[11px] font-mono font-semibold tabular-nums"
              >
                +1s
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

          {/* Feedback Discussion entry — only available when timer is paused/stopped */}
          {!activeSession.timerRunning && (
            <>
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
                    <div className="text-[12px] text-blue-200/70">Long recording for player debrief — Q&amp;A and ratings auto-extracted in review.</div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => teamPhotoInputRef.current?.click()}
                className="w-full rounded-2xl bg-ink-300 active:bg-ink-400 text-ink-950 py-4 px-4 font-bold text-base shadow-lg flex items-center justify-center gap-2"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M16 5l-1.5-2h-5L8 5" />
                </svg>
                Team Photo
              </button>
              <input
                ref={teamPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleTeamPhoto}
              />
            </>
          )}

          {/* Action button grid — 4 rows × 2 columns */}
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map(action => {
              const disabled = action.id === 'puzzle_solved' && puzzleSolvedDisabled
              return (
                <button
                  key={action.id}
                  onClick={() => setPendingAction(action)}
                  disabled={disabled}
                  className={`rounded-2xl py-5 px-3 font-bold text-base shadow-lg disabled:opacity-40 ${ACCENT[action.accent].btn}`}
                >
                  {action.label}
                </button>
              )
            })}
          </div>

          {/* Finish Demo */}
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
              No notes yet. Tap a logging button above.
            </div>
          ) : (
            ordered.map(n => (
              <NoteCard key={n.id} note={n} onEdit={() => setEditNote(n)} />
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

      {pendingAction && (
        <ActionLogModal
          action={pendingAction}
          game={game}
          alreadySolvedPuzzleIds={solvedPuzzleIds}
          onClose={() => setPendingAction(null)}
          onConfirm={(payload) => handleActionConfirm(pendingAction, payload)}
        />
      )}
    </div>
  )
}

// ============================================================================
// ActionLogModal — shared modal for all 8 action buttons. Fields shown depend
// on the `action` config; on Confirm, calls onConfirm with a payload of
// { text, puzzleIds, componentIds, photoUrl } that the parent persists.
// ============================================================================
function ActionLogModal({ action, game, alreadySolvedPuzzleIds, onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [puzzleId, setPuzzleId] = useState('')
  const [componentId, setComponentId] = useState('')
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [isSue, setIsSue] = useState(false)
  const photoInputRef = useRef(null)

  const allPuzzles = game?.puzzles || []
  const availablePuzzles = action.filterSolved
    ? allPuzzles.filter(p => !alreadySolvedPuzzleIds.has(p.id))
    : allPuzzles
  const allComponents = game?.components || []
  // Tech Issue's component picker only shows components flagged "Has tech".
  const availableComponents = action.filterTechComponents
    ? allComponents.filter(c => c.hasTech)
    : allComponents

  const handlePhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPendingPhoto(reader.result)
    reader.readAsDataURL(f)
  }

  const canSave = (() => {
    if (action.requirePuzzle && !puzzleId) return false
    if (action.requireText && !text.trim() && !pendingPhoto) return false
    return true
  })()

  const submit = () => {
    if (!canSave) return
    onConfirm({
      text: text.trim(),
      puzzleIds: action.hasPuzzle && puzzleId ? [puzzleId] : [],
      componentIds: action.hasComponent && componentId ? [componentId] : [],
      photoUrl: pendingPhoto,
      extraCategories: action.hasSueToggle && isSue ? ['SUE'] : []
    })
  }

  const accent = ACCENT[action.accent]

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-ink-950/70 px-3 pt-6 pb-3 sm:p-4 animate-fadeUp overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-ink-800 border border-ink-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-3 border-b border-ink-700 flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${accent.dot}`} />
          <div className="text-sm font-semibold text-ink-100 flex-1">{action.label}</div>
          <button onClick={onClose} className="text-ink-400 active:text-ink-200 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {action.hasText && (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a note…"
              rows={3}
              className="w-full bg-ink-900 border border-ink-700 rounded-xl px-3 py-2 outline-none focus:border-accent-500 resize-none text-sm"
            />
          )}

          {action.hasPuzzle && (
            action.requirePuzzle ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-1.5">Puzzle</div>
                {availablePuzzles.length === 0 ? (
                  <div className="text-sm text-ink-400 text-center py-4">All puzzles already marked solved this demo.</div>
                ) : (
                  <div className="space-y-1.5">
                    {availablePuzzles.map(p => {
                      const active = puzzleId === p.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => setPuzzleId(p.id)}
                          className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 ${
                            active ? 'bg-emerald-500/15 border-emerald-400' : 'bg-ink-900 border-ink-700 active:bg-ink-700'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            active ? 'bg-emerald-400 border-emerald-400' : 'border-ink-500'
                          }`}>
                            {active && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0b0f17" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {p.code && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 border border-ink-700">{p.code}</span>
                              )}
                              <span className="font-semibold truncate">{p.name}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-1.5">Puzzle</div>
                {allPuzzles.length === 0 ? (
                  <div className="text-[11px] text-ink-500 italic">No puzzles defined for this game.</div>
                ) : (
                  <DropdownSelect
                    value={puzzleId}
                    onChange={setPuzzleId}
                    options={[
                      { value: '', label: '— None —' },
                      ...allPuzzles.map(p => ({
                        value: p.id,
                        label: p.code ? `${p.code} · ${p.name}` : p.name
                      }))
                    ]}
                  />
                )}
              </div>
            )
          )}

          {action.hasComponent && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-1.5">Component</div>
              {availableComponents.length === 0 ? (
                <div className="text-[11px] text-ink-500 italic">
                  {action.filterTechComponents
                    ? 'No tech-enabled components defined for this game. Toggle "Has tech" on a component in Admin.'
                    : 'No components defined for this game.'}
                </div>
              ) : (
                <DropdownSelect
                  value={componentId}
                  onChange={setComponentId}
                  options={[
                    { value: '', label: '— None —' },
                    ...availableComponents.map(c => ({
                      value: c.id,
                      label: c.code ? `${c.code} · ${c.name}` : c.name
                    }))
                  ]}
                />
              )}
            </div>
          )}

          {action.hasSueToggle && (
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-900 border border-ink-700 cursor-pointer active:bg-ink-700">
              <input
                type="checkbox"
                checked={isSue}
                onChange={(e) => setIsSue(e.target.checked)}
                className="w-5 h-5 accent-orange-500 flex-shrink-0"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-orange-300">Mark as SUE</div>
                <div className="text-[11px] text-ink-500">Excluded from trends averages; still shown on this demo's timeline.</div>
              </div>
            </label>
          )}

          {!action.noPhoto && (
            <div>
              <button
                onClick={() => photoInputRef.current?.click()}
                className={`w-full rounded-xl border py-2.5 px-3 flex items-center gap-3 ${
                  pendingPhoto ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-ink-900 border-ink-700 text-ink-300 active:bg-ink-700'
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M16 5l-1.5-2h-5L8 5" />
                </svg>
                <span className="text-sm font-medium flex-1 text-left">
                  {pendingPhoto ? 'Photo attached' : 'Attach photo (optional)'}
                </span>
                {pendingPhoto && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setPendingPhoto(null) }}
                    className="text-xs text-rose-300 active:text-rose-400 px-2"
                    role="button"
                  >Remove</span>
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhoto}
              />
              {pendingPhoto && (
                <ClickablePhoto src={pendingPhoto} className="mt-2 w-full h-32 rounded-xl object-cover" />
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-3 border-t border-ink-700">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-ink-700 active:bg-ink-600 font-medium">Cancel</button>
          <button onClick={submit} disabled={!canSave}
            className={`flex-[2] py-3 rounded-xl font-bold disabled:opacity-40 ${accent.btn}`}
          >Confirm</button>
        </div>
      </div>
    </div>
  )
}

function DropdownSelect({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-ink-900 border border-ink-700 rounded-xl pl-3 pr-9 py-2.5 outline-none focus:border-accent-500 text-sm font-medium text-ink-100"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
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
          End &amp; Save Discussion
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
                    {s.time && <span>{fmtClockTime(s.time)}</span>}
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
