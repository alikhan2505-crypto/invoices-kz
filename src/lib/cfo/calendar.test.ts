import { describe, it, expect } from 'vitest'
import { buildCalendar } from './calendar'
import type { CfoAccount, CfoOperation, CfoRecurrence } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 10_000_000, openingDate: '2026-01-01', archived: false, sort: 1 }
const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: 'a', counterparty: null, comment: null, paidOn: '2026-01-01', accruedOn: '2026-01-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const operations: CfoOperation[] = [
  op({ id: 'actual', amount: 2_000_000, paidOn: '2026-02-05' }),
  op({ id: 'overdue', amount: 5_000_000, paidOn: '2026-02-03', status: 'planned' }),
  op({ id: 'income', direction: 'in', amount: 3_000_000, paidOn: '2026-02-15', status: 'planned' }),
  op({ id: 'big', amount: 6_000_000, paidOn: '2026-02-20', status: 'planned' }),
]
const recurrences: CfoRecurrence[] = [
  { id: 'r1', direction: 'out', amount: 1_000_000, accountId: 'kaspi', toAccountId: null, articleId: 'a', counterparty: null, comment: null, dayOfMonth: 25, startsOn: '2026-01-01', endsOn: null },
]

const cal = buildCalendar({ accounts: [kaspi], operations, recurrences, today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
const day = (d: string) => cal.days.find((x) => x.date === d)!

describe('buildCalendar', () => {
  it('lists overdue planned payments and missed recurrences', () => {
    expect(cal.overdue.map((o) => o.paidOn)).toEqual(['2026-01-25', '2026-02-03'])
  })

  it('past days show only what actually happened', () => {
    expect(day('2026-02-05').balance).toBe(8_000_000)
    expect(day('2026-02-03').items).toHaveLength(0)
  })

  it('today carries the overdue payments still expected', () => {
    expect(day('2026-02-10').balance).toBe(2_000_000)
  })

  it('projects planned income and expenses forward', () => {
    expect(day('2026-02-15').balance).toBe(5_000_000)
    expect(day('2026-02-15').inflow).toBe(3_000_000)
    expect(day('2026-02-20').balance).toBe(-1_000_000)
    expect(day('2026-02-25').balance).toBe(-2_000_000)
  })

  it('marks the first cash gap', () => {
    expect(day('2026-02-20').gap).toBe(true)
    expect(day('2026-02-15').gap).toBe(false)
    expect(cal.firstGap).toBe('2026-02-20')
  })

  it('no gap when there is enough money', () => {
    const rich = buildCalendar({ accounts: [{ ...kaspi, openingBalance: 100_000_000 }], operations, recurrences, today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
    expect(rich.firstGap).toBeNull()
  })

  it('covers every day of the window', () => {
    expect(cal.days).toHaveLength(28)
  })
})
