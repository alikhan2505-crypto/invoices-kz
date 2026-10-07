'use client'
import { useState } from 'react'
import { saveOperation, saveRecurrence } from '@/lib/cfo/data'
import { todayIso } from '@/lib/cfo/dates'
import { formatTenge, parseAmountInput, tiynToNumber } from '@/lib/cfo/money'
import { TAX_DUE, TAX_LABEL, alreadyAdded, planTaxes, simplifiedEstimate, taxArticle, type TaxKind } from '@/lib/cfo/taxCalendar'
import { validateOperation, validateRecurrence } from '@/lib/cfo/validate'
import { useCfo } from './CfoWorkspace'
import { Card, ErrorText, Field, GhostButton, PrimaryButton, SectionTitle, inputClass, inputStyle } from './ui'

const KINDS: TaxKind[] = ['payroll', 'self', 'simplified', 'vat']
const AMOUNT_HINT: Record<TaxKind, string> = {
  payroll: 'в месяц, все налоги и взносы с фонда оплаты труда',
  self: 'в месяц: ОПВ, ОПВР, СО, ВОСМС',
  simplified: 'за полугодие',
  vat: 'за квартал',
}

// «Налоги РК» в платёжном календаре: человек отмечает, что платит, и примерно
// сколько, — платежи встают на 25-е числа по Налоговому кодексу 2026.
export default function TaxSetup({ onClose }: { onClose: () => void }) {
  const { ws, reload } = useCfo()
  const today = todayIso()
  const added = alreadyAdded(ws)
  const accounts = ws.accounts.filter((a) => !a.archived)
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === 'bank')?.id ?? accounts[0]?.id ?? '')
  const [amounts, setAmounts] = useState<Record<TaxKind, string>>({ payroll: '', self: '', simplified: '', vat: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const estimate = simplifiedEstimate(ws, today)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    const parsed: Partial<Record<TaxKind, number>> = {}
    for (const k of KINDS) {
      if (added.has(k) || !amounts[k].trim()) continue
      const v = parseAmountInput(amounts[k])
      if (v === null || v <= 0) { setError(`${TAX_LABEL[k]}: сумма — число больше нуля`); return }
      if (!taxArticle(k, ws.articles)) { setError(`${TAX_LABEL[k]}: нет подходящей статьи расходов — верните её из архива в настройках`); return }
      parsed[k] = v
    }
    if (Object.keys(parsed).length === 0) { setError('Укажите сумму хотя бы для одного налога'); return }
    const plan = planTaxes({ amounts: parsed, accountId, articles: ws.articles, today })
    const ctx = { accounts: ws.accounts, articles: ws.articles, today }
    const problem = plan.recurrences.map((r) => validateRecurrence(r, ctx)).find(Boolean) ?? plan.operations.map((o) => validateOperation(o, ctx)).find(Boolean)
    if (problem) { setError(problem); return }
    setSaving(true)
    try {
      for (const r of plan.recurrences) await saveRecurrence(ws, r)
      for (const o of plan.operations) await saveOperation(ws, o)
      await reload()
      onClose()
    } catch (err) {
      // Часть платежей могла записаться — показываем то, что реально в базе.
      await reload().catch(() => {})
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionTitle>Налоги РК в календарь</SectionTitle>
      <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        Отметьте, что вы платите, и примерную сумму — платежи встанут в календарь на 25-е числа по Налоговому кодексу 2026. Суммы потом можно поправить в «Операциях». Точные суммы сверьте с бухгалтером.
      </p>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="max-w-sm">
          <Field label="С какого счёта платите">
            <select className={inputClass} style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        {KINDS.map((k) => (
          <div key={k} className="grid sm:grid-cols-[1fr_220px] gap-2 items-end py-2" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{TAX_LABEL[k]}</div>
              <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{TAX_DUE[k]}</div>
              {k === 'simplified' && estimate > 0 && !added.has(k) && (
                <button type="button" className="text-xs underline min-h-[44px]" style={{ color: 'var(--nav-accent)' }} onClick={() => setAmounts((a) => ({ ...a, simplified: String(tiynToNumber(estimate)) }))}>
                  Подставить ≈ {formatTenge(estimate)} — 4% от дохода с начала полугодия
                </button>
              )}
            </div>
            {added.has(k) ? (
              <div className="text-sm min-h-[44px] flex items-center" style={{ color: 'var(--nav-text-secondary)' }}>уже в календаре</div>
            ) : (
              <Field label={`Сумма, ₸ — ${AMOUNT_HINT[k]}`}>
                <input className={inputClass} style={inputStyle} inputMode="decimal" placeholder="не плачу" value={amounts[k]} onChange={(e) => setAmounts((a) => ({ ...a, [k]: e.target.value }))} />
              </Field>
            )}
          </div>
        ))}
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <GhostButton type="button" onClick={onClose}>Отмена</GhostButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? 'Добавляю…' : 'Добавить в календарь'}</PrimaryButton>
        </div>
      </form>
    </Card>
  )
}
