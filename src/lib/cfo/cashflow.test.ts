import { describe, it, expect } from 'vitest'
import { buildCashflow } from './cashflow'
import type { CfoAccount, CfoArticle, CfoOperation, CfoPlanItem } from './types'

const t = (tenge: number) => tenge * 100
const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: t(1_000_000), openingDate: '2025-12-01', archived: false, sort: 1 }
const cash: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2025-12-01', archived: false, sort: 2 }

const art = (id: string, kind: CfoArticle['kind'], activity: CfoArticle['activity'], sort: number): CfoArticle =>
  ({ id, name: id, kind, activity, pnlGroup: null, archived: false, sort })
const articles = [
  art('rev', 'income', 'operating', 1),
  art('rent', 'expense', 'operating', 2),
  art('equipment', 'expense', 'investing', 3),
  art('loanIn', 'income', 'financing', 4),
  art('loanBody', 'expense', 'financing', 5),
]

const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: null, counterparty: null, comment: null, paidOn: '2026-01-10', accruedOn: '2026-01-10', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const operations = [
  op({ direction: 'in', articleId: 'rev', amount: t(300_000), paidOn: '2026-01-10', accruedOn: '2025-12-20' }),
  op({ articleId: 'rent', amount: t(100_000), paidOn: '2026-01-12' }),
  op({ articleId: 'equipment', amount: t(500_000), paidOn: '2026-01-20' }),
  op({ direction: 'transfer', toAccountId: 'cash', amount: t(50_000), paidOn: '2026-01-22' }),
  op({ direction: 'in', articleId: 'loanIn', amount: t(1_000_000), paidOn: '2026-02-01' }),
  op({ articleId: 'loanBody', amount: t(200_000), paidOn: '2026-02-15' }),
]
const plan: CfoPlanItem[] = [{ articleId: 'rev', month: '2026-01', amount: t(400_000) }]

const rows = buildCashflow({ accounts: [kaspi, cash], articles, operations, plan, months: ['2026-01', '2026-02'] })
const row = (key: string) => rows.find((r) => r.key === key)!

describe('buildCashflow', () => {
  it('books cash by payment date', () => {
    expect(row('a:rev').cells['2026-01'].fact).toBe(t(300_000))
  })

  it('nets each activity', () => {
    expect(row('act:operating').cells['2026-01'].fact).toBe(t(200_000))
    expect(row('act:investing').cells['2026-01'].fact).toBe(t(-500_000))
    expect(row('act:financing').cells['2026-02'].fact).toBe(t(800_000))
    expect(row('t:netflow').cells['2026-01'].fact).toBe(t(-300_000))
  })

  it('opening plus flow equals closing', () => {
    expect(row('b:opening').cells['2026-01'].fact).toBe(t(1_000_000))
    expect(row('b:closing').cells['2026-01'].fact).toBe(t(700_000))
    expect(row('b:opening').cells['2026-02'].fact).toBe(t(700_000))
    expect(row('b:closing').cells['2026-02'].fact).toBe(t(1_500_000))
    for (const m of ['2026-01', '2026-02']) {
      expect(row('b:opening').cells[m].fact + row('t:netflow').cells[m].fact).toBe(row('b:closing').cells[m].fact)
    }
  })

  it('carries the plan, with no plan for balances', () => {
    expect(row('act:operating').cells['2026-01'].plan).toBe(t(400_000))
    expect(row('b:opening').cells['2026-01'].plan).toBeNull()
  })

  it('orders the report', () => {
    expect(rows[0].key).toBe('b:opening')
    expect(rows[rows.length - 1].key).toBe('b:closing')
    expect(rows.filter((r) => r.type === 'activity').map((r) => r.key)).toEqual(['act:operating', 'act:investing', 'act:financing'])
  })

  it('year totals: opening of the first month, closing of the last', () => {
    expect(row('b:opening').total.fact).toBe(t(1_000_000))
    expect(row('b:closing').total.fact).toBe(t(1_500_000))
    expect(row('t:netflow').total.fact).toBe(t(500_000))
  })
})
