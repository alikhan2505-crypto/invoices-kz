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

  it('opening plus flow equals closing in the month an account starts', () => {
    const fresh: CfoAccount = { ...kaspi, openingDate: '2026-01-01' }
    const r = buildCashflow({ accounts: [fresh], articles, operations: [op({ direction: 'in', articleId: 'rev', amount: t(100_000), paidOn: '2026-01-10' })], plan: [], months: ['2026-01'] })
    const get = (k: string) => r.find((x) => x.key === k)!.cells['2026-01'].fact
    expect(get('b:opening')).toBe(t(1_000_000))
    expect(get('b:opening') + get('t:netflow')).toBe(get('b:closing'))
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

describe('buildCashflow edge cases', () => {
  it('empty months returns empty rows', () => {
    const result = buildCashflow({ accounts: [kaspi, cash], articles, operations, plan, months: [] })
    expect(result).toEqual([])
  })

  it('ignores planned operations as fact', () => {
    const opsWithPlanned = [
      ...operations,
      op({ articleId: 'rent', amount: t(999_000), paidOn: '2026-01-15', status: 'planned' }),
    ]
    const result = buildCashflow({ accounts: [kaspi, cash], articles, operations: opsWithPlanned, plan, months: ['2026-01', '2026-02'] })
    const row = (key: string) => result.find((r) => r.key === key)!
    expect(row('a:rent').cells['2026-01'].fact).toBe(t(100_000))
    expect(row('b:closing').cells['2026-01'].fact).toBe(t(700_000))
  })

  it('ignores operations and plan items outside months', () => {
    const result = buildCashflow({ accounts: [kaspi, cash], articles, operations, plan, months: ['2026-02'] })
    const row = (key: string) => result.find((r) => r.key === key)!
    expect(row('a:rev').cells['2026-02'].fact).toBe(0)
    expect(row('b:opening').cells['2026-02'].fact).toBe(t(700_000))
  })

  it('archived article with data is shown; without data is hidden', () => {
    const articlesWithArchived = [
      ...articles,
      { ...art('oldRent', 'expense', 'operating', 6), archived: true },
      { ...art('empty', 'expense', 'operating', 7), archived: true },
    ]
    const opsWithArchived = [
      ...operations,
      op({ articleId: 'oldRent', amount: t(10_000), paidOn: '2026-01-05' }),
    ]
    const result = buildCashflow({ accounts: [kaspi, cash], articles: articlesWithArchived, operations: opsWithArchived, plan, months: ['2026-01', '2026-02'] })
    const row = (key: string) => result.find((r) => r.key === key)
    expect(row('a:oldRent')).toBeDefined()
    expect(row('a:oldRent')!.cells['2026-01'].fact).toBe(t(10_000))
    expect(row('a:empty')).toBeUndefined()
  })

  it('plan on expense articles reduces activity planned net', () => {
    const planWithExpense = [
      { articleId: 'rev', month: '2026-01', amount: t(400_000) },
      { articleId: 'rent', month: '2026-01', amount: t(150_000) },
    ]
    const result = buildCashflow({ accounts: [kaspi, cash], articles, operations, plan: planWithExpense, months: ['2026-01', '2026-02'] })
    const row = (key: string) => result.find((r) => r.key === key)!
    expect(row('act:operating').cells['2026-01'].plan).toBe(t(250_000))
    expect(row('t:netflow').cells['2026-01'].plan).toBe(t(250_000))
  })

  it('activity with no visible articles produces no rows', () => {
    const limitedArticles = [
      art('rev', 'income', 'operating', 1),
      art('rent', 'expense', 'operating', 2),
    ]
    const limitedOps = [
      op({ direction: 'in', articleId: 'rev', amount: t(300_000), paidOn: '2026-01-10', accruedOn: '2025-12-20' }),
      op({ articleId: 'rent', amount: t(100_000), paidOn: '2026-01-12' }),
    ]
    const result = buildCashflow({ accounts: [kaspi, cash], articles: limitedArticles, operations: limitedOps, plan: [], months: ['2026-01', '2026-02'] })
    const activityRows = result.filter((r) => r.type === 'activity')
    expect(activityRows.some((r) => r.key === 'act:investing')).toBe(false)
    expect(activityRows.some((r) => r.key === 'act:financing')).toBe(false)
  })
})
