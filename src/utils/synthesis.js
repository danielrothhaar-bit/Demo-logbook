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

// ---- Puzzle-centric session analysis ----

const HINT_CATS = new Set(['Hint', 'Clue'])

/**
 * For each puzzle in the game, compute:
 *   status:      'solved' | 'attempted' | 'untouched'
 *   firstTouchTs: earliest timestamp the puzzle was tagged
 *   solvedTs:    timestamp of the "Puzzle Solved" note (if any)
 *   timeOnPuzzle: solvedTs − firstTouchTs (only if solved)
 *   negativeCount / positiveCount / hintCount / totalNotes
 *   frustrationScore: heuristic — negatives weighted by # designers and time-on-puzzle
 *   relatedNotes: every note tagged with this puzzle (sorted)
 */
export function analyzePuzzles(notes, game) {
  const puzzles = game?.puzzles || []
  if (!puzzles.length) return []

  const live = notes.filter(n => n.kind !== 'feedback')

  // Pass 1: collect raw per-puzzle facts (notes, first-touch, solve).
  // A SUE-tagged solve note flags this puzzle's solve as "SUE" — kept in the
  // per-demo timeline but excluded from the cross-session averages so weird
  // edge-case runs don't skew trend numbers.
  const facts = puzzles.map(p => {
    const tagged = live
      .filter(n => (n.puzzleIds || []).includes(p.id))
      .sort((a, b) => a.timestamp - b.timestamp)
    const solveNote = tagged.find(n => (n.categories || []).includes('Puzzle Solved'))
    return {
      puzzle: p,
      tagged,
      firstTouchTs: tagged.length ? tagged[0].timestamp : null,
      solvedTs: solveNote ? solveNote.timestamp : null,
      isSue: solveNote ? (solveNote.categories || []).includes('SUE') : false
    }
  })
  const factsById = new Map(facts.map(f => [f.puzzle.id, f]))

  // Pass 2: derive solve duration. If `dependsOn` is set, the clock starts
  // at the latest prerequisite's solve time (only counting prereqs solved
  // before this puzzle's solve). Falls back to first-touch when no usable
  // prereq data is present, so an out-of-order solve still gets a duration.
  return facts.map(f => {
    const { puzzle: p, tagged, firstTouchTs, solvedTs, isSue } = f
    const dependsOn = Array.isArray(p.dependsOn) ? p.dependsOn : []

    let baselineTs = firstTouchTs
    // Track which dependency anchored the baseline (if any) so the UI can
    // show "took X from <prereq name>" instead of just an unlabeled duration.
    // null = no prereq used (baseline = firstTouchTs).
    let baselineSource = null
    if (dependsOn.length > 0 && solvedTs != null) {
      // Pick the latest prereq solve that happened before this puzzle's solve.
      let bestTs = null
      let bestId = null
      for (const id of dependsOn) {
        const t = id === 'game_start' ? 0 : factsById.get(id)?.solvedTs
        if (t != null && t < solvedTs && (bestTs == null || t > bestTs)) {
          bestTs = t
          bestId = id
        }
      }
      if (bestTs != null) {
        baselineTs = bestTs
        baselineSource = bestId
      }
    }
    const baselineLabel = baselineSource === 'game_start'
      ? 'Game Start'
      : (baselineSource ? factsById.get(baselineSource)?.puzzle?.name || null : null)
    const timeOnPuzzle = solvedTs != null && baselineTs != null ? solvedTs - baselineTs : null

    const negativeNotes = tagged.filter(n => (n.categories || []).some(c => NEGATIVE.has(c)))
    const positiveNotes = tagged.filter(n => (n.categories || []).some(c => POSITIVE.has(c)))
    const hintNotes     = tagged.filter(n => (n.categories || []).some(c => HINT_CATS.has(c)))

    const negativeCount = negativeNotes.length
    const positiveCount = positiveNotes.length
    const hintCount     = hintNotes.length
    const totalNotes    = tagged.length

    // Frustration score: # negatives × (1 + # distinct designers behind those negatives)
    // This penalizes puzzles that frustrate multiple designers.
    const negDesigners = new Set(negativeNotes.map(n => n.designerId)).size
    const frustrationScore = negativeCount * (1 + negDesigners)

    let status
    if (solvedTs != null) status = 'solved'
    else if (totalNotes > 0) status = 'attempted'
    else status = 'untouched'

    return {
      id: p.id,
      name: p.name,
      code: p.code || '',
      benchmark: p.benchmark || '',
      benchmarkName: p.benchmarkName || '',
      dependsOn,
      status,
      isSue,
      firstTouchTs,
      baselineTs,
      baselineSource,
      baselineLabel,
      solvedTs,
      timeOnPuzzle,
      negativeCount,
      positiveCount,
      hintCount,
      totalNotes,
      frustrationScore,
      relatedNotes: tagged
    }
  })
}

/**
 * Bucket negative-category notes into per-minute bins so the UI can render
 * a small histogram of "where did frustration spike?".
 *
 * Returns { binSec, bins: [{ index, startTs, endTs, count, notes }], peakIndex }
 */
export function frustrationDensity(notes, totalSec, binSec = 60) {
  const negNotes = (notes || [])
    .filter(n => n.kind !== 'feedback' && (n.categories || []).some(c => NEGATIVE.has(c)))
    .sort((a, b) => a.timestamp - b.timestamp)

  const span = Math.max(totalSec || 0, ...negNotes.map(n => n.timestamp), binSec)
  const binCount = Math.max(1, Math.ceil(span / binSec))
  const bins = Array.from({ length: binCount }, (_, i) => ({
    index: i,
    startTs: i * binSec,
    endTs: (i + 1) * binSec,
    count: 0,
    notes: []
  }))
  for (const n of negNotes) {
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor((n.timestamp || 0) / binSec)))
    bins[idx].count++
    bins[idx].notes.push(n)
  }
  let peakIndex = -1
  let peak = 0
  for (const b of bins) if (b.count > peak) { peak = b.count; peakIndex = b.index }
  return { binSec, bins, peakIndex, peakCount: peak }
}

/**
 * "Stuck zones" — runs of negative notes that pile up without a positive
 * resolution in between. Useful for spotting where players were spinning.
 *
 * Returns groups sorted by descending duration × note count.
 */
export function findStuckZones(notes, { gapSec = 90, minNotes = 2 } = {}) {
  const live = (notes || []).filter(n => n.kind !== 'feedback')
  const sorted = [...live].sort((a, b) => a.timestamp - b.timestamp)
  if (!sorted.length) return []

  const isNeg = (n) => (n.categories || []).some(c => NEGATIVE.has(c))
  const isPos = (n) => (n.categories || []).some(c => POSITIVE.has(c))

  const zones = []
  let bucket = []

  const flush = () => {
    if (bucket.length >= minNotes) {
      const start = bucket[0].timestamp
      const end = bucket[bucket.length - 1].timestamp
      zones.push({
        notes: bucket,
        startTs: start,
        endTs: end,
        duration: end - start,
        designerIds: [...new Set(bucket.map(n => n.designerId))]
      })
    }
    bucket = []
  }

  for (const n of sorted) {
    if (isPos(n)) { flush(); continue }
    if (!isNeg(n)) continue
    if (!bucket.length) { bucket.push(n); continue }
    const last = bucket[bucket.length - 1]
    if (n.timestamp - last.timestamp <= gapSec) bucket.push(n)
    else { flush(); bucket = [n] }
  }
  flush()

  return zones.sort((a, b) =>
    (b.duration * b.notes.length) - (a.duration * a.notes.length)
  )
}

/**
 * Single-session top-line metrics for the redesigned Summary tab.
 */
export function sessionMetrics(notes, game, totalSec) {
  const live = (notes || []).filter(n => n.kind !== 'feedback')
  const puzzleStats = analyzePuzzles(live, game)
  const solved = puzzleStats.filter(p => p.status === 'solved')
  const attempted = puzzleStats.filter(p => p.status !== 'untouched')
  const negCount = live.filter(n => (n.categories || []).some(c => NEGATIVE.has(c))).length
  const posCount = live.filter(n => (n.categories || []).some(c => POSITIVE.has(c))).length
  const hintCount = live.filter(n => (n.categories || []).some(c => HINT_CATS.has(c))).length

  const hardest = [...puzzleStats]
    .filter(p => p.frustrationScore > 0)
    .sort((a, b) => b.frustrationScore - a.frustrationScore)[0] || null

  const fastestSolve = [...solved]
    .filter(p => p.timeOnPuzzle != null && p.timeOnPuzzle >= 0)
    .sort((a, b) => a.timeOnPuzzle - b.timeOnPuzzle)[0] || null

  const slowestSolve = [...solved]
    .filter(p => p.timeOnPuzzle != null && p.timeOnPuzzle >= 0)
    .sort((a, b) => b.timeOnPuzzle - a.timeOnPuzzle)[0] || null

  const totalPuzzles = puzzleStats.length
  return {
    puzzleStats,
    solved,
    attempted,
    totalPuzzles,
    solveRate: totalPuzzles ? solved.length / totalPuzzles : 0,
    negCount,
    posCount,
    hintCount,
    totalNotes: live.length,
    hardest,
    fastestSolve,
    slowestSolve,
    durationSec: totalSec || 0
  }
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
  let wins = 0
  let losses = 0
  // 60-minute demo target. Mirrors DEMO_TARGET_SEC in store.jsx; pulled inline
  // here so synthesis stays React-free and importable from the server.
  const DEMO_LIMIT_SEC = 60 * 60
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
    // Tally outcomes for ended demos: under 60 min is a win, otherwise a loss.
    // In-progress demos aren't counted in either bucket.
    if (sess.ended) {
      if ((sess.timerElapsed || 0) < DEMO_LIMIT_SEC) wins++
      else losses++
    }

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
    componentStats,
    wins,
    losses
  }
}

/**
 * Cross-session puzzle solve-time stats for one game.
 *
 * Per-puzzle aggregates `timeOnPuzzle` (solvedTs − firstTouchTs) across every
 * session where that puzzle was solved. Returns:
 *   {
 *     perPuzzle: [{ id, name, code, solveCount, avgSolveTime, fastestSolve, slowestSolve, demosSolved }],
 *     overallAvg:    avg solve time across all puzzle solves
 *     overallCount:  total number of solve events
 *     avgGapBetween: avg seconds between consecutive solves within a session
 *     longestAvg:    perPuzzle entry with the highest avgSolveTime (≥2 solves preferred, else any)
 *     shortestAvg:   perPuzzle entry with the lowest avgSolveTime
 *   }
 *
 * Notes that lack a `firstTouchTs` (puzzles solved without ever being mentioned
 * earlier) contribute solve count + 0-duration to averages — those would be
 * misleading, so we exclude time-of-zero from the time aggregates.
 */
export function aggregatePuzzleSolveTimes(sessions, game) {
  if (!game) return emptySolveTimes()
  const relevant = sessions.filter(s => s.gameId === game.id)
  if (!relevant.length || !(game.puzzles || []).length) return emptySolveTimes()

  // Per-puzzle solve-time samples.
  const samples = {}
  for (const p of game.puzzles) {
    samples[p.id] = {
      id: p.id,
      name: p.name,
      code: p.code || '',
      benchmark: p.benchmark || '',
      benchmarkName: p.benchmarkName || '',
      goalMinutes: typeof p.goalMinutes === 'number' && !isNaN(p.goalMinutes) ? p.goalMinutes : null,
      times: [],
      solvedTimestamps: [],
      demosSolved: new Set(),
      // Every recorded solve (including SUE) so the UI can list them under
      // each puzzle row. SUE solves are flagged so they can be visually
      // marked but still excluded from averages.
      solves: []
    }
  }

  let allSolveDurations = []
  let allGaps = []

  for (const sess of relevant) {
    const stats = analyzePuzzles(sess.notes, game)
    const allSolves = stats
      .filter(p => p.solvedTs != null)
      .sort((a, b) => a.solvedTs - b.solvedTs)
    // SUE-tagged solves are deliberately excluded from cross-session averages
    // (the user can mark unusual runs to keep trend math clean) but the per-
    // demo timeline in Review still shows them.
    const regularSolves = allSolves.filter(p => !p.isSue)

    // Track every solve for the per-puzzle drill-down list.
    for (const p of allSolves) {
      if (samples[p.id]) {
        samples[p.id].solves.push({
          sessionId: sess.id,
          sessionDate: sess.date || '',
          sessionTime: sess.time || '',
          solvedTs: p.solvedTs,
          timeOnPuzzle: p.timeOnPuzzle,
          isSue: p.isSue
        })
      }
    }
    for (const p of regularSolves) {
      if (samples[p.id]) {
        samples[p.id].demosSolved.add(sess.id)
        samples[p.id].solvedTimestamps.push(p.solvedTs)
        if (p.timeOnPuzzle != null && p.timeOnPuzzle > 0) {
          samples[p.id].times.push(p.timeOnPuzzle)
          allSolveDurations.push(p.timeOnPuzzle)
        }
      }
    }
    for (let i = 1; i < regularSolves.length; i++) {
      const gap = regularSolves[i].solvedTs - regularSolves[i - 1].solvedTs
      if (gap >= 0) allGaps.push(gap)
    }
  }

  const perPuzzle = Object.values(samples).map(s => {
    const count = s.times.length
    const avg = count ? Math.round(s.times.reduce((a, b) => a + b, 0) / count) : null
    const tsCount = s.solvedTimestamps.length
    const avgSolvedTs = tsCount
      ? Math.round(s.solvedTimestamps.reduce((a, b) => a + b, 0) / tsCount)
      : null
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      benchmark: s.benchmark,
      benchmarkName: s.benchmarkName,
      goalMinutes: s.goalMinutes,
      solveCount: count,
      solvedDemoCount: tsCount,
      avgSolveTime: avg,
      avgSolvedTs,
      fastestSolve: count ? Math.min(...s.times) : null,
      slowestSolve: count ? Math.max(...s.times) : null,
      demosSolved: s.demosSolved.size,
      // All solves (including SUE), newest-first sorted by date+time so the
      // drill-down list reads chronologically without extra UI work.
      solves: [...s.solves].sort((a, b) => {
        const d = (b.sessionDate || '').localeCompare(a.sessionDate || '')
        return d !== 0 ? d : (b.sessionTime || '').localeCompare(a.sessionTime || '')
      })
    }
  })

  const withTimes = perPuzzle.filter(p => p.avgSolveTime != null)
  const longestAvg  = withTimes.length ? withTimes.reduce((a, b) => a.avgSolveTime >= b.avgSolveTime ? a : b) : null
  const shortestAvg = withTimes.length ? withTimes.reduce((a, b) => a.avgSolveTime <= b.avgSolveTime ? a : b) : null
  const overallAvg = allSolveDurations.length
    ? Math.round(allSolveDurations.reduce((a, b) => a + b, 0) / allSolveDurations.length)
    : null
  const avgGapBetween = allGaps.length
    ? Math.round(allGaps.reduce((a, b) => a + b, 0) / allGaps.length)
    : null

  return {
    perPuzzle,
    overallAvg,
    overallCount: allSolveDurations.length,
    totalSolveEvents: perPuzzle.reduce((sum, p) => sum + p.solveCount, 0),
    avgGapBetween,
    longestAvg,
    shortestAvg
  }
}

function emptySolveTimes() {
  return {
    perPuzzle: [],
    overallAvg: null,
    overallCount: 0,
    totalSolveEvents: 0,
    avgGapBetween: null,
    longestAvg: null,
    shortestAvg: null
  }
}
