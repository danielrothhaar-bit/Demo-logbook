// Heuristic synthesis utilities. Pure functions, no React.

const STOP = new Set([
  'the','a','an','and','or','but','if','of','to','for','on','in','at','by','with','from','as','is','was',
  'were','be','been','it','its','this','that','these','those','they','them','their','our','we','you',
  'i','he','she','his','her','too','so','then','than','not','no','very','just','about'
])

export function tokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && w.length > 2 && !STOP.has(w))
}

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b)
  if (!A.size && !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

// Group notes into time buckets where designers overlap.
// A "cluster" is a contiguous run of notes within `windowSec` of each other.
export function clusterByTime(notes, windowSec = 90) {
  if (!notes.length) return []
  const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp)
  const clusters = []
  let current = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]
    const last = current[current.length - 1]
    if (n.timestamp - last.timestamp <= windowSec) current.push(n)
    else { clusters.push(current); current = [n] }
  }
  clusters.push(current)
  return clusters
}

// A consensus moment: 2+ notes in same cluster from DIFFERENT designers sharing a category
export function findConsensus(notes, { windowSec = 90 } = {}) {
  const clusters = clusterByTime(notes, windowSec)
  const out = []
  for (const cluster of clusters) {
    const designerCount = new Set(cluster.map(n => n.designerId)).size
    if (designerCount < 2) continue

    // Group cluster notes by category
    const byCat = {}
    for (const n of cluster) {
      for (const c of (n.categories || [])) {
        byCat[c] = byCat[c] || []
        byCat[c].push(n)
      }
    }
    for (const [cat, ns] of Object.entries(byCat)) {
      const designers = new Set(ns.map(n => n.designerId))
      if (designers.size >= 2) {
        out.push({
          kind: 'consensus',
          category: cat,
          notes: ns,
          designerIds: [...designers],
          startTs: Math.min(...ns.map(n => n.timestamp)),
          endTs: Math.max(...ns.map(n => n.timestamp))
        })
      }
    }

    // Also catch text-similarity consensus where categories differ
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i], b = cluster[j]
        if (a.designerId === b.designerId) continue
        const sim = jaccard(tokens(a.text), tokens(b.text))
        if (sim >= 0.34) {
          // dedupe with category-level consensus already pushed
          const exists = out.some(c =>
            c.kind === 'consensus' && c.notes.some(n => n.id === a.id) && c.notes.some(n => n.id === b.id)
          )
          if (!exists) {
            out.push({
              kind: 'consensus',
              category: 'Similar wording',
              notes: [a, b],
              designerIds: [a.designerId, b.designerId],
              startTs: Math.min(a.timestamp, b.timestamp),
              endTs: Math.max(a.timestamp, b.timestamp),
              similarity: sim
            })
          }
        }
      }
    }
  }
  return out.sort((x, y) => x.startTs - y.startTs)
}

// Divergence: same cluster, contradictory categories (positive vs negative)
const POSITIVE = new Set(['Wow Moment', 'Puzzle Solved'])
const NEGATIVE = new Set(['Game Flow Issue', 'Puzzle Logic Issue', 'Tech Issue', 'Frustration'])

export function findDivergence(notes, { windowSec = 90 } = {}) {
  const clusters = clusterByTime(notes, windowSec)
  const out = []
  for (const cluster of clusters) {
    const designerCount = new Set(cluster.map(n => n.designerId)).size
    if (designerCount < 2) continue

    const positives = cluster.filter(n => n.kind !== 'feedback' && n.categories?.some(c => POSITIVE.has(c)))
    const negatives = cluster.filter(n => n.kind !== 'feedback' && n.categories?.some(c => NEGATIVE.has(c)))
    const posDesigners = new Set(positives.map(n => n.designerId))
    const negDesigners = new Set(negatives.map(n => n.designerId))

    // contradiction requires DIFFERENT designers on opposite sides
    const overlap = [...posDesigners].some(d => !negDesigners.has(d)) &&
                    [...negDesigners].some(d => !posDesigners.has(d))

    if (positives.length && negatives.length && overlap) {
      out.push({
        kind: 'divergence',
        notes: [...positives, ...negatives],
        positiveNoteIds: positives.map(n => n.id),
        negativeNoteIds: negatives.map(n => n.id),
        startTs: Math.min(...cluster.map(n => n.timestamp)),
        endTs: Math.max(...cluster.map(n => n.timestamp))
      })
    }
  }
  return out
}

// Likely duplicates: 2+ notes within `windowSec`, share category, and similar wording.
// Returns merge groups; consumers can render them as a single merged card.
export function findDuplicates(notes, { windowSec = 30, minSim = 0.4 } = {}) {
  const clusters = clusterByTime(notes, windowSec)
  const groups = []
  for (const cluster of clusters) {
    const used = new Set()
    for (let i = 0; i < cluster.length; i++) {
      if (used.has(cluster[i].id)) continue
      const group = [cluster[i]]
      const seedTokens = tokens(cluster[i].text)
      const seedCats = new Set(cluster[i].categories || [])
      for (let j = i + 1; j < cluster.length; j++) {
        if (used.has(cluster[j].id)) continue
        const cand = cluster[j]
        if (cand.designerId === cluster[i].designerId) continue
        const sharedCat = (cand.categories || []).some(c => seedCats.has(c))
        const sim = jaccard(seedTokens, tokens(cand.text))
        if (sharedCat && sim >= minSim) {
          group.push(cand)
          used.add(cand.id)
        }
      }
      if (group.length >= 2) {
        used.add(cluster[i].id)
        groups.push({
          kind: 'duplicate',
          notes: group,
          designerIds: [...new Set(group.map(n => n.designerId))],
          startTs: Math.min(...group.map(n => n.timestamp)),
          endTs: Math.max(...group.map(n => n.timestamp)),
          mergedText: pickRepresentativeText(group)
        })
      }
    }
  }
  return groups
}

function pickRepresentativeText(notes) {
  // Pick the longest non-empty text (most descriptive)
  return notes
    .map(n => n.text)
    .filter(t => t && !t.startsWith('['))
    .sort((a, b) => b.length - a.length)[0] || notes[0].text
}

// AI-style summary based purely on counts and clustering.
export function summarize(notes, designersById) {
  if (!notes.length) {
    return { issues: [], wins: [], actions: [], counts: {} }
  }
  const counts = {}
  for (const n of notes) for (const c of (n.categories || [])) counts[c] = (counts[c] || 0) + 1

  // Issues: top notes in NEGATIVE categories, weighted by # of distinct designers in their cluster
  const consensus = findConsensus(notes)
  const consByCat = {}
  for (const c of consensus) {
    if (NEGATIVE.has(c.category)) {
      consByCat[c.category] = consByCat[c.category] || []
      consByCat[c.category].push(c)
    }
  }

  const negNotes = notes.filter(n => n.categories?.some(c => NEGATIVE.has(c)))
  const issues = topMoments(negNotes, consensus, 3)
  const posNotes = notes.filter(n => n.categories?.some(c => POSITIVE.has(c)))
  const wins = topMoments(posNotes, consensus, 3)

  // Actions ranked by distinct-designer count of related issues
  const actions = issues.map((iss) => ({
    text: actionPhrase(iss),
    rank: iss.designerCount,
    relatedNoteIds: iss.noteIds,
    relatedCategory: iss.category,
    timestamp: iss.timestamp
  }))

  return { issues, wins, actions, counts }
}

function topMoments(notes, consensus, n) {
  // Score each note by distinct-designer agreement in its cluster
  const scored = notes.map(note => {
    const inCluster = consensus.find(c => c.notes.some(x => x.id === note.id))
    const designerCount = inCluster ? inCluster.designerIds.length : 1
    return { note, designerCount, cluster: inCluster }
  })

  // Greedy de-dup: skip notes that share a cluster with one already taken
  const taken = []
  const seenClusters = new Set()
  scored.sort((a, b) => b.designerCount - a.designerCount || a.note.timestamp - b.note.timestamp)
  for (const s of scored) {
    const key = s.cluster ? `${s.cluster.startTs}-${s.cluster.category}` : `solo-${s.note.id}`
    if (seenClusters.has(key)) continue
    seenClusters.add(key)
    taken.push({
      text: s.note.text.startsWith('[') ? `(${s.note.categories[0]})` : s.note.text,
      timestamp: s.note.timestamp,
      category: s.note.categories?.[0],
      designerCount: s.designerCount,
      noteIds: s.cluster ? s.cluster.notes.map(x => x.id) : [s.note.id]
    })
    if (taken.length >= n) break
  }
  return taken
}

function actionPhrase(issue) {
  const cat = issue.category
  const text = issue.text
  const stamp = formatStamp(issue.timestamp)
  if (cat === 'Frustration')        return `Reduce frustration at ${stamp}: "${truncate(text, 80)}"`
  if (cat === 'Puzzle Logic Issue') return `Clarify puzzle logic at ${stamp}: "${truncate(text, 80)}"`
  if (cat === 'Tech Issue')         return `Investigate tech issue at ${stamp}: "${truncate(text, 80)}"`
  if (cat === 'Game Flow Issue')    return `Improve game flow at ${stamp}: "${truncate(text, 80)}"`
  return `Review at ${stamp}: "${truncate(text, 80)}"`
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s }
function formatStamp(sec) {
  const m = Math.floor(sec / 60), r = Math.floor(sec % 60)
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
}

// ---- Feedback Discussion analysis ----
//
// The Web Speech API has no speaker diarization, so we use a heuristic:
//   - Sentences that end in "?" or start with an interrogative are designer questions.
//   - Everything else is a guest answer / statement.
// This isn't real diarization, but it's a useful approximation for post-playthrough debriefs
// where designers ask, guests answer.
//
const INTERROGATIVE = /^(how|what|why|when|where|who|which|did|do|does|are|is|was|were|would|could|should|can|will|tell\s+me|on\s+a\s+scale|rate|rank|compare|compared)\b/i

export function analyzeFeedback(transcript) {
  if (!transcript) return { items: [], questions: [], answers: [], difficulty: null, ranking: null, isFavorite: false, summary: '' }

  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean)

  const items = sentences.map(s => ({
    text: s,
    speaker: (s.endsWith('?') || INTERROGATIVE.test(s)) ? 'designer' : 'guest'
  }))

  const questions = items.filter(i => i.speaker === 'designer')
  const answers = items.filter(i => i.speaker === 'guest')

  // Difficulty: "8 out of 10", "8/10", "an 8", "rate it 8"
  let difficulty = null
  const diff1 = transcript.match(/(\d{1,2})\s*(?:\/|out of)\s*10\b/i)
  const diff2 = !diff1 && transcript.match(/(?:rate|rated|difficulty|hard(?:ness)?|score)[^0-9]{0,40}?(\d{1,2})\b/i)
  const diff3 = !diff1 && !diff2 && transcript.match(/\b(?:i'?d\s+say|maybe|probably)[^0-9]{0,15}?(\d{1,2})\s*(?:\/|out of)\s*10\b/i)
  const m = diff1 || diff2 || diff3
  if (m) {
    const v = parseInt(m[1], 10)
    if (!isNaN(v) && v >= 1 && v <= 10) difficulty = v
  }

  // Ranking / favorite
  let ranking = null
  const rank1 = transcript.match(/\btop\s+(\d+)\b/i)
  const rank2 = !rank1 && transcript.match(/\branked?\s+(?:it\s+)?(?:my\s+)?(\d+)(?:st|nd|rd|th)?\b/i)
  const rank3 = !rank1 && !rank2 && transcript.match(/\b(?:my\s+)?#\s*(\d+)\b/i)
  const r = rank1 || rank2 || rank3
  if (r) ranking = parseInt(r[1], 10)
  const isFavorite = /\bfav(?:ou)?rite\b/i.test(transcript)

  // Build a brief summary of the most salient guest statements (longest 3 answers)
  const summaryAnswers = [...answers]
    .map(a => a.text)
    .filter(t => t.split(/\s+/).length >= 5)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)

  return {
    items,
    questions,
    answers,
    difficulty,
    ranking,
    isFavorite,
    summary: summaryAnswers.join(' ')
  }
}

// ---- Cross-session aggregation ----

/**
 * Aggregate across all demos for one game (or all games if gameId is null).
 *
 * Returns:
 *   {
 *     total:           number — count of demos
 *     totalDuration:   number — sum of timer-elapsed seconds
 *     avgDuration:     number
 *     totalNotes:      number
 *     avgNotesPerDemo: number
 *     dateRange:       { from, to }
 *     categoryCounts:  { [category]: count }
 *     puzzleStats:     { [puzzleId]: { total, negative, positive, neutral, demos, perCategory, notes } }
 *     componentStats:  same shape, keyed by componentId
 *   }
 *
 * negative = note has any NEGATIVE-set category. positive = any POSITIVE-set category.
 * neutral = total − negative − positive (a single note that's both negative and positive
 * counts in both buckets but contributes 0 to neutral).
 */
export function aggregateAcrossSessions(sessions, gameId) {
  const relevant = gameId ? sessions.filter(s => s.gameId === gameId) : sessions
  const total = relevant.length
  if (!total) {
    return {
      total: 0, totalDuration: 0, avgDuration: 0,
      totalNotes: 0, avgNotesPerDemo: 0,
      dateRange: null,
      categoryCounts: {}, puzzleStats: {}, componentStats: {}
    }
  }

  const categoryCounts = {}
  const puzzleStats = {}
  const componentStats = {}
  let totalDuration = 0
  let totalNotes = 0
  const dates = []

  const ensure = (bucket, id) => {
    if (!bucket[id]) {
      bucket[id] = {
        total: 0, negative: 0, positive: 0,
        demos: new Set(),
        perCategory: {},
        notes: []
      }
    }
    return bucket[id]
  }

  for (const sess of relevant) {
    totalDuration += sess.timerElapsed || 0
    if (sess.date) dates.push(sess.date)

    for (const n of sess.notes) {
      if (n.kind === 'feedback') continue
      totalNotes++
      const cats = n.categories || []
      for (const c of cats) categoryCounts[c] = (categoryCounts[c] || 0) + 1
      const isNeg = cats.some(c => NEGATIVE.has(c))
      const isPos = cats.some(c => POSITIVE.has(c))

      const tag = (bucket, id) => {
        const e = ensure(bucket, id)
        e.total++
        if (isNeg) e.negative++
        if (isPos) e.positive++
        e.demos.add(sess.id)
        for (const c of cats) e.perCategory[c] = (e.perCategory[c] || 0) + 1
        e.notes.push({ ...n, sessionId: sess.id, sessionDate: sess.date })
      }

      for (const pid of (n.puzzleIds    || [])) tag(puzzleStats,    pid)
      for (const cid of (n.componentIds || [])) tag(componentStats, cid)
    }
  }

  // Convert demo sets → counts
  for (const k of Object.keys(puzzleStats)) {
    puzzleStats[k].demos = puzzleStats[k].demos.size
  }
  for (const k of Object.keys(componentStats)) {
    componentStats[k].demos = componentStats[k].demos.size
  }

  dates.sort()
  return {
    total,
    totalDuration,
    avgDuration: Math.round(totalDuration / total),
    totalNotes,
    avgNotesPerDemo: Math.round((totalNotes / total) * 10) / 10,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    categoryCounts,
    puzzleStats,
    componentStats
  }
}
