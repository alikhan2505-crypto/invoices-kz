'use client'
import { useState } from 'react'

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

export default function TriggerChipsEditor({ words, onChange }: { words: string[]; onChange: (words: string[]) => void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (!words.some(w => w.toLowerCase() === trimmed.toLowerCase())) onChange([...words, trimmed])
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
      <input value={draft} maxLength={80}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder="Триггер — Enter, чтобы добавить (например: цена)"
        className={INPUT_CLS}
        style={{ color: 'var(--nav-text-primary)' }} />
    </div>
  )
}
