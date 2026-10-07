import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoOperation } from './types'
import { buildAskContext } from './askContext'

const base: Workspace = {
  userId: 'u', companyId: 'c', companyName: 'ТОО Альфа', telegramDigest: false, countInvoices: true, invoices: [],
  accounts: [{ id: 'bank', name: 'Kaspi', kind: 'bank', openingBalance: 1_000_000_00, openingDate: '2026-01-01', archived: false, sort: 10 }],
  articles: [
    { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 10 },
    { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 20 },
  ],
  operations: [], recurrences: [], plan: [],
}
const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: Math.random().toString(36), direction: 'in', amount: 0, accountId: 'bank', toAccountId: null, articleId: 'rev', counterparty: null, comment: null,
  paidOn: '2026-09-10', accruedOn: '2026-09-10', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p,
})

describe('buildAskContext', () => {
  it('summarises balances, P&L, counterparties and the calendar in whole tenge', () => {
    const text = buildAskContext({ ...base, operations: [
      op({ amount: 600_000_00, counterparty: 'ТОО Ромашка' }),
      op({ direction: 'out', articleId: 'rent', amount: 300_000_00, counterparty: 'ИП Арендодатель' }),
      op({ direction: 'out', articleId: 'rent', amount: 300_000_00, status: 'planned', paidOn: '2026-10-25', accruedOn: '2026-10-25' }),
    ] }, '2026-10-07')
    expect(text).toContain('Компания: ТОО Альфа. Сегодня: 2026-10-07')
    expect(text).toContain('- Kaspi (bank): 1300000')
    expect(text).toMatch(/Выручка: .*600000\/0/)
    expect(text).toContain('- ТОО Ромашка: 600000 / 0')
    expect(text).toContain('- 2026-10-25 -300000 Аренда')
    expect(text).toContain('Кассовых разрывов нет')
  })
  it('works on an empty cabinet', () => {
    expect(buildAskContext(base, '2026-10-07')).toContain('Итого: 1000000')
  })
})
