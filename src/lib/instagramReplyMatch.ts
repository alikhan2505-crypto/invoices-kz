// Plain case-insensitive substring matching against each template's trigger
// words/phrases — first template in list order wins on a tie. Deliberately
// simple (no stemming, no fuzzy matching): the spec's own tradeoff is
// "predictable but may miss unusual phrasing," with unmatched messages
// falling through to the AI-draft path instead of a bad auto-send.
export function findMatchingTemplate(
  incomingText: string,
  templates: { id: string; trigger_words: string[]; reply_text: string }[]
): { id: string; reply_text: string } | null {
  const normalized = incomingText.toLowerCase()
  for (const template of templates) {
    const hasMatch = template.trigger_words.some(triggerPhrase => {
      const words = triggerPhrase.toLowerCase().split(/\s+/)
      return words.every(word => normalized.includes(word))
    })
    if (hasMatch) {
      return { id: template.id, reply_text: template.reply_text }
    }
  }
  return null
}
