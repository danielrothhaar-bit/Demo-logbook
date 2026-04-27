import React from 'react'
import { useStore, fmtTime, fmtClockTime } from '../store.jsx'

export default function Home() {
  const { state, dispatch, designerById, gameName } = useStore()

  const live = state.sessions.filter(s => !s.ended)
  const past = state.sessions.filter(s => s.ended)

  return (
    <div className="px-4 pt-4 space-y-6">
      <button
        onClick={() => dispatch({ type: 'SET_MODE', mode: 'setup' })}
        className="w-full rounded-2xl bg-emerald-500 active:bg-emerald-600 text-ink-950 py-5 font-bold text-lg shadow-lg shadow-emerald-500/20"
      >
        + Start New Demo
      </button>

      {live.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-ink-400 mb-2 px-1">In progress</h2>
          <div className="space-y-2">
            {live.map(s => (
              <button
                key={s.id}
                onClick={() => dispatch({ type: 'OPEN_SESSION_LIVE', id: s.id })}
                className="w-full text-left rounded-2xl bg-ink-800 border border-accent-500/40 p-4 active:bg-ink-700"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{gameName(s.gameId)}</div>
                    <div className="text-sm text-ink-300 mt-0.5">
                      {s.time && <span>{fmtClockTime(s.time)}</span>}
                      {s.time && <span className="text-ink-500 mx-1.5">·</span>}
                      <span>{s.date}</span>
                    </div>
                    <div className="text-[11px] text-ink-500 mt-0.5">{s.notes.length} notes</div>
                  </div>
                  <div className="font-mono text-xl tabular-nums">{fmtTime(s.timerElapsed)}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-wider text-ink-400 mb-2 px-1">Past Demos</h2>
        {past.length === 0 ? (
          <div className="text-ink-400 text-sm px-1">No completed demos yet.</div>
        ) : (
          <div className="space-y-2">
            {past.map(s => {
              const designers = [...new Set(s.notes.map(n => n.designerId))]
                .map(id => designerById(id)).filter(Boolean)
              return (
                <button
                  key={s.id}
                  onClick={() => dispatch({ type: 'OPEN_SESSION_REVIEW', id: s.id })}
                  className="w-full text-left rounded-2xl bg-ink-800 border border-ink-700 p-4 active:bg-ink-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{gameName(s.gameId)}</div>
                      <div className="text-sm text-ink-300 mt-0.5">
                        {s.time && <span>{s.time}</span>}
                        {s.time && <span className="text-ink-500 mx-1.5">·</span>}
                        <span>{s.date}</span>
                      </div>
                      <div className="text-[11px] text-ink-500 mt-0.5">
                        Team of {s.teamSize} · {s.experience} · {s.notes.length} notes
                      </div>
                    </div>
                    <div className="flex -space-x-2">
                      {designers.map(d => (
                        <span key={d.id}
                              className="w-7 h-7 rounded-full border-2 border-ink-800 flex items-center justify-center text-[10px] font-bold text-ink-950"
                              style={{ backgroundColor: d.color }}>
                          {d.initials}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
