import React, { useState } from 'react'
import { useStore } from '../store.jsx'

export default function CategoryEditor({ onClose }) {
  const { state, dispatch } = useStore()
  const [list, setList] = useState(state.categories)
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v || list.includes(v)) return
    setList([...list, v])
    setDraft('')
  }

  const remove = (c) => setList(list.filter(x => x !== c))

  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    setList(next)
  }

  const save = () => {
    dispatch({ type: 'SET_CATEGORIES', categories: list })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink-950/85 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-ink-800 border border-ink-700 rounded-3xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Edit quick tags</h3>
          <button onClick={onClose} className="text-ink-400 active:text-ink-200 text-2xl leading-none">×</button>
        </div>

        <div className="space-y-2 mb-3">
          {list.map((c, i) => (
            <div key={c} className="flex items-center gap-2 bg-ink-900 border border-ink-700 rounded-xl pl-3 pr-1 py-1">
              <span className="flex-1">{c}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0}
                className="w-9 h-9 rounded-lg active:bg-ink-700 disabled:opacity-30">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === list.length - 1}
                className="w-9 h-9 rounded-lg active:bg-ink-700 disabled:opacity-30">↓</button>
              <button onClick={() => remove(c)}
                className="w-9 h-9 rounded-lg active:bg-rose-900/40 text-rose-300">✕</button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="New tag…"
            className="flex-1 bg-ink-900 border border-ink-700 rounded-xl px-3 py-2.5 outline-none focus:border-accent-500"
          />
          <button onClick={add} className="px-4 rounded-xl bg-ink-700 active:bg-ink-600">Add</button>
        </div>

        <button onClick={save} className="w-full py-3.5 rounded-xl bg-accent-500 active:bg-accent-600 text-ink-950 font-bold">
          Save
        </button>
      </div>
    </div>
  )
}
