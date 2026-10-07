import { describe, it, expect } from 'vitest'
import { buildDashboard } from './dashboard'
import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'

const t = (tenge: number) => tenge * 100
const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: t(1_000_000), openingDate: '2026-01-01', archived: false, sort: 1 }
const articles: CfoArticle[] = [
  { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 1 },
  { id: 'cogs', name: 'Закупка', kind: 'expense', activity: 'operating', pnlGroup: 'cogs', archived: false, sort: 2 },
  { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 3 },
]
const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: Math.random().toString(36).slice(2), direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-03-01', accruedOn: '2026-03-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })
const at = (date: string, p: Partial<CfoOperation>) => op({ paidOn: date, accruedOn: date, ...p })

const operations: CfoOperation[] = [
  at('2026-01-20', { articleId: 'rent', amount: t(200_000) }),
  at('2026-02-20', { articleId: 'rent', amount: t(200_000) }),
  at('2026-03-05', { direction: 'in', articleId: 'rev', amount: t(1_000_000) }),
  at('2026-03-06', { articleId: 'cogs', amount: t(600_000) }),
  at('2026-03-07', { articleId: 'rent', amount: t(200_000) }),
  at('2026-03-20', { articleId: 'rent', amount: t(50_000), status: 'planned' }),
  at('2026-03-25', { articleId: 'rent', amount: t(60_000), status: 'planned' }),
]
const plan: CfoPlanItem[] = [{ articleId: 'rev', month: '2026-03', amount: t(1_200_000) }]
const input = { accounts: [kaspi], articles, operations, recurrences: [], plan, month: '2026-03', today: '2026-03-15' }

describe('buildDashboard', () => {
  const d = buildDashboard(input)

  it('revenue, margin and net profit for the month', () => {
    expect(d.revenue).toEqual({ plan: t(1_200_000), fact: t(1_000_000) })
    expect(d.grossMarginPct).toBe(40)
    expect(d.netProfit.fact).toBe(t(200_000))
  })

  it('cash now and runway without new income', () => {
    expect(d.cashNow).toBe(t(800_000))
    expect(d.runwayDays).toBe(60)
  })

  it('break-even revenue', () => {
    expect(d.breakeven).toEqual({ kind: 'ok', value: t(500_000) })
  })

  it('break-even edge cases', () => {
    expect(buildDashboard({ ...input, month: '2026-02' }).breakeven).toEqual({ kind: 'no-revenue' })
    const costly = [...operations, at('2026-03-08', { articleId: 'cogs', amount: t(500_000) })]
    expect(buildDashboard({ ...input, operations: costly }).breakeven).toEqual({ kind: 'unreachable' })
  })

  it('no runway figure without any outflows', () => {
    expect(buildDashboard({ ...input, operations: [at('2026-03-05', { direction: 'in', articleId: 'rev', amount: t(1) })] }).runwayDays).toBeNull()
  })

  it('twelve months of income and expense', () => {
    expect(d.monthly).toHaveLength(12)
    expect(d.monthly[11]).toEqual({ month: '2026-03', income: t(1_000_000), expense: t(800_000) })
  })

  it('expense structure, biggest first', () => {
    expect(d.expenseStructure.map((x) => x.articleId)).toEqual(['cogs', 'rent'])
  })

  it('upcoming payments are the next seven days only', () => {
    expect(d.upcoming.map((o) => o.paidOn)).toEqual(['2026-03-20'])
  })

  it('reports the first cash gap in the horizon', () => {
    const gap = [...operations, at('2026-04-10', { articleId: 'rent', amount: t(5_000_000), status: 'planned' })]
    expect(buildDashboard({ ...input, operations: gap }).firstGap).toBe('2026-04-10')
    expect(d.firstGap).toBeNull()
  })

  it('runway window excludes outflows outside the 90-day window', () => {
    // With today='2026-03-15', the window is 2025-12-16..2026-03-15 (90 days back, inclusive)
    // Outflow on 2025-12-15 (one day outside) should not affect runway
    const withOutsideOutflow = [...operations, at('2025-12-15', { articleId: 'rent', amount: t(5_000_000) })]
    const outsideResult = buildDashboard({ ...input, operations: withOutsideOutflow })
    expect(outsideResult.runwayDays).toBe(60)

    // Move the same outflow to 2025-12-16 (inside window) should change runway
    const withInsideOutflow = [...operations, at('2025-12-16', { articleId: 'rent', amount: t(5_000_000) })]
    const insideResult = buildDashboard({ ...input, operations: withInsideOutflow })
    // cashNow = 800000 (unchanged, operation is included in cash calculation too)
    // outflowSum in window: 5000000 + 200000 + 200000 + 600000 + 200000 = 6200000
    // runwayDays: floor(800000 * 90 / 6200000) = floor(11.61) = 11
    expect(insideResult.runwayDays).toBe(11)
  })

  it('runway is zero when cash is depleted or negative', () => {
    const depleted = [at('2026-03-10', { articleId: 'rent', amount: t(2_000_000) })]
    const result = buildDashboard({ ...input, operations: depleted })
    expect(result.cashNow).toBeLessThan(0)
    expect(result.runwayDays).toBe(0)
  })

  it('transfers do not affect runway, cash, monthly aggregation, or expense structure', () => {
    // Add a second account
    const cash: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 2 }

    // Transfer from kaspi to cash
    const withTransfer = [...operations, op({ direction: 'transfer', articleId: null, accountId: 'kaspi', toAccountId: 'cash', amount: t(300_000), paidOn: '2026-03-08', accruedOn: '2026-03-08' })]

    const baseline = buildDashboard(input)
    const withTransferResult = buildDashboard({ ...input, accounts: [kaspi, cash], operations: withTransfer })

    // Transfers should not affect runway or cash
    expect(withTransferResult.runwayDays).toBe(baseline.runwayDays)
    expect(withTransferResult.cashNow).toBe(baseline.cashNow)

    // Monthly income/expense for March should be unchanged
    expect(withTransferResult.monthly[11]).toEqual(baseline.monthly[11])

    // Expense structure should be unchanged
    expect(withTransferResult.expenseStructure).toEqual(baseline.expenseStructure)
  })

  it('upcoming includes recurrence occurrences', () => {
    const recurrences = [{ id: 'r1', direction: 'out' as const, amount: t(40_000), accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, dayOfMonth: 18, startsOn: '2026-01-01', endsOn: null }]
    const result = buildDashboard({ ...input, recurrences })

    const upcoming18 = result.upcoming.find((o) => o.paidOn === '2026-03-18')
    expect(upcoming18).toBeDefined()
    expect(upcoming18?.id).toBe('rec:r1:2026-03-18')
  })
})
