import React from 'react'
import { useStore } from '../store.jsx'

export default function BottomNav() {
  const { state, dispatch } = useStore()

  const tabs = [
    { id: 'home',   label: 'Home',   icon: HomeIcon },
    { id: 'live',   label: 'Live',   icon: MicIcon, requiresActive: true },
    { id: 'review', label: 'Review', icon: ListIcon, requiresLastSession: true },
    { id: 'trends', label: 'Trends', icon: ChartIcon }
  ]

  const goTo = (tab) => {
    if (tab.id === 'review') {
      // Always land on the session list (today by default)
      dispatch({ type: 'OPEN_SESSION_REVIEW', id: null })
      return
    }
    if (tab.id === 'live' && !state.activeSessionId) {
      dispatch({ type: 'SET_MODE', mode: 'home' })
      return
    }
    dispatch({ type: 'SET_MODE', mode: tab.id })
  }

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-30 backdrop-blur bg-ink-950/90 border-t border-ink-800">
      <div className="grid grid-cols-4">
        {tabs.map(tab => {
          const active = state.mode === tab.id
          const Icon = tab.icon
          const dim = (tab.requiresActive && !state.activeSessionId)
          return (
            <button
              key={tab.id}
              onClick={() => goTo(tab)}
              className={`flex flex-col items-center justify-center gap-1 py-3 active:bg-ink-800 ${active ? 'text-accent-400' : dim ? 'text-ink-500' : 'text-ink-200'}`}
            >
              <Icon active={active} />
              <span className="text-[11px] font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function HomeIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
  </svg>
)}
function MicIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
  </svg>
)}
function ListIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
  </svg>
)}
function ChartIcon() { return (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <line x1="3" y1="20" x2="21" y2="20" /><rect x="6" y="11" width="3" height="9" /><rect x="11" y="6" width="3" height="14" /><rect x="16" y="14" width="3" height="6" />
  </svg>
)}
