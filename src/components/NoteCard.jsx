import React from 'react'
import { useStore, fmtTime } from '../store.jsx'

export default function NoteCard({ note, onDelete, dimWhenOther }) {
  const { categoryColor, designerById, state } = useStore()
  const designer = designerById(note.designerId)
  const isMine = note.designerId === state.activeDesignerId

  return (
    <div className={`rounded-2xl p-3 border animate-fadeUp ${
      isMine ? 'bg-ink-800 border-ink-700' : (dimWhenOther ? 'bg-ink-900 border-ink-800' : 'bg-ink-800/70 border-ink-700')
    }`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-xs tabular-nums text-ink-400 bg-ink-900 rounded px-1.5 py-0.5">
          {fmtTime(note.timestamp)}
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
        {onDelete && isMine && (
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
      {note.photoUrl && (
        <img src={note.photoUrl} alt="" className="mt-2 rounded-lg max-h-48 w-full object-cover" />
      )}
    </div>
  )
}
