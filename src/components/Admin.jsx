import React, { useState } from 'react'
import { useStore, initialsFromName, parseBenchmark } from '../store.jsx'

const SECTIONS = [
  { id: 'designers', label: 'Users' },
  { id: 'games',     label: 'Games' }
]

export default function Admin() {
  const [section, setSection] = useState('designers')
  return (
    <div className="px-4 pt-3 space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-accent-500/15 to-rose-500/10 border border-accent-500/30 p-4">
        <div className="text-xs uppercase tracking-wider text-accent-400 mb-1">Admin</div>
        <div className="text-sm text-ink-200">Global data referenced by every other tab. Add or edit here once and it propagates.</div>
      </div>

      <div className="flex gap-1 bg-ink-800 border border-ink-700 rounded-full p-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors ${
              section === s.id ? 'bg-accent-500 text-ink-50' : 'text-ink-200 active:bg-ink-700'
            }`}
          >{s.label}</button>
        ))}
      </div>

      {section === 'designers' && <DesignersPanel />}
      {section === 'games' && <GamesPanel />}
    </div>
  )
}

// ---------- Designers ----------

const DESIGNER_COLORS = [
  '#f59e0b', '#06b6d4', '#a855f7', '#34d399', '#f472b6',
  '#60a5fa', '#fb923c', '#22d3ee', '#fbbf24', '#a78bfa',
  '#2dd4bf', '#f87171'
]

function DesignersPanel() {
  const { state, dispatch } = useStore()

  const add = () => {
    const name = (prompt('User name?') || '').trim()
    if (!name) return
    const usedColors = new Set(state.designers.map(d => d.color))
    const color = DESIGNER_COLORS.find(c => !usedColors.has(c)) || DESIGNER_COLORS[0]
    dispatch({ type: 'ADD_DESIGNER', name, initials: initialsFromName(name), color })
  }

  return (
    <div className="space-y-3">
      <button
        onClick={add}
        className="w-full rounded-2xl bg-emerald-500 active:bg-emerald-600 text-ink-950 py-3.5 font-bold"
      >+ Add User</button>

      <div className="space-y-2">
        {state.designers.map(d => <DesignerRow key={d.id} designer={d} />)}
      </div>
    </div>
  )
}

function DesignerRow({ designer }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(designer.name)
  const [initials, setInitials] = useState(designer.initials)
  const [color, setColor] = useState(designer.color)

  const inUse = state.sessions.some(s => s.notes.some(n => n.designerId === designer.id))

  const save = () => {
    dispatch({
      type: 'UPDATE_DESIGNER',
      id: designer.id,
      patch: { name: name.trim() || designer.name, initials: (initials || initialsFromName(name)).slice(0, 3).toUpperCase(), color }
    })
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="rounded-2xl bg-ink-800 border border-ink-700 p-3 flex items-center gap-3">
        <span
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-ink-950 text-sm flex-shrink-0"
          style={{ backgroundColor: designer.color }}
        >{designer.initials}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{designer.name}</div>
          <div className="text-xs text-ink-400">{inUse ? 'in use across demos' : 'no notes yet'}</div>
        </div>
        <button onClick={() => setEditing(true)}
          className="px-3 py-2 rounded-lg bg-ink-700 active:bg-ink-600 text-sm">Edit</button>
        <button
          onClick={() => {
            if (inUse) return alert('Cannot delete — user has notes in past demos.')
            if (confirm(`Delete ${designer.name}?`)) dispatch({ type: 'DELETE_DESIGNER', id: designer.id })
          }}
          disabled={inUse}
          className="px-3 py-2 rounded-lg text-sm text-rose-300 active:bg-rose-900/30 disabled:opacity-30">×</button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-ink-800 border border-accent-500/40 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-ink-950 text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >{initials || '?'}</span>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setInitials(initialsFromName(e.target.value)) }}
          placeholder="Name"
          className="flex-1 bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500"
        />
        <input
          value={initials}
          onChange={(e) => setInitials(e.target.value.slice(0, 3).toUpperCase())}
          maxLength={3}
          className="w-16 bg-ink-900 border border-ink-700 rounded-lg px-2 py-2 text-center font-bold outline-none focus:border-accent-500"
        />
      </div>
      <div>
        <div className="text-xs text-ink-400 mb-1.5">Color</div>
        <div className="flex flex-wrap gap-1.5">
          {DESIGNER_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-9 h-9 rounded-full border-2 ${color === c ? 'border-ink-50' : 'border-ink-700'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)}
          className="flex-1 py-2.5 rounded-xl bg-ink-700 active:bg-ink-600 text-sm">Cancel</button>
        <button onClick={save}
          className="flex-[2] py-2.5 rounded-xl bg-emerald-500 active:bg-emerald-600 text-ink-950 font-semibold">Save</button>
      </div>
    </div>
  )
}

// ---------- Games ----------

function GamesPanel() {
  const { state, dispatch } = useStore()
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (state.games.some(g => g.name.toLowerCase() === v.toLowerCase())) {
      alert('A game with that name already exists.')
      return
    }
    dispatch({ type: 'ADD_GAME', name: v })
    setDraft('')
  }

  // Newest first for visual hierarchy
  const sorted = [...state.games].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New game name…"
          className="flex-1 bg-ink-800 border border-ink-700 rounded-xl px-3 py-3 outline-none focus:border-accent-500"
        />
        <button onClick={add} disabled={!draft.trim()}
          className="px-5 rounded-xl bg-emerald-500 active:bg-emerald-600 disabled:opacity-30 text-ink-950 font-semibold">
          Add
        </button>
      </div>
      <div className="text-[11px] text-ink-500 px-1">Newest game becomes the default for new demos.</div>

      <div className="space-y-2">
        {sorted.map((g, i) => <GameRow key={g.id} game={g} isNewest={i === 0} />)}
      </div>
    </div>
  )
}

function GameRow({ game, isNewest }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(game.name)

  const sessionCount = state.sessions.filter(s => s.gameId === game.id).length
  const inUse = sessionCount > 0
  const puzzles = game.puzzles || []
  const components = game.components || []

  const save = () => {
    const v = name.trim()
    if (!v) return
    dispatch({ type: 'UPDATE_GAME', id: game.id, patch: { name: v } })
    setEditing(false)
  }

  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-8 h-8 rounded-lg bg-ink-900 border border-ink-700 active:bg-ink-700 flex items-center justify-center"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' , transition: 'transform 150ms' }}>
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              className="w-full bg-ink-900 border border-accent-500 rounded-lg px-3 py-2 outline-none"
            />
          ) : (
            <>
              <div className="font-semibold truncate flex items-center gap-2">
                {game.name}
                {isNewest && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-500/20 text-accent-400 font-bold">newest</span>}
              </div>
              <div className="text-xs text-ink-400">
                {sessionCount} demo{sessionCount === 1 ? '' : 's'} · {puzzles.length} puzzle{puzzles.length === 1 ? '' : 's'} · {components.length} component{components.length === 1 ? '' : 's'}
              </div>
            </>
          )}
        </div>
        {editing ? (
          <>
            <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg bg-ink-700 active:bg-ink-600 text-sm">Cancel</button>
            <button onClick={save} className="px-3 py-2 rounded-lg bg-emerald-500 active:bg-emerald-600 text-ink-950 text-sm font-semibold">Save</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg bg-ink-700 active:bg-ink-600 text-sm">Edit</button>
            <button
              onClick={() => {
                if (inUse) return alert('Cannot delete — game has past demos. Rename it instead.')
                if (confirm(`Delete "${game.name}"?`)) dispatch({ type: 'DELETE_GAME', id: game.id })
              }}
              disabled={inUse}
              className="px-3 py-2 rounded-lg text-sm text-rose-300 active:bg-rose-900/30 disabled:opacity-30">×</button>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-ink-700 bg-ink-900/40 p-3 space-y-3">
          <NamedItemList
            title="Puzzles"
            hint="Auto-tag and link notes that mention these by name. Optional benchmark = target solve time (mm:ss countdown)."
            items={puzzles}
            kind="puzzle"
            onAdd={(name, code) => dispatch({ type: 'ADD_PUZZLE', gameId: game.id, name, code })}
            onUpdate={(id, patch) => dispatch({ type: 'UPDATE_PUZZLE', gameId: game.id, id, patch })}
            onDelete={(id) => dispatch({ type: 'DELETE_PUZZLE', gameId: game.id, id })}
            onReorder={(next) => dispatch({ type: 'UPDATE_GAME', id: game.id, patch: { puzzles: next } })}
          />
          <NamedItemList
            title="Components"
            hint="Physical props, locks, screens, audio cues, etc. Code is shown as a small chip; auto-tagging matches names only."
            items={components}
            kind="component"
            onAdd={(name, code) => dispatch({ type: 'ADD_COMPONENT', gameId: game.id, name, code })}
            onUpdate={(id, patch) => dispatch({ type: 'UPDATE_COMPONENT', gameId: game.id, id, patch })}
            onDelete={(id) => dispatch({ type: 'DELETE_COMPONENT', gameId: game.id, id })}
            onReorder={(next) => dispatch({ type: 'UPDATE_GAME', id: game.id, patch: { components: next } })}
          />
        </div>
      )}
    </div>
  )
}

function NamedItemList({ title, hint, items, kind, onAdd, onUpdate, onDelete, onReorder }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const add = () => {
    const v = name.trim()
    if (!v) return
    if (items.some(i => i.name.toLowerCase() === v.toLowerCase() && (i.code || '') === code.trim())) return
    onAdd(v, code.trim())
    setName('')
    setCode('')
  }
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onReorder(next)
  }
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-400">{title}</div>
      {hint && <div className="text-[11px] text-ink-500 mb-2">{hint}</div>}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <NamedItemRow key={item.id} item={item} kind={kind} allItems={items} index={i}
            canUp={i > 0} canDown={i < items.length - 1}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onSave={(patch) => onUpdate(item.id, patch)}
            onDelete={() => { if (confirm(`Delete "${item.name}"?`)) onDelete(item.id) }} />
        ))}
        {items.length === 0 && <div className="text-[11px] text-ink-500 italic">None yet.</div>}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Code (optional)"
          className="w-24 bg-ink-800 border border-ink-700 rounded-lg px-2 py-2 outline-none focus:border-accent-500 text-sm font-mono"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}…`}
          className="flex-1 min-w-0 bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 outline-none focus:border-accent-500 text-sm"
        />
        <button onClick={add} disabled={!name.trim()}
          className="px-3 rounded-lg bg-ink-700 active:bg-ink-600 disabled:opacity-30 text-sm">Add</button>
      </div>
    </div>
  )
}

function NamedItemRow({ item, kind, allItems = [], index = 0, canUp, canDown, onMoveUp, onMoveDown, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [code, setCode] = useState(item.code || '')
  const [benchmark, setBenchmark] = useState(item.benchmark || '')
  const [benchmarkName, setBenchmarkName] = useState(item.benchmarkName || '')
  // Goal time = expected solve duration in minutes. Used by Trends to flag
  // puzzles whose averaged solve time drifts more than ±1 min from this goal.
  const [goalMinutesRaw, setGoalMinutesRaw] = useState(
    item.goalMinutes != null ? String(item.goalMinutes) : ''
  )
  // Available-after prerequisites: ids of other puzzles this one becomes
  // solvable after. Used by the analyzer to anchor solve-time start.
  const [dependsOn, setDependsOn] = useState(
    Array.isArray(item.dependsOn) ? item.dependsOn : []
  )
  // Components only — flags whether this component is in scope for the
  // Tech Issue picker in Live logging.
  const [hasTech, setHasTech] = useState(!!item.hasTech)
  const isPuzzle = kind === 'puzzle'
  const isComponent = kind === 'component'
  const save = () => {
    const v = name.trim()
    if (!v) return
    const patch = { name: v, code: code.trim() }
    if (isPuzzle) {
      patch.benchmark = benchmark.trim()
      patch.benchmarkName = benchmarkName.trim()
      const goalNum = parseFloat(goalMinutesRaw)
      patch.goalMinutes = isNaN(goalNum) || goalNum <= 0 ? null : goalNum
      // Drop any ids that no longer exist in the current list (defensive).
      // Allow the special "game_start" sentinel through unfiltered.
      const validIds = new Set(allItems.map(p => p.id))
      patch.dependsOn = dependsOn.filter(id =>
        id !== item.id && (id === 'game_start' || validIds.has(id))
      )
    }
    if (isComponent) patch.hasTech = hasTech
    onSave(patch)
    setEditing(false)
  }
  if (editing) {
    return (
      <div className="bg-ink-800 border border-accent-500 rounded-lg p-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="code"
            className="w-20 bg-ink-900 border border-ink-700 rounded px-2 py-1 outline-none text-sm font-mono focus:border-accent-500" />
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            className="flex-1 min-w-0 bg-ink-900 border border-ink-700 rounded px-2 py-1 outline-none text-sm focus:border-accent-500" />
        </div>
        {isPuzzle && (() => {
          const trimmedBench = benchmark.trim()
          const benchValid = !trimmedBench || parseBenchmark(trimmedBench) != null
          return (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-yellow-300 font-semibold w-20 flex-shrink-0">Benchmark</span>
                <input
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                  placeholder="e.g. 45:00 (or just 45)"
                  className={`flex-1 min-w-0 bg-ink-900 border rounded px-2 py-1 outline-none text-sm font-mono ${
                    benchValid ? 'border-ink-700 focus:border-accent-500' : 'border-rose-500 focus:border-rose-400'
                  }`}
                />
              </div>
              {!benchValid && (
                <div className="text-[11px] text-rose-300 ml-[5.5rem]">
                  Couldn't parse "{trimmedBench}". Use mm:ss countdown form (e.g. 45:00) or bare minutes (e.g. 45). This benchmark won't render until fixed.
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-yellow-300 font-semibold w-20 flex-shrink-0">Bench label</span>
                <input
                  value={benchmarkName}
                  onChange={(e) => setBenchmarkName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                  placeholder="e.g. Halfway, Locker, Final"
                  className="flex-1 min-w-0 bg-ink-900 border border-ink-700 rounded px-2 py-1 outline-none text-sm focus:border-accent-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold w-20 flex-shrink-0">Goal time</span>
                <input
                  inputMode="decimal"
                  value={goalMinutesRaw}
                  onChange={(e) => setGoalMinutesRaw(e.target.value.replace(/[^0-9.]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                  placeholder="minutes (optional)"
                  className="flex-1 min-w-0 bg-ink-900 border border-ink-700 rounded px-2 py-1 outline-none text-sm tabular-nums focus:border-accent-500"
                />
                <span className="text-[10px] text-ink-300 flex-shrink-0">min</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold w-20 flex-shrink-0 pt-2">Available after</span>
                <div className="flex-1 min-w-0">
                  <AvailableAfterPicker
                    options={[
                      // Virtual prereq: solve clock starts at 60:00 (demo start).
                      { id: 'game_start', name: 'Game Start', code: '' },
                      ...allItems.filter(p => p.id !== item.id)
                    ]}
                    selectedIds={dependsOn}
                    onChange={setDependsOn}
                  />
                  <div className="text-[10px] text-ink-500 mt-1">
                    Solve-time clock starts when these are all solved (or first-mention if none set).
                  </div>
                </div>
              </div>
            </>
          )
        })()}
        {isComponent && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold w-20 flex-shrink-0">Has tech</span>
            <button
              type="button"
              onClick={() => setHasTech(v => !v)}
              role="switch"
              aria-checked={hasTech}
              className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                hasTech ? 'bg-emerald-500' : 'bg-ink-700'
              }`}
            >
              <span className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                hasTech ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-xs text-ink-300">{hasTech ? 'Yes' : 'No'}</span>
            <span className="text-[10px] text-ink-500 ml-auto">Show in Tech Issue picker</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => setEditing(false)} className="text-xs text-ink-400 px-2 py-1">Cancel</button>
          <button onClick={save} className="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-ink-950 font-semibold">Save</button>
        </div>
      </div>
    )
  }
  // Zebra stripe: alternate background between ink-800 and a slightly lighter
  // shade so the eye can scan dense lists more easily. Borders shift in step
  // with the bg so the lighter row's edge stays visible.
  const stripeClasses = index % 2 === 0
    ? 'bg-ink-800 border-ink-700'
    : 'bg-ink-700 border-ink-600'
  return (
    <div className={`flex items-center gap-1.5 border rounded-lg pl-1 pr-1 py-1 ${stripeClasses}`}>
      <button onClick={onMoveUp} disabled={!canUp}
        className="w-7 h-7 rounded-md text-ink-400 active:bg-ink-700 disabled:opacity-20 flex-shrink-0">↑</button>
      <button onClick={onMoveDown} disabled={!canDown}
        className="w-7 h-7 rounded-md text-ink-400 active:bg-ink-700 disabled:opacity-20 flex-shrink-0">↓</button>
      {item.code && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 text-ink-300 border border-ink-700 flex-shrink-0">
          {item.code}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-sm">{item.name}</span>
      {isComponent && item.hasTech && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 flex-shrink-0"
              title="Available in the Tech Issue picker">
          ⚡ tech
        </span>
      )}
      {isPuzzle && Array.isArray(item.dependsOn) && item.dependsOn.length > 0 && (() => {
        const names = item.dependsOn
          .map(id => id === 'game_start'
            ? 'Game Start'
            : allItems.find(p => p.id === id)?.name)
          .filter(Boolean)
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 flex-shrink-0"
                title={`Available after: ${names.join(', ')}`}>
            ↩ {item.dependsOn.length}
          </span>
        )
      })()}
      {isPuzzle && item.goalMinutes != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 flex-shrink-0 tabular-nums"
              title={`Goal solve time: ${item.goalMinutes} minute${item.goalMinutes === 1 ? '' : 's'}`}>
          🎯 {item.goalMinutes}m
        </span>
      )}
      {isPuzzle && item.benchmark && (() => {
        const valid = parseBenchmark(item.benchmark) != null
        return (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${
            valid
              ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/50'
          }`}
                title={valid
                  ? `Benchmark${item.benchmarkName ? ` "${item.benchmarkName}"` : ''}: ${item.benchmark}`
                  : `"${item.benchmark}" can't be parsed — won't render. Edit to fix.`}>
            ⏱ {item.benchmarkName ? `${item.benchmarkName} · ` : ''}{item.benchmark}
            {!valid && ' ⚠'}
          </span>
        )
      })()}
      <button onClick={() => setEditing(true)} className="text-xs text-ink-300 active:text-ink-100 px-2 flex-shrink-0">Edit</button>
      <button onClick={onDelete} className="w-7 h-7 rounded-md text-rose-300 active:bg-rose-900/30 flex-shrink-0">✕</button>
    </div>
  )
}


// Compact <details>-based multiselect of other puzzles for the Available-after
// prerequisite. Selected ids surface as removable chips below the trigger so
// designers can see and edit picks without re-opening the dropdown.
function AvailableAfterPicker({ options, selectedIds, onChange }) {
  const selected = options.filter(p => selectedIds.includes(p.id))
  const summary = selected.length === 0
    ? '— None —'
    : selected.length === 1
      ? selected[0].name
      : `${selected.length} prerequisites`

  const toggle = (id) => {
    onChange(selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id])
  }

  if (options.length === 0) {
    return <div className="text-[11px] text-ink-500 italic px-2 py-1.5">No other puzzles in this game yet.</div>
  }

  return (
    <div>
      <details className="group rounded-lg bg-ink-900 border border-ink-700">
        <summary className="px-3 py-1.5 cursor-pointer text-sm flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
          <span className={`truncate ${selected.length === 0 ? 'text-ink-400' : 'text-ink-100'}`}>{summary}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
               className="text-ink-400 transition-transform group-open:rotate-180 flex-shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="border-t border-ink-700 max-h-48 overflow-y-auto">
          {options.map(p => {
            const active = selectedIds.includes(p.id)
            return (
              <label key={p.id}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm border-b border-ink-700/50 last:border-b-0 ${
                  active ? 'bg-cyan-500/10' : 'active:bg-ink-700'
                }`}>
                <input type="checkbox" checked={active} onChange={() => toggle(p.id)}
                  className="w-4 h-4 accent-cyan-400 flex-shrink-0" />
                {p.code && <span className="font-mono text-[11px] text-ink-400">{p.code}</span>}
                <span className="flex-1 truncate">{p.name}</span>
              </label>
            )
          })}
        </div>
      </details>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-500/40 flex items-center gap-1"
              title="Click to remove"
            >
              <span className="truncate max-w-[8rem]">{p.name}</span>
              <span className="opacity-60">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
