import React, { useState } from 'react'
import { useStore } from '../store.jsx'

export default function PersonaSwitcher() {
  const { state, dispatch, activeDesigner } = useStore()
  const [open, setOpen] = useState(false)
  const noPick = !activeDesigner

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border active:bg-ink-700 ${
          noPick
            ? 'bg-accent-500/15 border-accent-400/60'
            : 'bg-ink-800 border-ink-700'
        }`}
        aria-label="Switch designer persona"
      >
        {activeDesigner ? (
          <>
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-ink-950 text-sm"
              style={{ backgroundColor: activeDesigner.color }}
            >
              {activeDesigner.initials}
            </span>
            <span className="text-sm font-medium hidden xs:block">{activeDesigner.name}</span>
          </>
        ) : (
          <>
            <span className="w-9 h-9 rounded-full flex items-center justify-center bg-ink-900 border border-accent-400/60 text-accent-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </span>
            <span className="text-sm font-medium text-accent-300">Pick name</span>
          </>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-60 bg-ink-800 border border-ink-700 rounded-2xl shadow-xl z-40 overflow-hidden animate-fadeUp">
            <div className="px-4 py-3 text-xs uppercase tracking-wider text-ink-400 border-b border-ink-700">
              Logging as
            </div>
            {state.designers.map(d => (
              <button
                key={d.id}
                onClick={() => {
                  dispatch({ type: 'SET_ACTIVE_DESIGNER', id: d.id })
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-ink-700 ${d.id === state.activeDesignerId ? 'bg-ink-700/60' : ''}`}
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-ink-950 text-sm"
                  style={{ backgroundColor: d.color }}
                >
                  {d.initials}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-ink-400">{d.id === state.activeDesignerId ? 'active' : 'switch to'}</div>
                </div>
                {d.id === state.activeDesignerId && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
            <div className="px-4 py-2 text-[11px] text-ink-400 border-t border-ink-700">
              Multi-designer collab simulated locally — toggle to see merged feed.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
