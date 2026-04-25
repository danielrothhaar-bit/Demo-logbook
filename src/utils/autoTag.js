// Map of category → keywords/phrases that should auto-attach the category
// when present in a voice transcript or typed note.
//
// Order matters: more specific phrases first so we don't mis-tag.
// All matching is case-insensitive, word-boundary aware.
const RULES = [
  { tag: 'Game Flow Issue',    patterns: [/\bgame\s+flow\b/, /\bflow\s+issue\b/, /\bpacing\b/, /\bdrag(?:ged|ging)?\b/, /\btoo\s+slow\b/, /\btoo\s+fast\b/] },
  { tag: 'Puzzle Logic Issue', patterns: [/\bpuzzle\s+logic\b/, /\blogic\s+issue\b/, /\bdoesn't?\s+make\s+sense\b/, /\bunclear\s+(?:logic|mapping|connection)\b/, /\billogical\b/] },
  { tag: 'Tech Issue',         patterns: [
      /\btech(?:nical)?\s+issue\b/, /\bbroken\b/, /\bbug(?:ged)?\b/,
      /\bnot\s+working\b/, /\bdidn'?t\s+(?:fire|trigger|reset)\b/, /\bglitch\b/,
      /\bstuck\s+(?:open|closed|on|off)\b/,
      // Override / overrode / overridden / overriding — usually a manual prop reset by GM
      /\boverr(?:ode|ide(?:n|d|s)?|iding)\b/
  ]},
  { tag: 'Wow Moment',         patterns: [/\bwow(?:\s+moment)?\b/, /\bamazing\b/, /\bgasp(?:ed)?\b/, /\bblew\s+(?:them|their|me)\b/, /\bcheered?\b/, /\bapplaud(?:ed)?\b/] },
  { tag: 'Frustration',        patterns: [/\bfrustrat(?:ed|ion|ing)\b/, /\bgave\s+up\b/, /\bstuck\b(?!\s+(?:open|closed|on|off))/, /\bannoyed\b/, /\blost\b/, /\bconfused\b/] },
  { tag: 'Hint',               patterns: [/\bhint(?:ed|ing)?\b/, /\bgm\s+helped\b/, /\bgame\s*master\s+helped\b/] },
  { tag: 'Clue',               patterns: [/\bclue\b/, /\bmissed\s+(?:the\s+)?clue\b/, /\bovers?aw\s+(?:the\s+)?clue\b/, /\bspotted\s+(?:the\s+)?clue\b/] },
  { tag: 'Puzzle Solved',      patterns: [/\bpuzzle\s+solved\b/, /\bsolved\s+it\b/, /\bgot\s+it\b/, /\bcracked\s+(?:it|the)\b/, /\bfigured\s+(?:it\s+)?out\b/] }
  // Feedback Discussion is intentionally NOT auto-tagged — it's a user-driven mode.
]

/**
 * Scan text and return categories whose keyword rules match.
 */
export function autoTagsFromText(text, availableCategories) {
  if (!text) return []
  const lc = text.toLowerCase()
  const allow = new Set(availableCategories || [])
  const found = new Set()
  for (const rule of RULES) {
    if (allow.size && !allow.has(rule.tag)) continue
    if (rule.patterns.some(rx => rx.test(lc))) found.add(rule.tag)
  }
  return [...found]
}

// ---------------------------------------------------------------------------
// Smart name matching for puzzles + components
//
// Goals (driven by the way designers actually talk during a demo):
//   • "puzzle one" should match "Puzzle 1" (number-word equivalence)
//   • "fourth puzzle" / "p4" should also match "Puzzle 4"
//   • "panel" alone should match "Symbol Panel" if no other item shares the word
//   • plurals ("panels", "locks") should still match
//   • generic words like "puzzle" / "the" should NOT match on their own
//   • bare digits should NOT match on their own (would over-match team sizes etc.)
// ---------------------------------------------------------------------------

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
  // Ordinals
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12
}

// Words that are too generic to act as a single-token identifier on their own.
// They're fine as part of a longer phrase ("puzzle 4") — the full-name match
// catches that. They just can't trigger by themselves.
const GENERIC_TOKENS = new Set([
  'puzzle', 'puzzles', 'component', 'components', 'prop', 'props',
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at',
  'final', 'main', 'last', 'first', 'next', 'big', 'small'
])

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Normalize text for matching: lowercase, fold ordinals + number words to
// digits, collapse whitespace, and accept "p4" / "p 4" as the same token.
function normalize(text) {
  let out = String(text || '').toLowerCase()
  // 1st / 2nd / 3rd / 4th → 1 / 2 / 3 / 4
  out = out.replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
  // Number words → digits (whole-word)
  for (const [w, n] of Object.entries(NUMBER_WORDS)) {
    out = out.replace(new RegExp(`\\b${w}\\b`, 'g'), String(n))
  }
  // Collapse "p 4" → "p4" (single letter glued to a number) so codes work
  // whether the user typed them with or without a space
  out = out.replace(/\b([a-z])\s+(\d+)\b/g, '$1$2')
  // Squeeze whitespace
  return out.replace(/\s+/g, ' ').trim()
}

function tokenize(normalizedName) {
  return normalizedName.split(/[^a-z0-9]+/).filter(Boolean)
}

// Build a regex that matches a phrase as whole words. Allows trailing "s" on
// the last token so "panels" still matches "panel".
function buildPhraseRegex(phrase) {
  const tokens = phrase.split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  const parts = tokens.map((t, i) => {
    const base = escRx(t)
    // Pluralize the last token only, and only when it's a letter-ending word
    return i === tokens.length - 1 && /[a-z]$/.test(t) ? `${base}s?` : base
  })
  return new RegExp(`\\b${parts.join('\\s+')}\\b`, 'i')
}

// Auto-derive a code-style alias from a "Word(s) <number>" name.
// "Puzzle 4" → "p4", "Centrifuge Puzzle" → null (no trailing number).
function autoCodeFromName(normalizedName) {
  const m = normalizedName.match(/^([a-z])[a-z0-9]*(?:\s+[a-z0-9]+)*\s+(\d+)$/)
  return m ? m[1] + m[2] : null
}

/**
 * Build the set of regex patterns that should match an item, given its
 * siblings (so we know which tokens are distinctive enough to stand alone).
 *
 * Exported for tests / debugging.
 */
export function buildMatchPatterns(item, siblings = []) {
  const patterns = []
  const seen = new Set()
  const add = (rx) => {
    if (!rx) return
    const key = rx.source + rx.flags
    if (seen.has(key)) return
    seen.add(key)
    patterns.push(rx)
  }

  const nameNorm = normalize(item.name || '')
  if (!nameNorm) return patterns

  // 1. Full name (literal, in original token order)
  add(buildPhraseRegex(nameNorm))

  // 2. Reversed token order — so "fourth puzzle" hits "Puzzle 4"
  const tokens = tokenize(nameNorm)
  if (tokens.length > 1) {
    add(buildPhraseRegex(tokens.slice().reverse().join(' ')))
  }

  // 3. Explicit code field
  const code = (item.code || '').trim().toLowerCase()
  if (code) add(new RegExp(`\\b${escRx(code)}\\b`, 'i'))

  // 4. Auto-derived code, e.g. "Puzzle 4" → "p4"
  const auto = autoCodeFromName(nameNorm)
  if (auto) add(new RegExp(`\\b${escRx(auto)}\\b`, 'i'))

  // 5. Distinctive single tokens — a token is distinctive if it appears in
  //    *this* item's name and no sibling's. We also require that the token
  //    is not generic, not a bare number, and at least 3 chars long (a
  //    2-letter token like "lab" is OK, so 3 is the floor).
  const tokenCounts = new Map()
  for (const it of siblings) {
    const tks = new Set(tokenize(normalize(it.name || '')))
    for (const t of tks) tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1)
  }
  for (const t of new Set(tokens)) {
    if (GENERIC_TOKENS.has(t)) continue
    if (/^\d+$/.test(t)) continue
    if (t.length < 3) continue
    if ((tokenCounts.get(t) || 0) <= 1) {
      add(buildPhraseRegex(t))
    }
  }

  return patterns
}

/**
 * Return the IDs of every named item ({id, name, code?}) whose patterns
 * appear in `text`. Used for auto-attaching puzzles + components to a note.
 *
 * `items` is treated as the full sibling set: distinctive-token detection
 * runs across the whole list, so passing `game.puzzles` and `game.components`
 * separately keeps the two namespaces independent (a puzzle's distinctive
 * word can still match even if a component shares it).
 */
export function matchNamedItems(text, items) {
  if (!text || !items?.length) return []
  const norm = normalize(text)
  const matched = []
  for (const item of items) {
    const patterns = buildMatchPatterns(item, items)
    if (patterns.some(rx => rx.test(norm))) matched.push(item.id)
  }
  return matched
}

/**
 * Convenience: run all detection passes for a note belonging to a specific game.
 * Returns { categories, puzzleIds, componentIds }.
 */
export function analyzeNoteText(text, { categories = [], game = null } = {}) {
  return {
    categories: autoTagsFromText(text, categories),
    puzzleIds:    matchNamedItems(text, game?.puzzles),
    componentIds: matchNamedItems(text, game?.components)
  }
}
