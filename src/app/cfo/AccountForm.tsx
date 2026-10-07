'use client'
import { useState } from 'react'
import type { AccountKind, CfoAccount, CfoOperation } from '@/lib/cfo/types'
import { parseAmountInput, tiynToNumber } from '@/lib/cfo/money'
import { isIsoDate, todayIso } from '@/lib/cfo/dates'
import { openingDateConflict } from '@/lib/cfo/validate'
import { ACCOUNT_KIND_LABEL } from '@/lib/cfo/labels'
import { ErrorText, Field, GhostButton, PrimaryButton, inputClass, inputStyle } from './ui'

export type AccountInput = { id?: string; name: string; kind: AccountKind; openingBalance: number; openingDate: string }

export default function AccountForm({ initial, operations, submitLabel, onSave, onCancel }: {
  initial?: CfoAccount
  operations: CfoOperation[]
  submitLabel: string
  onSave: (a: AccountInput) => Promise<string | null>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'bank')
  const [balance, setBalance] = useState(initial ? String(tiynToNumber(initial.openingBalance)) : '0')
  const [date, setDate] = useState(initial?.openingDate ?? `${todayIso().slice(0, 7)}-01`)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseAmountInput(balance, { allowNegative: true })
    if (!name.trim()) { setError('Укажите название'); return }
    if (amount === null) { setError('Остаток — число, например 150000 или 1 250,50'); return }
    if (!isIsoDate(date)) { setError('Укажите дату начала учёта'); return }
    if (initial) {
      const conflict = openingDateConflict(initial.id, date, operations)
      if (conflict) { setError(conflict); return }
    }
    setSaving(true)
    setError(null)
    const err = await onSave({ id: initial?.id, name: name.trim(), kind, openingBalance: amount, openingDate: date })
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Название">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Kaspi Gold или Касса" />
      </Field>
      <Field label="Тип">
        <select className={inputClass} style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Остаток, ₸" hint="Может быть отрицательным (овердрафт)">
          <input className={inputClass} style={inputStyle} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        <Field label="На дату (начало учёта)">
          <input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        {onCancel && <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>}
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : submitLabel}</PrimaryButton>
      </div>
    </form>
  )
}
