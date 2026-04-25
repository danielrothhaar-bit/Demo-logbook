// Map of category → keywords/phrases that should auto-attach the category
// when present in a voice transcript or typed note.
//
// Order matters: more specific phrases first so we don't mis-tag.
// All matching is case-insensitive, word-boundary aware.
const RULES = [
  { tag: 'Game Flow Issue',    patterns: [/\bgame\s+flow\b/, /\bflow\s+issue\b/, /\bpacing\b/, /\bdrag(?:ged|ging)?\b/, /\btoo\s+slow\b/, /\btoo\s+fast\b/] },
  { tag: 'Puzzle Logic Issue', patterns: [/\bpuzzle\s+logic\b/, /\blogic\s+issue\b/, /\bdoesn't?\s+make\s+sense\b/, /\bunclear\s+(?:logic|mapping|connection)\b/, /\billogical\b/] },
  { tag: 'Tech Issue',         patterns: [/\btech(?:nical)?\s+issue\b/, /\bbroken\b/, /\bbug(?:ged)?\b/, /\bnot\s+working\b/, /\bdidn'?t\s+(?:fire|trigger|reset)\b/, /\bglitch\b/, /\bstuck\s+(?:open|closed|on|off)\b/] },
  { tag: 'Wow Moment',         patterns: [/\bwow(?:\s+moment)?\b/, /\bamazing\b/, /\bgasp(?:ed)?\b/, /\bblew\s+(?:them|their|me)\b/, /\bcheered?\b/, /\bapplaud(?:ed)?\b/] },
  { tag: 'Frustration',        patterns: [/\bfrustrat(?:ed|ion|ing)\b/, /\bgave\s+up\b/, /\bstuck\b(?!\s+(?:open|closed|on|off))/, /\bannoyed\b/, /\blost\b/, /\bconfused\b/] },
  { tag: 'Hint',               patterns: [/\bhint(?:ed|ing)?\b/, /\bgm\s+helped\b/, /\bgame\s*master\s+helped\b/] },
  { tag: 'Clue',               patterns: [/\bclue\b/, /\bmissed\s+(?:the\s+)?clue\b/, /\bovers?aw\s+(?:the\s+)?clue\b/, /\bspotted\s+(?:the\s+)?clue\b/] },
  { tag: 'Puzzle Solved',      patterns: [/\bpuzzle\s+solved\b/, /\bsolved\s+it\b/, /\bgot\s+it\b/, /\bcracked\s+(?:it|the)\b/, /\bfigured\s+(?:it\s+)?out\b/] }
  // Feedback Discussion is intentionally NOT auto-tagged — it's a user-driven mode.
]

/**
 * Scan text and return categories whose keyword rules match.
 * @param {string} text
 * @param {string[]} availableCategories - only return tags present in user's category list
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
