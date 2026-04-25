import React, { useMemo, useState } from 'react'
import { useStore, fmtTime } from '../store.jsx'
import NoteCard from './NoteCard.jsx'
import {
  findConsensus, findDivergence, findDuplicates, summarize
} from '../utils/synthesis.js'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'synthesis', label: 'Synthesis' },
  { id: 'summary', label: 'Summary' }
]

export default function Review() {
  const { reviewSession } = useStore()
  if (!reviewSession) {
    return (
      <div className="px-4 pt-6">
        <SessionPicker />
      </div>
    )
  }
  return <ReviewBody session={reviewSession} />
}

function ReviewBody({ session: reviewSession }) {
  const [tab, setTab] = useState('timeline')
  const [filterCats, setFilterCats] = useState([])
  const [filterDesigners, setFilterDesigners] = useState([])
  const [mergeDuplicates, setMergeDuplicates] = useState(true)
  const [tsRange, setTsRange] = useState([0, 0])

  const totalSec = reviewSession.timerElapsed || Math.max(0, ...reviewSession.notes.map(n => n.timestamp))
  const range = tsRange[1] === 0 ? [0, Math.max(totalSec, 60)] : tsRange

  const filtered = useMemo(() => {
    return reviewSession.notes.filter(n => {
      if (filterCats.length && !n.categories.some(c => filterCats.includes(c))) return false
      if (filterDesigners.length && !filterDesigners.includes(n.designerId)) return false
      if (n.timestamp < range[0] || n.timestamp > range[1]) return false
      return true
    })
  }, [reviewSession.notes, filterCats, filterDesigners, range])

  const consensus = useMemo(() => findConsensus(reviewSession.notes), [reviewSession.notes])
  const divergence = useMemo(() => findDivergence(reviewSession.notes), [reviewSession.notes])
  const duplicates = useMemo(() => findDuplicates(reviewSession.notes), [reviewSession.notes])
  const summary = useMemo(() => summarize(reviewSession.notes), [reviewSession.notes])

  // Build a timeline that, when mergeDuplicates is on, replaces duplicate-group notes with merged cards
  const timeline = useMemo(() => {
    const dupNoteIds = new Set()
    const dupCards = []
    if (mergeDuplicates) {
      for (const g of duplicates) {
        g.notes.forEach(n => dupNoteIds.add(n.id))
        if (g.notes.every(n => filtered.some(f => f.id === n.id))) {
          dupCards.push({
            kind: 'merged',
            id: 'dup-' + g.notes.map(n => n.id).join('-'),
            timestamp: g.startTs,
            group: g
          })
        }
      }
    }
    const items = filtered
      .filter(n => !mergeDuplicates || !dupNoteIds.has(n.id))
      .map(n => ({ kind: 'note', id: n.id, timestamp: n.timestamp, note: n }))
    return [...items, ...dupCards].sort((a, b) => a.timestamp - b.timestamp)
  }, [filtered, duplicates, mergeDuplicates])

  return (
    <div className="px-4 pt-3 space-y-3">
      <ReviewHeader session={reviewSession} totalSec={totalSec} />

      <div className="flex gap-1 bg-ink-800 border border-ink-700 rounded-full p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors ${
              tab === t.id ? 'bg-accent-500 text-ink-950' : 'text-ink-200 active:bg-ink-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'timeline' && (
        <>
          <Filters
            session={reviewSession}
            filterCats={filterCats} setFilterCats={setFilterCats}
            filterDesigners={filterDesigners} setFilterDesigners={setFilterDesigners}
            range={range} setTsRange={setTsRange} totalSec={Math.max(totalSec, 60)}
            mergeDuplicates={mergeDuplicates} setMergeDuplicates={setMergeDuplicates}
          />
          <div className="text-xs text-ink-400 px-1">
            {filtered.length} of {reviewSession.notes.length} notes
            {mergeDuplicates && duplicates.length > 0 && ` · ${duplicates.length} duplicate group${duplicates.length>1?'s':''} merged`}
          </div>
          <div className="space-y-2">
            {timeline.length === 0 && (
              <div className="text-ink-400 text-sm text-center py-6">No notes match these filters.</div>
            )}
            {timeline.map(item => (
              item.kind === 'note'
                ? <NoteCard key={item.id} note={item.note} />
                : <MergedCard key={item.id} group={item.group} />
            ))}
          </div>
        </>
      )}

      {tab === 'synthesis' && (
        <Synthesis
          consensus={consensus}
          divergence={divergence}
          duplicates={duplicates}
        />
      )}

      {tab === 'summary' && (
        <Summary summary={summary} session={reviewSession} />
      )}
    </div>
  )
}

function SessionPicker() {
  const { state, dispatch } = useStore()
  return (
    <div>
      <div className="text-sm text-ink-300 mb-3">Pick a session to review:</div>
      <div className="space-y-2">
        {state.sessions.map(s => (
          <button key={s.id}
            onClick={() => dispatch({ type: 'OPEN_SESSION_REVIEW', id: s.id })}
            className="w-full text-left rounded-2xl bg-ink-800 border border-ink-700 p-4 active:bg-ink-700">
            <div className="font-semibold">{s.roomName}</div>
            <div className="text-xs text-ink-400">{s.date} · {s.notes.length} notes</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ReviewHeader({ session, totalSec }) {
  const { dispatch, designerById } = useStore()
  const designers = [...new Set(session.notes.map(n => n.designerId))].map(id => designerById(id)).filter(Boolean)
  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg">{session.roomName}</div>
          <div className="text-xs text-ink-400 mt-0.5">
            {session.date} · team {session.teamSize} · {session.experience}
          </div>
          <div className="text-xs text-ink-400 mt-0.5 font-mono">
            Code {session.sessionCode} · {fmtTime(totalSec)} elapsed
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
      <button onClick={() => dispatch({ type: 'SET_MODE', mode: 'home' })}
        className="text-xs text-accent-400 active:text-accent-500 mt-2">← Back</button>
    </div>
  )
}

function Filters({ session, filterCats, setFilterCats, filterDesigners, setFilterDesigners, range, setTsRange, totalSec, mergeDuplicates, setMergeDuplicates }) {
  const { state, designerById, categoryColor } = useStore()
  const cats = [...new Set(session.notes.flatMap(n => n.categories))]
  const designers = [...new Set(session.notes.map(n => n.designerId))].map(id => designerById(id)).filter(Boolean)

  const toggle = (arr, setter, v) => {
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  }

  return (
    <details className="rounded-2xl bg-ink-800/60 border border-ink-700">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center justify-between">
        <span>Filters</span>
        <span className="text-xs text-ink-400">
          {filterCats.length + filterDesigners.length > 0 ? `${filterCats.length + filterDesigners.length} active` : 'all'}
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div>
          <div className="text-xs text-ink-400 mb-1">Categories</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map(c => {
              const active = filterCats.includes(c)
              return (
                <button key={c} onClick={() => toggle(filterCats, setFilterCats, c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${active ? 'border-accent-500' : 'border-ink-700'}`}
                  style={active ? { backgroundColor: categoryColor(c), color: '#0b0f17' } : { color: categoryColor(c) }}>
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-xs text-ink-400 mb-1">Designers</div>
          <div className="flex flex-wrap gap-1.5">
            {designers.map(d => {
              const active = filterDesigners.includes(d.id)
              return (
                <button key={d.id} onClick={() => toggle(filterDesigners, setFilterDesigners, d.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                    active ? 'border-transparent text-ink-950' : 'border-ink-700 text-ink-200'
                  }`}
                  style={active ? { backgroundColor: d.color } : {}}>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-xs text-ink-400 mb-1">Time range: {fmtTime(range[0])} – {fmtTime(range[1])}</div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={totalSec} value={range[0]}
              onChange={(e) => setTsRange([Math.min(+e.target.value, range[1]), range[1]])}
              className="flex-1 accent-amber-500" />
            <input type="range" min={0} max={totalSec} value={range[1]}
              onChange={(e) => setTsRange([range[0], Math.max(+e.target.value, range[0])])}
              className="flex-1 accent-amber-500" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mergeDuplicates} onChange={(e) => setMergeDuplicates(e.target.checked)}
            className="w-5 h-5 accent-amber-500" />
          Merge likely duplicates
        </label>
      </div>
    </details>
  )
}

function MergedCard({ group }) {
  const { designerById, categoryColor } = useStore()
  const cats = [...new Set(group.notes.flatMap(n => n.categories))]
  const designers = group.designerIds.map(id => designerById(id)).filter(Boolean)
  return (
    <div className="rounded-2xl p-3 bg-ink-800 border border-emerald-500/30 animate-fadeUp">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-xs tabular-nums text-ink-400 bg-ink-900 rounded px-1.5 py-0.5">
          {fmtTime(group.startTs)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 rounded-full px-2 py-0.5 font-semibold">
          Merged · {group.notes.length}×
        </span>
        <div className="flex flex-wrap gap-1 flex-1">
          {cats.map(c => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${categoryColor(c)}22`, color: categoryColor(c) }}>{c}</span>
          ))}
        </div>
        <div className="flex -space-x-1.5">
          {designers.map(d => (
            <span key={d.id} className="w-5 h-5 rounded-full border border-ink-800 flex items-center justify-center text-[9px] font-bold text-ink-950"
                  style={{ backgroundColor: d.color }} title={d.name}>{d.initials}</span>
          ))}
        </div>
      </div>
      <div className="text-[15px] leading-snug text-ink-50">{group.mergedText}</div>
      <details className="mt-2">
        <summary className="text-[11px] text-ink-400 cursor-pointer">Show all {group.notes.length} originals</summary>
        <div className="mt-2 space-y-1.5">
          {group.notes.map(n => {
            const d = designerById(n.designerId)
            return (
              <div key={n.id} className="text-xs text-ink-300 bg-ink-900 rounded-lg p-2">
                <span className="font-mono text-ink-400 mr-2">{fmtTime(n.timestamp)}</span>
                <span className="font-bold mr-2" style={{ color: d?.color }}>{d?.initials}</span>
                {n.text}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

function Synthesis({ consensus, divergence, duplicates }) {
  const { designerById, categoryColor } = useStore()
  return (
    <div className="space-y-4">
      <Section title="Consensus observations" hint="Multiple designers logged the same kind of moment within ~90s.">
        {consensus.length === 0 && <Empty text="No consensus moments detected." />}
        {consensus.map((c, i) => (
          <div key={i} className="rounded-2xl bg-ink-800 border border-emerald-500/40 p-3 animate-fadeUp">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-ink-300">{fmtTime(c.startTs)}–{fmtTime(c.endTs)}</span>
              <span className="px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${categoryColor(c.category)}22`, color: categoryColor(c.category) }}>
                {c.category}
              </span>
              <span className="text-emerald-300 font-semibold">· {c.designerIds.length} designers agree</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {c.notes.map(n => {
                const d = designerById(n.designerId)
                return (
                  <div key={n.id} className="text-sm text-ink-100 bg-ink-900 rounded-lg p-2">
                    <span className="font-bold mr-2" style={{ color: d?.color }}>{d?.initials}</span>{n.text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Divergence" hint="Designers logged opposite reactions in the same window.">
        {divergence.length === 0 && <Empty text="No contradictions detected." />}
        {divergence.map((d, i) => (
          <div key={i} className="rounded-2xl bg-ink-800 border border-rose-500/40 p-3 animate-fadeUp">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-ink-300">{fmtTime(d.startTs)}–{fmtTime(d.endTs)}</span>
              <span className="text-rose-300 font-semibold">Mixed reactions</span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {d.notes.map(n => {
                const designer = designerById(n.designerId)
                const isPos = n.categories?.some(c => ['Wow Moment','Puzzle Flow'].includes(c))
                return (
                  <div key={n.id} className={`text-sm rounded-lg p-2 border ${
                    isPos ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-100'
                  }`}>
                    <span className="font-bold mr-2" style={{ color: designer?.color }}>{designer?.initials}</span>
                    {n.text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Likely duplicates" hint="Same observation logged by 2+ designers ~30s apart.">
        {duplicates.length === 0 && <Empty text="No duplicates detected." />}
        {duplicates.map((g, i) => (
          <MergedCard key={i} group={g} />
        ))}
      </Section>
    </div>
  )
}

function Summary({ summary, session }) {
  const { dispatch } = useStore()

  const promote = (a) => {
    dispatch({
      type: 'ADD_ACTION_ITEM',
      item: {
        text: a.text,
        relatedCategory: a.relatedCategory,
        relatedKeyword: '',
        sourceSessionIds: [session.id]
      }
    })
    alert('Added to action items (Trends tab).')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-accent-500/15 to-emerald-500/10 border border-accent-500/30 p-4">
        <div className="text-xs uppercase tracking-wider text-accent-400 mb-1">Auto-summary</div>
        <div className="text-sm text-ink-200">
          Heuristic synthesis of {session.notes.length} notes from this session.
          Action items can be promoted to the cross-session tracker.
        </div>
      </div>

      <Section title="Top issues" emoji="🔥">
        {summary.issues.length === 0 ? <Empty text="No issues flagged." /> :
          summary.issues.map((i, idx) => (
            <SummaryRow key={idx} index={idx + 1} text={i.text}
              meta={`${fmtTime(i.timestamp)} · ${i.category}${i.designerCount > 1 ? ` · ${i.designerCount} designers agree` : ''}`} />
          ))
        }
      </Section>

      <Section title="Top wins" emoji="✨">
        {summary.wins.length === 0 ? <Empty text="No wins flagged." /> :
          summary.wins.map((w, idx) => (
            <SummaryRow key={idx} index={idx + 1} text={w.text}
              meta={`${fmtTime(w.timestamp)} · ${w.category}${w.designerCount > 1 ? ` · ${w.designerCount} designers agree` : ''}`} positive />
          ))
        }
      </Section>

      <Section title="Suggested action items" hint="Ranked by how many designers flagged related notes.">
        {summary.actions.length === 0 ? <Empty text="No actions suggested." /> :
          summary.actions.map((a, idx) => (
            <div key={idx} className="rounded-2xl bg-ink-800 border border-ink-700 p-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-accent-500 text-ink-950 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-100 leading-snug">{a.text}</div>
                <div className="text-[11px] text-ink-400 mt-1">
                  Ranked {a.rank > 1 ? `${a.rank} designers agreed` : 'single source'}
                </div>
              </div>
              <button onClick={() => promote(a)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-ink-700 active:bg-ink-600 text-ink-100">+ Track</button>
            </div>
          ))
        }
      </Section>
    </div>
  )
}

function Section({ title, hint, emoji, children }) {
  return (
    <div>
      <div className="px-1 mb-2">
        <div className="text-xs uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
          {emoji && <span>{emoji}</span>}{title}
        </div>
        {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SummaryRow({ index, text, meta, positive }) {
  return (
    <div className={`rounded-2xl p-3 border ${positive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-ink-800 border-ink-700'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
          positive ? 'bg-emerald-400 text-ink-950' : 'bg-rose-400 text-ink-950'
        }`}>{index}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm leading-snug">{text}</div>
          <div className="text-[11px] text-ink-400 mt-1 font-mono tabular-nums">{meta}</div>
        </div>
      </div>
    </div>
  )
}

function Empty({ text }) {
  return <div className="text-ink-500 text-sm px-1 py-2">{text}</div>
}
