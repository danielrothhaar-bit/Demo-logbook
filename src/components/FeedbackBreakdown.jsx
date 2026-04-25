import React, { useMemo, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import { analyzeFeedback } from '../utils/synthesis.js'

export default function FeedbackBreakdown({ note, onDelete, onEdit }) {
  const { designerById } = useStore()
  const [expanded, setExpanded] = useState(false)
  const designer = designerById(note.designerId)
  const analysis = useMemo(() => analyzeFeedback(note.text), [note.text])

  return (
    <div className="rounded-2xl border border-blue-400/30 bg-blue-500/5 p-3 animate-fadeUp">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs tabular-nums text-ink-400 bg-ink-900 rounded px-1.5 py-0.5">
          {fmtTime(note.timestamp)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-blue-300 bg-blue-500/15 rounded-full px-2 py-0.5 font-semibold">
          Feedback Discussion
        </span>
        {designer && (
          <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center text-ink-950 ml-auto"
                style={{ backgroundColor: designer.color }} title={designer.name}>
            {designer.initials}
          </span>
        )}
        {onEdit && (
          <button onClick={onEdit}
            className="text-ink-500 active:text-ink-200 px-1"
            aria-label="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
        {onDelete && !onEdit && (
          <button onClick={onDelete}
            className="text-ink-500 active:text-rose-400 px-1"
            aria-label="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Extracted highlights */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Stat label="Difficulty" value={analysis.difficulty != null ? `${analysis.difficulty}/10` : '—'} />
        <Stat label="Ranking"
              value={analysis.ranking != null ? `#${analysis.ranking}` : analysis.isFavorite ? 'Favorite' : '—'} />
      </div>

      {/* Q & A counts */}
      <div className="text-[11px] text-ink-400 mb-2">
        {analysis.questions.length} question{analysis.questions.length === 1 ? '' : 's'} ·
        {' '}{analysis.answers.length} guest response{analysis.answers.length === 1 ? '' : 's'}
      </div>

      {/* Audio playback */}
      {note.audioUrl && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-blue-300/80 mb-1">Recorded audio</div>
          <audio
            controls
            src={note.audioUrl}
            preload="metadata"
            className="w-full h-10"
          />
        </div>
      )}

      {/* Summary preview */}
      {analysis.summary && (
        <div className="rounded-lg bg-ink-900 border border-ink-800 p-2.5 mb-2 text-sm leading-relaxed text-ink-100">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">Guest summary</div>
          {analysis.summary}
        </div>
      )}

      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left text-xs text-blue-300 active:text-blue-400 py-1"
      >
        {expanded ? '▾ Hide breakdown' : '▸ Show full Q&A breakdown'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {analysis.items.map((it, i) => (
            <div key={i}
                 className={`rounded-lg p-2 text-sm leading-snug border ${
                   it.speaker === 'designer'
                     ? 'bg-blue-500/10 border-blue-400/20 text-blue-100'
                     : 'bg-ink-900 border-ink-800 text-ink-100'
                 }`}>
              <span className="text-[10px] uppercase tracking-wider mr-2 font-bold opacity-70">
                {it.speaker === 'designer' ? 'Q' : 'A'}
              </span>
              {it.text}
            </div>
          ))}
          <div className="text-[10px] text-ink-500 italic pt-1">
            Speaker detection is heuristic — questions ↔ designers, statements ↔ guests. Web Speech API has no real diarization.
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-ink-900 border border-ink-800 p-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}
