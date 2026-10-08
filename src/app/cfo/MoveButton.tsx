'use client'
import { useState } from 'react'
import type { CfoOperation } from '@/lib/cfo/types'
import { GhostButton, PrimaryButton, inputClass, inputStyle } from './ui'

// «Перенести» в календаре: дата прямо в строке, без отдельной формы.
export default function MoveButton({ op, today, title, onMove }: { op: CfoOperation; today: string; title: string; onMove: (op: CfoOperation, date: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(op.paidOn < today ? today : op.paidOn)
  const [busy, setBusy] = useState(false)
  if (!open) return <GhostButton type="button" aria-label={`Перенести: ${title}`} onClick={() => setOpen(true)}>Перенести</GhostButton>
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <input type="date" aria-label={`Новая дата: ${title}`} className={`${inputClass} !w-auto`} style={inputStyle} min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      <PrimaryButton type="button" disabled={busy || !date || date < today || date === op.paidOn} onClick={async () => { setBusy(true); try { await onMove(op, date); setOpen(false) } finally { setBusy(false) } }}>OK</PrimaryButton>
      <GhostButton type="button" onClick={() => setOpen(false)}>×</GhostButton>
    </span>
  )
}
