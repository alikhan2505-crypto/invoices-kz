'use client'
import { useState } from 'react'
import type { AccountKind, CfoAccount, CfoOperation } from '@/lib/cfo/types'
import { parseAmountInput, tiynToNumber } from '@/lib/cfo/money'
import { todayIso } from '@/lib/cfo/dates'
import { openingDateConflict, validateAccount } from '@/lib/cfo/validate'
import { ACCOUNT_KIND_LABEL, SELECTABLE_ACCOUNT_KINDS } from '@/lib/cfo/labels'
import { ErrorText, Field, GhostButton, PrimaryButton, inputClass, inputStyle } from './ui'

export type AccountInput = { id?: string; name: string; kind: AccountKind; openingBalance: number; openingDate: string }

// Отрицательный остаток у обычного счёта — почти всегда кредит, заведённый не тем
// видом: такой «счёт» делает «Деньги сейчас» отрицательными и рисует кассовый
// разрыв каждый день. Предупреждаем прямо под полем, не блокируя — и пока вид
// «Кредит / ипотека» спрятан (LOAN_KIND_ENABLED), просто говорим о последствиях.
export const NEGATIVE_BALANCE_WARNING = SELECTABLE_ACCOUNT_KINDS.includes('loan')
  ? 'Это долг? Создайте счёт вида «Кредит / ипотека» — тогда он не будет уменьшать «Деньги сейчас» и не покажет ложный кассовый разрыв.'
  : 'Это долг (кредит, ипотека)? Отрицательный остаток уменьшит «Деньги сейчас» и будет показывать кассовый разрыв каждый день. Овердрафт — укажите, долг — лучше не заводить как счёт.'

export default function AccountForm({ initial, accounts, operations, submitLabel, onSave, onCancel }: {
  initial?: CfoAccount
  accounts: CfoAccount[]
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

  const parsed = parseAmountInput(balance, { allowNegative: true })
  const negativeWarning = kind !== 'loan' && parsed !== null && parsed < 0
  const kinds = initial && !SELECTABLE_ACCOUNT_KINDS.includes(initial.kind) ? [...SELECTABLE_ACCOUNT_KINDS, initial.kind] : SELECTABLE_ACCOUNT_KINDS

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseAmountInput(balance, { allowNegative: true })
    if (!name.trim()) { setError('Укажите название'); return }
    if (amount === null) { setError('Остаток — число, например 150000 или 1 250,50'); return }
    const draft = { id: initial?.id, name: name.trim(), kind, openingBalance: amount, openingDate: date }
    const problem = validateAccount(draft, accounts)
    if (problem) { setError(problem); return }
    if (initial) {
      const conflict = openingDateConflict(initial.id, date, operations)
      if (conflict) { setError(conflict); return }
    }
    setSaving(true)
    setError(null)
    const err = await onSave(draft)
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Название">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Kaspi Gold или Касса" />
      </Field>
      <Field label="Тип" hint={kind === 'loan' ? 'Долг: остаток со знаком минус. В «Деньги сейчас» не входит, платежи — переводом на этот счёт.' : undefined}>
        <select className={inputClass} style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {kinds.map((k) => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={kind === 'loan' ? 'Остаток долга, ₸ (со знаком минус)' : 'Остаток, ₸'} hint={kind === 'loan' ? 'Например, −12 000 000' : 'Может быть отрицательным (овердрафт)'}>
          <input className={inputClass} style={inputStyle} inputMode="decimal" aria-describedby={negativeWarning ? 'account-negative-warning' : undefined} value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        <Field label="На дату (начало учёта)">
          <input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {negativeWarning && (
        <p id="account-negative-warning" role="status" className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--nav-magenta-soft)', color: 'var(--nav-critical)' }}>
          {NEGATIVE_BALANCE_WARNING}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        {onCancel && <GhostButton type="button" onClick={onCancel}>Отмена</GhostButton>}
        <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : submitLabel}</PrimaryButton>
      </div>
    </form>
  )
}
