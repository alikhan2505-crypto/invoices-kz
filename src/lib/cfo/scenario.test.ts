import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoOperation } from './types'
import { NO_CHANGE, runScenario } from './scenario'

const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: Math.random().toString(36), direction: 'in', amount: 0, accountId: 'bank', toAccountId: null, articleId: 'x', counterparty: null, comment: null,
  paidOn: '2026-10-20', accruedOn: '2026-10-20', status: 'planned', recurrenceId: null, recurrenceDate: null, ...p,
})
const ws = (operations: CfoOperation[]): Workspace => ({
  userId: 'u', companyId: 'c', companyName: 'X', telegramDigest: false, countInvoices: false, invoices: [], plan: [], articles: [],
  accounts: [{ id: 'bank', name: 'Банк', kind: 'bank', openingBalance: 100_000_00, openingDate: '2026-10-01', archived: false, sort: 10 }],
  recurrences: [{ id: 'r', direction: 'out', amount: 50_000_00, accountId: 'bank', toAccountId: null, articleId: 'x', counterparty: null, comment: null, dayOfMonth: 25, startsOn: '2026-10-01', endsOn: null }],
  operations,
})
const w = ws([op({ amount: 40_000_00 }), op({ direction: 'out', amount: 20_000_00, paidOn: '2026-10-15' }), op({ amount: 999_00, status: 'actual', paidOn: '2026-10-02' })])

describe('runScenario', () => {
  it('without changes matches the plain forecast', () => {
    const r = runScenario(w, '2026-10-07', NO_CHANGE)
    // 100 000 + 999 факт, затем −20 000 (15.10), +40 000 (20.10), −50 000 (25.10)
    expect(r.calendar.days.find((d) => d.date === '2026-10-25')!.balance).toBe(70_999_00)
  })
  it('scales planned income and expenses, leaving facts alone', () => {
    const r = runScenario(w, '2026-10-07', { incomePct: -50, expensePct: 10, extra: null })
    // 100 999 − 22 000 + 20 000 − 55 000
    expect(r.calendar.days.find((d) => d.date === '2026-10-25')!.balance).toBe(43_999_00)
  })
  it('adds a one-off payment and reports the lowest point', () => {
    const r = runScenario(w, '2026-10-07', { incomePct: 0, expensePct: 0, extra: { amount: 200_000_00, date: '2026-10-10', direction: 'out' } })
    expect(r.calendar.firstGap).toBe('2026-10-10')
    expect(r.minBalance).toBeLessThan(0)
    expect(r.minDate >= '2026-10-10').toBe(true)
  })
})
