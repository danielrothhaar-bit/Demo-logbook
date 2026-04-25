import React from 'react'
import { useStore, fmtCountdown } from '../store.jsx'
import FeedbackBreakdown from './FeedbackBreakdown.jsx'
import ClickablePhoto from './ClickablePhoto.jsx'

export default function NoteCard({ note, onDelete, onEdit, dimWhenOther }) {
  const { categoryColor, designerById, state, gameById } = useStore()
  const designer = designerById(note.designerId)
  const isMine = note.designerId === state.activeDesignerId

  if (note.kind === 'feedback') {
    return <FeedbackBreakdown note={note} onDelete={onDelete} onEdit={onEdit} />
  }

  // Resolve puzzle/component names from any session this note might belong to
  // (the parent passes the right session implicitly via the note's session ownership).
  const findGame = () => {
    for (const s of state.sessions) {
      if (s.notes.some(n => n.id === note.id)) return gameById(s.gameId)
    }
    return null
  }
  const game = findGame()
  const puzzleRefs     = (note.puzzleIds    || []).map(id => game?.puzzles   ?.find(p => p.id === id)).filter(Boolean)
  const componentRefs  = (note.componentIds || []).map(id => game?.components?.find(c => c.id === id)).filter(Boolean)

  return (
    <div className={`rounded-2xl p-3 border animate-fadeUp ${
      isMine ? 'bg-ink-800 border-ink-700' : (dimWhenOther ? 'bg-ink-900 border-ink-800' : 'bg-ink-800/70 border-ink-700')
    }`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-xs tabular-nums text-ink-400 bg-ink-900 rounded px-1.5 py-0.5">
          {fmtCountdown(note.timestamp)}
        </span>
        {designer && (
          <span
            className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center text-ink-950"
            style={{ backgroundColor: designer.color }}
            title={designer.name}
          >
            {designer.initials}
          </span>
        )}
        <div className="flex flex-wrap gap-1 flex-1">
          {note.categories.map(c => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${categoryColor(c)}22`, color: categoryColor(c) }}>
              {c}
            </span>
          ))}
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-ink-500 active:text-ink-200 px-2 -mr-1"
            aria-label="Edit note"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
        {onDelete && !onEdit && isMine && (
          <button
            onClick={onDelete}
            className="text-ink-500 active:text-rose-400 px-2 -mr-1"
            aria-label="Delete note"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        )}
      </div>
      <div className="text-[15px] leading-snug text-ink-50 break-words">{note.text}</div>

      {(puzzleRefs.length > 0 || componentRefs.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {puzzleRefs.map(p => (
            <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-400/30 text-violet-200 font-medium">
              🧩 {p.code ? <span className="font-mono opacity-70 mr-1">{p.code}</span> : null}{p.name}
            </span>
          ))}
          {componentRefs.map(c => (
            <span key={c.id} className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 border border-pink-400/30 text-pink-200 font-medium">
              ⚙ {c.code ? <span className="font-mono opacity-70 mr-1">{c.code}</span> : null}{c.name}
            </span>
          ))}
        </div>
      )}

      {note.photoUrl && (
        <ClickablePhoto src={note.photoUrl} className="mt-2 rounded-lg max-h-48 w-full object-cover" />
      )}
    </div>
  )
}
