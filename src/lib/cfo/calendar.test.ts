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


describe('buildCalendar with a loan account (P1-7)', () => {
  const mortgage: CfoAccount = { id: 'mortgage', name: 'Ипотека', kind: 'loan', openingBalance: -12_000_000, openingDate: '2026-01-01', archived: false, sort: 2 }
  const rich = { ...kaspi, openingBalance: 100_000_000 }

  it('the debt itself never creates a gap', () => {
    const c = buildCalendar({ accounts: [rich, mortgage], operations: [], recurrences: [], today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
    expect(c.firstGap).toBeNull()
    expect(c.days[0].balance).toBe(100_000_000)
  })

  it('a planned mortgage payment (transfer to the loan account) reduces cash, a loan payout adds to it', () => {
    const ops = [
      op({ id: 'pay', direction: 'transfer', articleId: null, toAccountId: 'mortgage', amount: 30_000_000, paidOn: '2026-02-15', status: 'planned' }),
      op({ id: 'get', direction: 'transfer', articleId: null, accountId: 'mortgage', toAccountId: 'kaspi', amount: 5_000_000, paidOn: '2026-02-20', status: 'planned' }),
    ]
    const c = buildCalendar({ accounts: [kaspi, mortgage], operations: ops, recurrences: [], today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
    const d = (x: string) => c.days.find((y) => y.date === x)!
    expect(d('2026-02-14').balance).toBe(10_000_000)
    expect(d('2026-02-15').balance).toBe(-20_000_000)
    expect(d('2026-02-20').balance).toBe(-15_000_000)
    expect(c.firstGap).toBe('2026-02-15')
  })

  it('day inflow/outflow follow the money like the balance does: loan payment is an outflow, loan payout an inflow, own transfer neither', () => {
    const ops = [
      op({ id: 'pay', direction: 'transfer', articleId: null, toAccountId: 'mortgage', amount: 30_000_000, paidOn: '2026-02-15', status: 'planned' }),
      op({ id: 'own', direction: 'transfer', articleId: null, accountId: 'kaspi', toAccountId: 'cash', amount: 1_000_000, paidOn: '2026-02-15', status: 'planned' }),
      op({ id: 'get', direction: 'transfer', articleId: null, accountId: 'mortgage', toAccountId: 'kaspi', amount: 5_000_000, paidOn: '2026-02-20', status: 'planned' }),
      op({ id: 'fee', direction: 'out', accountId: 'mortgage', amount: 70_000, paidOn: '2026-02-20', status: 'planned' }),
    ]
    const cashAcc: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 3 }
    const c = buildCalendar({ accounts: [rich, cashAcc, mortgage], operations: ops, recurrences: [], today: '2026-02-10', from: '2026-02-01', to: '2026-02-28' })
    const d = (x: string) => c.days.find((y) => y.date === x)!
    expect(d('2026-02-15').outflow).toBe(30_000_000)
    expect(d('2026-02-15').inflow).toBe(0)
    expect(d('2026-02-20').inflow).toBe(5_000_000)
    expect(d('2026-02-20').outflow).toBe(0)
    expect(d('2026-02-20').balance).toBe(100_000_000 - 30_000_000 + 5_000_000)
  })
})
