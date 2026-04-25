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
const POSITIVE = new Set(['Wow Moment', 'Puzzle Flow'])
const NEGATIVE = new Set(['Friction Point', 'Tech Issue', 'Theming Gap'])

export function findDivergence(notes, { windowSec = 90 } = {}) {
  const clusters = clusterByTime(notes, windowSec)
  const out = []
  for (const cluster of clusters) {
    const designerCount = new Set(cluster.map(n => n.designerId)).size
    if (designerCount < 2) continue

    const positives = cluster.filter(n => n.categories?.some(c => POSITIVE.has(c)))
    const negatives = cluster.filter(n => n.categories?.some(c => NEGATIVE.has(c)))
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
  if (cat === 'Friction Point') return `Address friction at ${formatStamp(issue.timestamp)}: "${truncate(text, 80)}"`
  if (cat === 'Tech Issue')      return `Investigate tech issue at ${formatStamp(issue.timestamp)}: "${truncate(text, 80)}"`
  if (cat === 'Theming Gap')     return `Improve theming at ${formatStamp(issue.timestamp)}: "${truncate(text, 80)}"`
  return `Review at ${formatStamp(issue.timestamp)}: "${truncate(text, 80)}"`
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s }
function formatStamp(sec) {
  const m = Math.floor(sec / 60), r = Math.floor(sec % 60)
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
}

// ---- Cross-session aggregation ----

export function aggregateAcrossSessions(sessions, room) {
  const relevant = room ? sessions.filter(s => s.roomName === room) : sessions
  const total = relevant.length
  if (!total) return { rooms: [], byMinute: {}, recurringFriction: [], categoryCounts: {} }

  // Recurring friction: cluster friction notes across sessions by minute and shared keywords
  const frictionByMinute = {}
  const categoryCounts = {}
  for (const sess of relevant) {
    const seenMinutes = new Set()
    for (const n of sess.notes) {
      for (const c of n.categories || []) {
        categoryCounts[c] = (categoryCounts[c] || 0) + 1
      }
      if (!n.categories?.some(c => NEGATIVE.has(c))) continue
      const minute = Math.floor(n.timestamp / 60)
      const key = `${minute}`
      frictionByMinute[key] = frictionByMinute[key] || { minute, sessionIds: new Set(), notes: [] }
      frictionByMinute[key].sessionIds.add(sess.id)
      frictionByMinute[key].notes.push({ ...n, sessionId: sess.id })
      seenMinutes.add(minute)
    }
  }
  const recurringFriction = Object.values(frictionByMinute)
    .map(b => ({ ...b, sessionIds: [...b.sessionIds] }))
    .filter(b => b.sessionIds.length >= 2)
    .sort((a, b) => b.sessionIds.length - a.sessionIds.length)

  return { total, recurringFriction, categoryCounts }
}
