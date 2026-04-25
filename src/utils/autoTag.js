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

// Build a regex that matches a name as a whole-word phrase, case-insensitively.
// Escapes regex metacharacters in the name so "Puzzle 4" works.
function buildNameRegex(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

/**
 * Return the IDs of every named item ({id, name}) whose name appears in `text`.
 * Used for auto-attaching puzzles + components by their game-specific names.
 */
export function matchNamedItems(text, items) {
  if (!text || !items?.length) return []
  const matched = []
  for (const item of items) {
    const rx = buildNameRegex(item.name)
    if (rx && rx.test(text)) matched.push(item.id)
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
