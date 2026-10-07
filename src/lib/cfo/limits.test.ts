import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoOperation } from './types'
import { monthLimits } from './limits'

const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: 'o', direction: 'out', amount: 0, accountId: 'a', toAccountId: null, articleId: 'ads', counterparty: null, comment: null,
  paidOn: '2026-10-05', accruedOn: '2026-10-05', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p,
})
const ws: Workspace = {
  userId: 'u', companyId: 'c', companyName: 'X', telegramDigest: false, countInvoices: false, invoices: [], accounts: [], recurrences: [],
  articles: [
    { id: 'ads', name: 'Реклама', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 1 },
    { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 2 },
    { id: 'net', name: 'Связь', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 3 },
    { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 4 },
  ],
  plan: [
    { articleId: 'ads', month: '2026-10', amount: 100_00 },
    { articleId: 'rent', month: '2026-10', amount: 300_00 },
    { articleId: 'net', month: '2026-10', amount: 50_00 },
    { articleId: 'rev', month: '2026-10', amount: 999_00 },
    { articleId: 'ads', month: '2026-11', amount: 100_00 },
  ],
  operations: [
    op({ amount: 120_00 }),
    op({ articleId: 'rent', amount: 280_00 }),
    op({ articleId: 'net', amount: 10_00 }),
    op({ articleId: 'net', amount: 99_00, status: 'planned' }),
    op({ amount: 50_00, accruedOn: '2026-09-30' }), // начислено в сентябре
  ],
}

describe('monthLimits', () => {
  it('compares accrued expense facts with the month plan, worst first', () => {
    expect(monthLimits(ws, '2026-10').map((r) => [r.name, r.fact, r.plan, r.level])).toEqual([
      ['Реклама', 120_00, 100_00, 'over'],
      ['Аренда', 280_00, 300_00, 'warn'],
      ['Связь', 10_00, 50_00, 'ok'],
    ])
  })
})
