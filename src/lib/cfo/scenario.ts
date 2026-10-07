// «Что если»: тот же платёжный календарь, но плановые поступления и выплаты
// масштабируются, плюс разовый платёж. В базу ничего не пишется — только расчёт.
import type { Workspace } from './data'
import { buildCalendar, CALENDAR_HORIZON_DAYS, type Calendar } from './calendar'
import { addDays, firstDay, monthKey } from './dates'
import { forecastOperations } from './invoiceLink'
import type { CfoOperation, CfoRecurrence } from './types'

export type Scenario = {
  incomePct: number // -100..+100: насколько изменятся плановые поступления
  expensePct: number // -100..+100: насколько изменятся плановые выплаты
  extra: { amount: number; date: string; direction: 'in' | 'out' } | null // разовый платёж, тиыны
}

export const NO_CHANGE: Scenario = { incomePct: 0, expensePct: 0, extra: null }

const scale = (amount: number, pct: number) => Math.max(0, Math.round((amount * (100 + pct)) / 100))
function scaled<T extends Pick<CfoOperation, 'direction' | 'amount'>>(x: T, s: Scenario): T {
  if (x.direction === 'in') return { ...x, amount: scale(x.amount, s.incomePct) }
  if (x.direction === 'out') return { ...x, amount: scale(x.amount, s.expensePct) }
  return x
}

export type ScenarioResult = { calendar: Calendar; minBalance: number; minDate: string; endBalance: number }

export function runScenario(ws: Workspace, today: string, s: Scenario): ScenarioResult {
  const ops: CfoOperation[] = forecastOperations(ws, today).map((o) => (o.status === 'planned' ? scaled(o, s) : o))
  if (s.extra && s.extra.amount > 0) {
    const accountId = ws.accounts.find((a) => !a.archived)?.id ?? ''
    ops.push({
      id: 'scenario:extra', direction: s.extra.direction, amount: s.extra.amount, accountId, toAccountId: null, articleId: null,
      counterparty: null, comment: 'Сценарий', paidOn: s.extra.date, accruedOn: s.extra.date, status: 'planned', recurrenceId: null, recurrenceDate: null,
    })
  }
  const recurrences: CfoRecurrence[] = ws.recurrences.map((r) => scaled(r, s))
  const calendar = buildCalendar({ accounts: ws.accounts, operations: ops, recurrences, today, from: firstDay(monthKey(today)), to: addDays(today, CALENDAR_HORIZON_DAYS - 1) })
  const future = calendar.days.filter((d) => d.date >= today)
  const min = future.reduce((m, d) => (d.balance < m.balance ? d : m), future[0])
  return { calendar, minBalance: min?.balance ?? 0, minDate: min?.date ?? today, endBalance: future[future.length - 1]?.balance ?? 0 }
}
