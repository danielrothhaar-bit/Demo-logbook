import React, { useState } from 'react'
import { useStore } from '../store.jsx'

export default function SessionSetup() {
  const { dispatch } = useStore()
  const [roomName, setRoomName] = useState('')
  const [teamSize, setTeamSize] = useState(4)
  const [experience, setExperience] = useState('experienced')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const submit = () => {
    if (!roomName.trim()) return
    dispatch({
      type: 'CREATE_SESSION',
      roomName: roomName.trim(),
      teamSize,
      experience,
      date
    })
  }

  return (
    <div className="px-4 pt-4 space-y-5">
      <Field label="Room name">
        <input
          autoFocus
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="The Vault"
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 text-base outline-none focus:border-accent-500"
        />
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
                  ? 'bg-accent-500 text-ink-950 border-accent-500'
                  : 'bg-ink-800 border-ink-700 text-ink-200 active:bg-ink-700'
              }`}
            >{opt.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Date">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 text-base outline-none focus:border-accent-500"
        />
      </Field>

      <div className="pt-2 flex gap-3">
        <button
          onClick={() => dispatch({ type: 'SET_MODE', mode: 'home' })}
          className="flex-1 py-4 rounded-2xl bg-ink-800 border border-ink-700 active:bg-ink-700 font-medium"
        >Cancel</button>
        <button
          onClick={submit}
          disabled={!roomName.trim()}
          className="flex-[2] py-4 rounded-2xl bg-accent-500 active:bg-accent-600 disabled:opacity-40 disabled:active:bg-accent-500 text-ink-950 font-bold"
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
