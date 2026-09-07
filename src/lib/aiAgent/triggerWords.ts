// Parsing for the trigger-word chips editor (TriggerChipsEditor.tsx).
//
// Lives here rather than inside the component so it can be tested: a trigger
// that stores one character more than the person meant is invisible in the UI
// and silently stops a template from ever matching. That exact failure --
// a stored trigger of "price," never matching a comment containing "price" --
// cost a live debugging round on 2026-09-07, because the editor only committed
// a chip on Enter and a typed comma became part of the word.

export const TRIGGER_SEPARATORS = /[,;\n]/

/**
 * Splits raw input into trigger words and merges them into `existing`.
 * Separators are comma, semicolon and newline, so both typing and pasting a
 * ready-made list work. Dedupe is case-insensitive and also applies within the
 * incoming batch. Returns `existing` unchanged (same reference) when there is
 * nothing new, so callers can skip a pointless state update.
 */
export function mergeTriggerWords(existing: string[], raw: string): string[] {
  const parts = raw.split(TRIGGER_SEPARATORS).map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return existing
  const next = [...existing]
  for (const p of parts) {
    if (!next.some(w => w.toLowerCase() === p.toLowerCase())) next.push(p)
  }
  return next.length === existing.length ? existing : next
}

/**
 * Splits typed input at the LAST separator: everything before it is ready to
 * become chips, what follows is still being typed and stays in the field.
 */
export function splitAtLastSeparator(value: string): { committed: string; remainder: string } {
  const lastSep = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'), value.lastIndexOf('\n'))
  if (lastSep === -1) return { committed: '', remainder: value }
  return { committed: value.slice(0, lastSep), remainder: value.slice(lastSep + 1).trimStart() }
}
