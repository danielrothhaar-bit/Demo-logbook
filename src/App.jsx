import React from 'react'
import { useStore } from './store.jsx'
import Home from './components/Home.jsx'
import SessionSetup from './components/SessionSetup.jsx'
import LiveLogging from './components/LiveLogging.jsx'
import Review from './components/Review.jsx'
import Trends from './components/Trends.jsx'
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
      </main>
      <BottomNav />
    </div>
  )
}

function Header() {
  const { state } = useStore()
  const labels = {
    home: 'Demo Logbook',
    setup: 'New Playthrough',
    live: 'Live Logging',
    review: 'Review',
    trends: 'Trends'
  }
  return (
    <header className="safe-top sticky top-0 z-30 backdrop-blur bg-ink-950/85 border-b border-ink-800">
      <div className="px-4 pt-2 pb-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-ink-400">Demo Logbook</div>
          <div className="text-lg font-semibold truncate">{labels[state.mode] || ''}</div>
        </div>
        <PersonaSwitcher />
      </div>
    </header>
  )
}
