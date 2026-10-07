import { describe, it, expect } from 'vitest'
import { buildPnl } from './pnl'
import type { CfoArticle, CfoOperation, CfoPlanItem } from './types'

const t = (tenge: number) => tenge * 100
const art = (id: string, kind: CfoArticle['kind'], pnlGroup: CfoArticle['pnlGroup'], sort: number, archived = false): CfoArticle =>
  ({ id, name: id, kind, activity: 'operating', pnlGroup, archived, sort })

const articles = [
  art('rev', 'income', 'revenue', 1),
  art('cogs', 'expense', 'cogs', 2),
  art('rent', 'expense', 'opex', 3),
  art('oldOpex', 'expense', 'opex', 4, true),
  art('otherInc', 'income', 'finance', 5),
  art('interest', 'expense', 'finance', 6),
  art('tax', 'expense', 'tax', 7),
  art('loanIn', 'income', null, 8),
  art('loanBody', 'expense', null, 9),
]

const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'k', toAccountId: null, articleId: null, counterparty: null, comment: null, paidOn: '2026-01-15', accruedOn: '2026-01-15', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const operations = [
  op({ direction: 'in', articleId: 'rev', amount: t(1_000_000), accruedOn: '2026-01-15', paidOn: '2026-02-05' }),
  op({ articleId: 'cogs', amount: t(400_000) }),
  op({ articleId: 'rent', amount: t(200_000) }),
  op({ articleId: 'interest', amount: t(50_000) }),
  op({ direction: 'in', articleId: 'otherInc', amount: t(10_000) }),
  op({ articleId: 'tax', amount: t(30_000) }),
  op({ direction: 'in', articleId: 'loanIn', amount: t(5_000_000) }),
  op({ articleId: 'loanBody', amount: t(1_000_000) }),
  op({ direction: 'transfer', articleId: null, toAccountId: 'c', amount: t(70_000) }),
  op({ articleId: 'rent', amount: t(200_000), accruedOn: '2026-02-15', paidOn: '2026-02-15', status: 'planned' }),
]
const plan: CfoPlanItem[] = [
  { articleId: 'rev', month: '2026-01', amount: t(1_200_000) },
  { articleId: 'rent', month: '2026-01', amount: t(200_000) },
]

const rows = buildPnl({ articles, operations, plan, months: ['2026-01', '2026-02'] })
const row = (key: string) => rows.find((r) => r.key === key)!

describe('buildPnl', () => {
  it('orders groups and totals', () => {
    expect(rows.filter((r) => r.type !== 'article').map((r) => r.key)).toEqual(
      ['g:revenue', 'g:cogs', 't:gross', 'g:opex', 't:operating', 'g:finance', 'g:tax', 't:net'],
    )
  })

  it('books revenue by accrual month, not payment month', () => {
    expect(row('a:rev').cells['2026-01'].fact).toBe(t(1_000_000))
    expect(row('a:rev').cells['2026-02'].fact).toBe(0)
  })

  it('computes the profit cascade', () => {
    expect(row('t:gross').cells['2026-01'].fact).toBe(t(600_000))
    expect(row('t:operating').cells['2026-01'].fact).toBe(t(400_000))
    expect(row('g:finance').cells['2026-01'].fact).toBe(t(-40_000))
    expect(row('t:net').cells['2026-01'].fact).toBe(t(330_000))
  })

  it('finance expenses carry a minus sign', () => {
    expect(row('a:interest').cells['2026-01'].fact).toBe(t(-50_000))
  })

  it('leaves loan body, owner money and transfers out of the P&L', () => {
    expect(rows.some((r) => r.key === 'a:loanIn' || r.key === 'a:loanBody')).toBe(false)
  })

  it('ignores planned operations as fact and hides empty archived articles', () => {
    expect(row('a:rent').cells['2026-02'].fact).toBe(0)
    expect(rows.some((r) => r.key === 'a:oldOpex')).toBe(false)
  })

  it('carries the plan grid alongside the fact', () => {
    expect(row('g:revenue').cells['2026-01'].plan).toBe(t(1_200_000))
    expect(row('t:net').cells['2026-01'].plan).toBe(t(1_000_000))
    expect(row('t:net').total.fact).toBe(t(330_000))
  })
})
