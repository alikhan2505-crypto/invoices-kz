import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoOperation } from './types'
import { buildMonthlyReport as build } from './monthlyReport'

const buildMonthlyReport = (w: Workspace, m: string) => build(w, m).replace(/ /g, ' ')
const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: Math.random().toString(36), direction: 'in', amount: 0, accountId: 'bank', toAccountId: null, articleId: 'rev', counterparty: null, comment: null,
  paidOn: '2026-09-10', accruedOn: '2026-09-10', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p,
})
const ws: Workspace = {
  userId: 'u', companyId: 'c', companyName: 'ТОО Альфа', telegramDigest: true, countInvoices: false, invoices: [], recurrences: [],
  accounts: [{ id: 'bank', name: 'Kaspi', kind: 'bank', openingBalance: 1_000_000_00, openingDate: '2026-08-01', archived: false, sort: 1 }],
  articles: [
    { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 1 },
    { id: 'ads', name: 'Реклама', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 2 },
  ],
  plan: [{ articleId: 'rev', month: '2026-09', amount: 500_000_00 }, { articleId: 'ads', month: '2026-09', amount: 100_000_00 }],
  operations: [
    op({ amount: 400_000_00, paidOn: '2026-08-15', accruedOn: '2026-08-15' }),
    op({ amount: 600_000_00 }),
    op({ direction: 'out', articleId: 'ads', amount: 150_000_00 }),
  ],
}

describe('buildMonthlyReport', () => {
  it('summarises revenue vs plan and last month, profit, cash movement and overspend', () => {
    const t = buildMonthlyReport(ws, '2026-09')
    expect(t).toContain('итоги: сентябрь 2026')
    expect(t).toContain('📈 Выручка: <b>600 000 ₸</b> · план 500 000 ₸ (+20%) · к прошлому месяцу (+50%)')
    expect(t).toContain('💼 Чистая прибыль: <b>450 000 ₸</b>')
    expect(t).toContain('💰 Деньги: 1 400 000 ₸ → <b>1 850 000 ₸</b> (+450 000 ₸)')
    expect(t).toContain('📊 Перерасход: Реклама +50 000 ₸')
  })
})
