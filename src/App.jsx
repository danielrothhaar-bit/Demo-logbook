import React from 'react'
import { useStore } from './store.jsx'
import Home from './components/Home.jsx'
import SessionSetup from './components/SessionSetup.jsx'
import LiveLogging from './components/LiveLogging.jsx'
import Review from './components/Review.jsx'
import Trends from './components/Trends.jsx'
import Admin from './components/Admin.jsx'
import PersonaSwitcher from './components/PersonaSwitcher.jsx'
import BottomNav from './components/BottomNav.jsx'

export default function App() {
  const { state } = useStore()

  return (
    <div className="min-h-full flex flex-col bg-ink-950">
      <Header />
      <main className="flex-1 pb-28">
        {state.mode === 'home'   && <Home />}
        {state.mode === 'setup'  && <SessionSetup />}
        {state.mode === 'live'   && <LiveLogging />}
        {state.mode === 'review' && <Review />}
        {state.mode === 'trends' && <Trends />}
        {state.mode === 'admin'  && <Admin />}
      </main>
      <BottomNav />
    </div>
  )
}

function Header() {
  const { state, dispatch } = useStore()
  const labels = {
    home: 'Demo Logbook',
    setup: 'New Playthrough',
    live: 'Live Logging',
    review: 'Review',
    trends: 'Trends',
    admin: 'Admin'
  }
  return (
    <header className="safe-top sticky top-0 z-30 backdrop-blur bg-ink-950/85 border-b border-ink-800">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-ink-400">Demo Logbook</div>
          <div className="text-lg font-semibold truncate">{labels[state.mode] || ''}</div>
        </div>
        <button
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'admin' })}
          className={`w-10 h-10 rounded-full border flex items-center justify-center ${
            state.mode === 'admin'
              ? 'bg-accent-500 border-accent-500 text-ink-50'
              : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
          }`}
          aria-label="Admin"
        >
          <GearIcon />
        </button>
        <PersonaSwitcher />
      </div>
    </header>
  )
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
