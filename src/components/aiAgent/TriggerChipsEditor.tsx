'use client'
import { useState } from 'react'
import { mergeTriggerWords, splitAtLastSeparator, TRIGGER_SEPARATORS } from '@/lib/aiAgent/triggerWords'

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

// A comma is what a person reaches for when listing words, and pasting a
// ready-made list is the other natural move. Neither used to do anything: only
// Enter committed a chip. So "price, how much" either sat uncommitted -- with
// the Save button disabled and no explanation, because the parent counts chips,
// not typed text -- or, if Enter came afterwards, stored the comma inside the
// word. A trigger of "price," never matches a comment containing "price", and
// that cost a live debugging round on 2026-09-07.
//
// Parsing lives in src/lib/aiAgent/triggerWords.ts so it can be tested.
export default function TriggerChipsEditor({
  words,
  onChange,
  placeholder = 'Триггер — запятая или Enter (например: цена, стоимость)',
}: {
  words: string[]
  onChange: (words: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const next = mergeTriggerWords(words, raw)
    if (next !== words) onChange(next)
  }

  function handleChange(value: string) {
    if (!TRIGGER_SEPARATORS.test(value)) {
      setDraft(value)
      return
    }
    const { committed, remainder } = splitAtLastSeparator(value)
    commit(committed)
    setDraft(remainder)
  }

  function commitDraft() {
    if (!draft.trim()) return
    commit(draft)
    setDraft('')
  }

  return (
    <div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {words.map(w => (
            <button key={w} type="button" onClick={() => onChange(words.filter(x => x !== w))}
              className="text-xs pl-2.5 pr-2 py-1 rounded-full flex items-center gap-1.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {w}
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}
      <input value={draft} maxLength={200}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === 'Tab') && draft.trim()) {
            e.preventDefault()
            commitDraft()
          }
        }}
        // Commits a word that was typed and then clicked away from, rather than
        // dropping it. Without this the Save button stays disabled while the
        // word is visibly sitting in the field, which reads as a broken form.
        onBlur={commitDraft}
        placeholder={placeholder}
        className={INPUT_CLS}
        style={{ color: 'var(--nav-text-primary)' }} />
    </div>
  )
}
