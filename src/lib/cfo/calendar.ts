// Факт до сегодня + плановые операции и повторы вперёд, прогноз суммарного
// остатка на конец каждого дня. Просроченное (план в прошлом, не оплачено)
// всё ещё ожидается, поэтому ложится на сегодня.
import type { CfoAccount, CfoOperation, CfoRecurrence } from './types'
import { addDays } from './dates'
import { totalBalanceAt, totalDelta } from './balances'
import { expandRecurrences } from './recurrence'

export const CALENDAR_HORIZON_DAYS = 90
const OVERDUE_LOOKBACK_DAYS = 90

export type CalendarDay = { date: string; items: CfoOperation[]; inflow: number; outflow: number; balance: number; gap: boolean }
export type Calendar = { days: CalendarDay[]; overdue: CfoOperation[]; firstGap: string | null }

export function buildCalendar(input: {
  accounts: CfoAccount[]
  operations: CfoOperation[]
  recurrences: CfoRecurrence[]
  today: string
  from: string
  to: string
}): Calendar {
  const { accounts, operations, recurrences, today, from, to } = input
  const actual = operations.filter((o) => o.status === 'actual')
  const planned = operations.filter((o) => o.status === 'planned')

  const overdue = [
    ...planned.filter((o) => o.paidOn < today),
    ...expandRecurrences(recurrences, operations, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, -1)),
  ].sort((a, b) => a.paidOn.localeCompare(b.paidOn))
  const overdueNet = overdue.reduce((s, o) => s + totalDelta(o), 0)

  const upcoming = [
    ...planned.filter((o) => o.paidOn >= today && o.paidOn <= to),
    ...expandRecurrences(recurrences, operations, today, to),
  ]

  const days: CalendarDay[] = []
  let firstGap: string | null = null
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const items = [
      ...actual.filter((o) => o.paidOn === d),
      ...(d >= today ? upcoming.filter((o) => o.paidOn === d) : []),
    ]
    let balance = totalBalanceAt(accounts, actual, d)
    if (d >= today) {
      balance += overdueNet + upcoming.filter((o) => o.paidOn <= d).reduce((s, o) => s + totalDelta(o), 0)
    }
    const inflow = items.filter((o) => o.direction === 'in').reduce((s, o) => s + o.amount, 0)
    const outflow = items.filter((o) => o.direction === 'out').reduce((s, o) => s + o.amount, 0)
    const gap = d >= today && balance < 0
    if (gap && !firstGap) firstGap = d
    days.push({ date: d, items, inflow, outflow, balance, gap })
  }
  return { days, overdue, firstGap }
}
