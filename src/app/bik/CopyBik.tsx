'use client'

import { useState } from 'react'

// A tiny copy-to-clipboard button for the БИК on a bank page. The clipboard
// can be unavailable (insecure context, blocked permission), so every call is
// wrapped: the page reads fine without the button working.
export default function CopyBik({ value, label, doneLabel }: { value: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      window.setTimeout(() => setDone(false), 1800)
    } catch {
      // Nothing to do: the code is on the screen and can be selected by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs font-semibold rounded-full px-3 py-1.5 ml-3 align-middle"
      style={{
        color: 'var(--nav-text-secondary)',
        background: 'var(--nav-surface-glass)',
        border: '1px solid var(--nav-border)',
      }}
    >
      {done ? doneLabel : label}
    </button>
  )
}
