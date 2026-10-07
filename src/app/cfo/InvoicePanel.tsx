'use client'
import { useState } from 'react'
import { postInvoices, setCountInvoices } from '@/lib/cfo/data'
import { dayLabel } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { expectedInflows, expectedOn, overdueReceivables, revenueArticleId, unpostedPaid } from '@/lib/cfo/invoiceLink'
import type { InvoiceLite } from '@/lib/cfo/types'
import { useCfo } from './CfoWorkspace'
import { Card, ErrorText, GhostButton, PrimaryButton, SectionTitle, inputClass, inputStyle } from './ui'

export const invoiceHref = (id: string) => `https://invoices.kz/invoice/${id}`
const SHOW = 5

// Счета invoices.kz в календаре: ожидаемые оплаты в прогнозе, просроченная
// дебиторка и оплаченные счета, которые ещё не проведены приходом.
export default function InvoicePanel({ today }: { today: string }) {
  const { ws, reload } = useCfo()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = ws.accounts.filter((a) => !a.archived)
  const [accountId, setAccountId] = useState((live.find((a) => a.kind === 'bank') ?? live[0])?.id ?? '')

  if (ws.invoices.length === 0) return null
  const expected = expectedInflows(ws, today)
  const overdue = overdueReceivables(ws, today)
  // Оплачен до начала учёта — деньги уже сидят во входящем остатке, второй раз не проводим.
  const opening = ws.accounts.find((a) => a.id === accountId)?.openingDate ?? today
  const toPost = unpostedPaid(ws).filter((i) => !i.paidOn || i.paidOn >= opening)
  const articleId = revenueArticleId(ws)
  const total = (l: { amount: number }[]) => formatTenge(l.reduce((s, x) => s + x.amount, 0))
  // Дата оплаты из журнала счёта, иначе сегодня; не позже сегодняшнего дня.
  const dateFor = (i: InvoiceLite) => {
    const d = i.paidOn ?? today
    return d > today ? today : d
  }

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await reload()
    } catch (e) {
      await reload().catch(() => {})
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('cfo_operations_invoice_once') ? 'Этот счёт уже проведён — обновите страницу' : msg)
    } finally {
      setBusy(false)
    }
  }
  const post = (list: InvoiceLite[]) => run(() => {
    if (!articleId) throw new Error('Нет статьи доходов «Выручка» — верните её из архива в настройках')
    return postInvoices(ws, list.map((invoice) => ({ invoice, accountId, articleId, paidOn: dateFor(invoice) })))
  })

  return (
    <Card>
      <SectionTitle>Счета invoices.kz</SectionTitle>
      <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-primary)' }}>
        <input type="checkbox" className="w-5 h-5" checked={ws.countInvoices} disabled={busy} onChange={(e) => void run(() => setCountInvoices(ws, e.target.checked))} />
        Учитывать неоплаченные счета в прогнозе
        {ws.countInvoices && expected.length > 0 && <span style={{ color: 'var(--nav-text-muted)' }}>· ожидается {expected.length} на {total(expected)}</span>}
      </label>

      {overdue.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>Не оплачены в срок: {overdue.length} на {total(overdue)}</div>
          <p className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>В прогноз не берём, пока клиент не заплатит. Напомните о счёте.</p>
          {overdue.slice(0, SHOW).map((i) => (
            <a key={i.id} href={invoiceHref(i.id)} className="flex items-center justify-between gap-2 min-h-[44px] text-sm" style={{ borderTop: '1px solid var(--nav-border-soft)', color: 'var(--nav-text-primary)' }}>
              <span>№{i.number} · {i.clientName || 'без клиента'} <span style={{ color: 'var(--nav-text-muted)' }}>· срок {dayLabel(expectedOn(i))}</span></span>
              <span className="tabular-nums font-semibold">{formatTenge(i.amount)}</span>
            </a>
          ))}
          {overdue.length > SHOW && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>и ещё {overdue.length - SHOW}</div>}
        </div>
      )}

      {toPost.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>Оплачены, но не проведены в учёте: {toPost.length} на {total(toPost)}</div>
          <div className="flex gap-2 flex-wrap items-center my-2">
            <select aria-label="Счёт для поступлений" className={`${inputClass} max-w-[220px]`} style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {live.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <PrimaryButton type="button" disabled={busy} onClick={() => void post(toPost)}>Провести все</PrimaryButton>
          </div>
          {toPost.slice(0, SHOW).map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 min-h-[44px] text-sm flex-wrap" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
              <a href={invoiceHref(i.id)} style={{ color: 'var(--nav-text-primary)' }}>№{i.number} · {i.clientName || 'без клиента'} <span style={{ color: 'var(--nav-text-muted)' }}>· {dayLabel(dateFor(i))}</span></a>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-semibold">{formatTenge(i.amount)}</span>
                <GhostButton type="button" disabled={busy} aria-label={`Провести счёт №${i.number}`} onClick={() => void post([i])}>Провести</GhostButton>
              </span>
            </div>
          ))}
          {toPost.length > SHOW && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>и ещё {toPost.length - SHOW} — «Провести все» проведёт и их</div>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
