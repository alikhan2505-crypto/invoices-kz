'use client'
import { useMemo, useRef, useState } from 'react'
import { useAppDialog } from '@/components/AppDialog'
import { buildCalendar, CALENDAR_HORIZON_DAYS } from '@/lib/cfo/calendar'
import { markPaid, reschedule } from '@/lib/cfo/data'
import { addDays, firstDay, monthKey, todayIso } from '@/lib/cfo/dates'
import { accountName, dayLabel, opTitle } from '@/lib/cfo/labels'
import { formatTenge } from '@/lib/cfo/money'
import { isVirtual } from '@/lib/cfo/recurrence'
import type { CfoOperation } from '@/lib/cfo/types'
import { useCfo } from '../CfoWorkspace'
import TaxSetup from '../TaxSetup'
import MoveButton from '../MoveButton'
import ScenarioCard from '../ScenarioCard'
import InvoicePanel, { invoiceHref } from '../InvoicePanel'
import { forecastOperations, invoiceIdOf, isInvoiceVirtual } from '@/lib/cfo/invoiceLink'
import { Badge, Card, CfoPage, GhostButton, Money, SectionTitle } from '../ui'

export default function CfoCalendar() {
  const { ws, reload } = useCfo()
  const { alert, dialogElement } = useAppDialog()
  const today = todayIso()
  const [showAll, setShowAll] = useState(false)
  const [taxes, setTaxes] = useState(false)
  const [whatIf, setWhatIf] = useState(false)
  const cal = useMemo(() => buildCalendar({
    accounts: ws.accounts,
    operations: forecastOperations(ws, today),
    recurrences: ws.recurrences,
    today,
    from: firstDay(monthKey(today)),
    to: addDays(today, CALENDAR_HORIZON_DAYS - 1),
  }), [ws, today])

  const paying = useRef(false)
  async function pay(op: CfoOperation) {
    if (paying.current) return // a double click would insert the same recurrence occurrence twice
    paying.current = true
    try { await markPaid(ws, op, today); await reload() } catch (e) { await alert(e instanceof Error ? e.message : String(e)) } finally { paying.current = false }
  }

  async function move(op: CfoOperation, date: string) {
    const account = ws.accounts.find((a) => a.id === op.accountId)
    if (account && date < account.openingDate) { await alert(`Дата раньше начала учёта по счёту «${account.name}»`); return }
    try { await reschedule(ws, op, date); await reload() } catch (e) { await reload().catch(() => {}); await alert(e instanceof Error ? e.message : String(e)) }
  }

  const item = (op: CfoOperation) => (
    <div key={op.id} className="flex items-center gap-3 py-2 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>{opTitle(op, ws.accounts, ws.articles)}</div>
        <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
          {op.direction === 'transfer' ? 'между своими счетами' : accountName(op.accountId, ws.accounts)}
          {op.counterparty && ` · ${op.counterparty}`}
        </div>
      </div>
      {op.status === 'actual' ? <Badge tone="fact">Факт</Badge> : isInvoiceVirtual(op) ? <Badge tone="plan">Счёт</Badge> : isVirtual(op) ? <Badge tone="plan">Повтор</Badge> : <Badge tone="plan">План</Badge>}
      {op.direction === 'transfer'
        ? <span className="text-sm tabular-nums" style={{ color: 'var(--nav-text-secondary)' }}>{formatTenge(op.amount)}</span>
        : <Money value={op.direction === 'in' ? op.amount : -op.amount} signed className="text-sm font-semibold" />}
      {isInvoiceVirtual(op) && <a href={invoiceHref(invoiceIdOf(op))} className="inline-flex items-center min-h-[44px] rounded-xl px-4 text-sm font-medium" style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-secondary)' }}>Открыть счёт</a>}
      {op.status === 'planned' && !isInvoiceVirtual(op) && <MoveButton op={op} today={today} title={opTitle(op, ws.accounts, ws.articles)} onMove={move} />}
      {op.status === 'planned' && !isInvoiceVirtual(op) && <GhostButton type="button" aria-label={`Оплачено: ${opTitle(op, ws.accounts, ws.articles)}`} onClick={() => void pay(op)}>Оплачено</GhostButton>}
    </div>
  )

  const days = cal.days.filter((d) => showAll || d.items.length > 0 || d.date === today || d.date === cal.firstGap)

  return (
    <CfoPage
      title={ws.mode === 'family' ? 'Платежи' : 'Платёжный календарь'}
      actions={
        <>
          {!whatIf && <GhostButton type="button" onClick={() => setWhatIf(true)}>Что если</GhostButton>}
          {!taxes && ws.mode !== 'family' && <GhostButton type="button" onClick={() => setTaxes(true)}>Налоги РК</GhostButton>}
          <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Все дни
          </label>
        </>
      }
    >
      {whatIf && <ScenarioCard today={today} onClose={() => setWhatIf(false)} />}
      {taxes && <TaxSetup onClose={() => setTaxes(false)} />}
      <InvoicePanel today={today} />
      {cal.firstGap && (
        <Card className="!py-3">
          <p className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>
            Кассовый разрыв {dayLabel(cal.firstGap)}: по плану денег на счетах не хватит. Перенесите платежи или ускорьте поступления.
          </p>
        </Card>
      )}

      {cal.overdue.length > 0 && (
        <Card>
          <SectionTitle>Просрочено — ещё не оплачено</SectionTitle>
          {cal.overdue.map((op) => (
            <div key={op.id}>
              <div className="text-xs pt-2" style={{ color: 'var(--nav-critical)' }}>{dayLabel(op.paidOn)}</div>
              {item(op)}
            </div>
          ))}
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        {days.map((d) => (
          <div key={d.date} className="px-4 py-3" style={{ borderBottom: '1px solid var(--nav-border-soft)', background: d.date === today ? 'var(--nav-accent-soft)' : undefined }}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                {dayLabel(d.date)}{d.date === today && ' · сегодня'}
              </div>
              <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                {d.date >= today ? 'прогноз остатка' : 'остаток'}{' '}
                <span className="tabular-nums font-semibold" style={{ color: d.gap ? 'var(--nav-critical)' : 'var(--nav-text-primary)' }}>{formatTenge(d.balance)}</span>
              </div>
            </div>
            {d.items.length === 0
              ? <p className="text-xs pt-1" style={{ color: 'var(--nav-text-muted)' }}>Платежей нет</p>
              : d.items.map(item)}
          </div>
        ))}
      </Card>
      {dialogElement}
    </CfoPage>
  )
}
