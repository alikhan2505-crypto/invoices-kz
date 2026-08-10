// Plain case-insensitive substring matching against each template's trigger
// words/phrases — a trigger phrase must appear as a contiguous substring of
// the incoming text (no word-scatter matching: the words must appear
// together, in order, not just anywhere in the message) — first template in
// list order wins on a tie. This is a deliberate conservative choice: a
// missed match falls through safely to the AI-draft-then-approve path, but a
// *false* match auto-sends with no human review, so precision is prioritized
// over recall here.
export function findMatchingTemplate(
  incomingText: string,
  templates: { id: string; trigger_words: string[]; reply_text: string }[]
): { id: string; reply_text: string } | null {
  const normalized = incomingText.toLowerCase()
  for (const template of templates) {
    const hasMatch = template.trigger_words.some(triggerPhrase =>
      normalized.includes(triggerPhrase.toLowerCase())
    )
    if (hasMatch) {
      return { id: template.id, reply_text: template.reply_text }
    }
  }
  return null
}
