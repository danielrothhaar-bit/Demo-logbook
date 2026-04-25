import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'

// Round the current wall-clock to the nearest :00 or :30 (rolling forward at :15/:45).
function nearestHalfHour() {
  const d = new Date()
  let h = d.getHours()
  let m = d.getMinutes()
  let halves = Math.round(m / 30)        // 0, 1, or 2
  if (halves >= 2) { h = (h + 1) % 24; halves = 0 }
  m = halves * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function SessionSetup() {
  const { state, dispatch, newestGame } = useStore()
  const newest = newestGame()
  const [gameId, setGameId] = useState(newest?.id || '')
  const [teamSize, setTeamSize] = useState(4)
  const [experience, setExperience] = useState('experienced')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState(() => nearestHalfHour())

  // If games change while open (e.g. user adds via admin), default to newest
  useEffect(() => {
    if (!gameId && newest) setGameId(newest.id)
  }, [newest, gameId])

  const submit = () => {
    if (!gameId) return
    dispatch({
      type: 'CREATE_SESSION',
      gameId,
      teamSize,
      experience,
      date,
      time
    })
  }

  // Sort games newest first so the default is at the top
  const sortedGames = [...state.games].sort((a, b) => b.createdAt - a.createdAt)

  if (sortedGames.length === 0) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-5 text-center">
          <div className="font-semibold mb-1">No games yet</div>
          <div className="text-sm text-ink-400 mb-4">Add a game in Admin before starting a demo.</div>
          <button
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'admin' })}
            className="px-5 py-3 rounded-xl bg-accent-500 active:bg-accent-600 text-ink-50 font-bold"
          >Open Admin</button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 space-y-5">
      <Field label="Game">
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 text-base outline-none focus:border-accent-500 appearance-none bg-no-repeat bg-right pr-10"
          style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239aa7c2\' stroke-width=\'3\'><polyline points=\'6 9 12 15 18 9\'/></svg>")', backgroundPosition: 'right 1rem center' }}
        >
          {sortedGames.map((g, i) => (
            <option key={g.id} value={g.id}>
              {g.name}{i === 0 ? ' (newest)' : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Team size">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTeamSize(Math.max(1, teamSize - 1))}
            className="w-12 h-12 rounded-full bg-ink-800 border border-ink-700 active:bg-ink-700 text-2xl"
          >−</button>
          <div className="flex-1 text-center text-3xl font-mono tabular-nums">{teamSize}</div>
          <button
            onClick={() => setTeamSize(Math.min(12, teamSize + 1))}
            className="w-12 h-12 rounded-full bg-ink-800 border border-ink-700 active:bg-ink-700 text-2xl"
          >+</button>
        </div>
      </Field>

      <Field label="Team experience">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'new', label: 'New' },
            { id: 'experienced', label: 'Experienced' },
            { id: 'enthusiast', label: 'Enthusiast' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setExperience(opt.id)}
              className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                experience === opt.id
                  ? 'bg-accent-500 text-ink-50 border-accent-500'
                  : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
              }`}
            >{opt.label}</button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-3 text-base outline-none focus:border-accent-500"
          />
        </Field>

        <Field label="Time">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            step={1800}
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-3 text-base outline-none focus:border-accent-500"
          />
        </Field>
      </div>

      <div className="pt-2 flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'home' })}
          className="flex-1 py-4 rounded-2xl bg-ink-800 border border-ink-700 active:bg-ink-700 font-medium"
        >Cancel</button>
        <button
          onClick={submit}
          disabled={!gameId}
          className="flex-[2] py-4 rounded-2xl bg-accent-500 active:bg-accent-600 disabled:opacity-40 text-ink-50 font-bold"
        >Start Logging</button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 px-1">{label}</div>
      {children}
    </label>
  )
}
