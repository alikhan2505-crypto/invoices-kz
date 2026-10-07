'use client'
import { useState } from 'react'
import type { AccountKind } from '@/lib/cfo/types'
import { createAccounts } from '@/lib/cfo/data'
import { parseAmountInput } from '@/lib/cfo/money'
import { isIsoDate, todayIso } from '@/lib/cfo/dates'
import { ACCOUNT_KIND_LABEL } from '@/lib/cfo/labels'
import { useCfo } from './CfoWorkspace'
import { Card, CfoPage, ErrorText, Field, GhostButton, PrimaryButton, inputClass, inputStyle } from './ui'

type Row = { key: number; kind: AccountKind; name: string; balance: string }

// One row per kind of money up front; empty balance = «такого нет», the row is skipped.
const START: Row[] = [
  { key: 1, kind: 'bank', name: 'Расчётный счёт', balance: '' },
  { key: 2, kind: 'card', name: 'Карта', balance: '' },
  { key: 3, kind: 'cash', name: 'Касса', balance: '' },
  { key: 4, kind: 'deposit', name: 'Депозит', balance: '' },
]

export default function FirstAccountWizard() {
  const { ws, reload } = useCfo()
  const [rows, setRows] = useState<Row[]>(START)
  const [date, setDate] = useState(`${todayIso().slice(0, 7)}-01`)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const addRow = () => setRows((rs) => [...rs, { key: Math.max(...rs.map((r) => r.key)) + 1, kind: 'bank', name: '', balance: '' }])
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!isIsoDate(date)) { setError('Укажите дату начала учёта'); return }
    const filled = rows.filter((r) => r.balance.trim() !== '')
    if (filled.length === 0) { setError('Укажите остаток хотя бы по одному счёту — можно 0'); return }
    const list = []
    for (const r of filled) {
      const label = r.name.trim() || ACCOUNT_KIND_LABEL[r.kind]
      if (!r.name.trim()) { setError(`Укажите название для строки «${label}»`); return }
      const amount = parseAmountInput(r.balance, { allowNegative: true })
      if (amount === null) { setError(`«${label}»: остаток — число, например 150000 или 1 250,50`); return }
      list.push({ name: r.name.trim(), kind: r.kind, openingBalance: amount, openingDate: date })
    }
    setSaving(true)
    setError(null)
    try {
      await createAccounts(ws, list)
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    // Счета уже созданы: при сбое перезагрузки повторная отправка дала бы дубли,
    // поэтому просто перезагружаем страницу.
    try {
      await reload()
    } catch {
      window.location.reload()
    }
  }

  return (
    <CfoPage title="Начнём учёт">
      <Card className="max-w-2xl">
        <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
          Укажите, сколько денег сейчас на каждом счёте, карте, в кассе и на депозите — это стартовая точка для движения денег и платёжного календаря.
          Чего нет — оставьте пустым. Остаток может быть отрицательным (овердрафт). Счета можно добавить и поправить потом в настройках.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-3">
            {rows.map((r) => (
              // Phone: name + ✕ on the first line, type + balance on the second; desktop: one line.
              <div key={r.key} className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[160px_1fr_170px_auto] gap-2 items-end pb-3 sm:pb-0" style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                <div className="order-3 sm:order-1">
                  <Field label="Тип">
                    <select className={inputClass} style={inputStyle} value={r.kind} onChange={(e) => patch(r.key, { kind: e.target.value as AccountKind })}>
                      {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="order-1 sm:order-2 col-span-2 sm:col-span-1">
                  <Field label="Название">
                    <input className={inputClass} style={inputStyle} value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder="Например, Kaspi Gold" />
                  </Field>
                </div>
                <div className="order-4 sm:order-3 col-span-2 sm:col-span-1">
                  <Field label="Остаток, ₸">
                    <input className={inputClass} style={inputStyle} inputMode="decimal" value={r.balance} onChange={(e) => patch(r.key, { balance: e.target.value })} placeholder="нет" />
                  </Field>
                </div>
                <div className="order-2 sm:order-4">
                  <GhostButton type="button" aria-label={`Убрать строку «${r.name || ACCOUNT_KIND_LABEL[r.kind]}»`} onClick={() => removeRow(r.key)} disabled={rows.length === 1}>✕</GhostButton>
                </div>
              </div>
            ))}
          </div>
          <GhostButton type="button" onClick={addRow}>+ Ещё счёт</GhostButton>
          <div className="max-w-xs">
            <Field label="Остатки на дату (начало учёта)">
              <input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Начать учёт'}</PrimaryButton>
        </form>
      </Card>
    </CfoPage>
  )
}
