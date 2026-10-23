import { triggerMatches } from './triggerMatch'

// Case-insensitive matching against each template's trigger words/phrases —
// a trigger phrase must appear as a contiguous substring of the incoming text
// (no word-scatter matching: the words must appear together, in order, not
// just anywhere in the message); SHORT triggers (up to 3 chars) match only at
// a word start — the rule lives in triggerMatch.ts, shared with the AI-agent
// matchers (findTemplateMatch, findFlowTriggerMatch) so they cannot drift.
// First template in list order wins on a tie. This is a deliberate
// conservative choice: a missed match falls through safely to the
// AI-draft-then-approve path, but a *false* match auto-sends with no human
// review, so precision is prioritized over recall here.
export function findMatchingTemplate(
  incomingText: string,
  templates: { id: string; trigger_words: string[]; reply_text: string }[]
): { id: string; reply_text: string } | null {
  const normalized = incomingText.toLowerCase()
  for (const template of templates) {
    const hasMatch = template.trigger_words.some(triggerPhrase =>
      triggerMatches(normalized, triggerPhrase)
    )
    if (hasMatch) {
      return { id: template.id, reply_text: template.reply_text }
    }
  }
  return null
}
