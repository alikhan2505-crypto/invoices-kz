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
    expect(text).toContain('- 2026-10-25: -300000 Аренда → остаток 1000000')
    expect(text).toContain('Кассовых разрывов нет')
  })

  it('works on an empty cabinet', () => {
    expect(buildAskContext(base, '2026-10-07')).toContain('Итого денег: 1000000')
  })

  it('includes every planned payment in the horizon with the server-side running balance (P1-5: a 15 000 ₸ payment was dropped and the model mis-added)', () => {
    // 14 крупных платежей + один мелкий на 15 000 — раньше в выжимку попадали только 12 крупнейших.
    const big = Array.from({ length: 14 }, (_, i) => op({ direction: 'out', articleId: 'rent', amount: (200_000 + i * 1000) * 100, status: 'planned', paidOn: `2026-10-${String(10 + i).padStart(2, '0')}`, accruedOn: '2026-10-10', counterparty: `Поставщик ${i}` }))
    const small = op({ direction: 'out', articleId: 'rent', amount: 15_000_00, status: 'planned', paidOn: '2026-10-20', accruedOn: '2026-10-20', counterparty: 'Мелкий платёж' })
    const text = buildAskContext({ ...base, operations: [...big, small] }, '2026-10-07')
    expect(text).toContain('Мелкий платёж')
    for (let i = 0; i < 14; i++) expect(text).toContain(`Поставщик ${i}`)
    // Остаток после 20 октября: 1 000 000 − платежи 10..20 (11 крупных) − 15 000
    const paidBy20 = Array.from({ length: 11 }, (_, i) => 200_000 + i * 1000).reduce((s, x) => s + x, 0) + 15_000
    expect(text).toContain(`-15000 Мелкий платёж → остаток ${1_000_000 - paidBy20}`)
    expect(text).toContain('Самый низкий остаток в горизонте:')
    expect(text).toContain('уже посчитан, его не пересчитывать')
  })

  it('compact day lines (over 150 planned items) use the right plural and money-based sums', () => {
    const many = Array.from({ length: 152 }, (_, i) => op({ direction: 'out', articleId: 'rent', amount: 1_000_00, status: 'planned', paidOn: '2026-10-10', accruedOn: '2026-10-10' }))
    const one = op({ direction: 'out', articleId: 'rent', amount: 7_000_00, status: 'planned', paidOn: '2026-10-11', accruedOn: '2026-10-11' })
    const two = [op({ direction: 'out', articleId: 'rent', amount: 1_00, status: 'planned', paidOn: '2026-10-12', accruedOn: '2026-10-12' }), op({ direction: 'in', amount: 2_00, status: 'planned', paidOn: '2026-10-12', accruedOn: '2026-10-12' })]
    const text = buildAskContext({ ...base, operations: [...many, one, ...two] }, '2026-10-07')
    expect(text).toContain('- 2026-10-10: 152 платежа, +0 / -152000')
    expect(text).toContain('- 2026-10-11: 1 платёж, +0 / -7000')
    expect(text).toContain('- 2026-10-12: 2 платежа, +2 / -1')
  })

  it('a planned loan payment is shown with a minus, a loan payout with a plus', () => {
    const w: Workspace = {
      ...base, accounts: [...base.accounts, { id: 'm', name: 'Ипотека', kind: 'loan', openingBalance: -12_000_000_00, openingDate: '2026-01-01', archived: false, sort: 20 }],
      operations: [
        op({ direction: 'transfer', articleId: null, toAccountId: 'm', amount: 150_000_00, status: 'planned', paidOn: '2026-10-09', accruedOn: '2026-10-09' }),
        op({ direction: 'transfer', articleId: null, accountId: 'm', toAccountId: 'bank', amount: 500_000_00, status: 'planned', paidOn: '2026-10-10', accruedOn: '2026-10-10' }),
      ],
    }
    const text = buildAskContext(w, '2026-10-07')
    expect(text).toContain('- 2026-10-09: -150000 Перевод: Kaspi → Ипотека → остаток 850000')
    expect(text).toContain('- 2026-10-10: +500000 Перевод: Ипотека → Kaspi → остаток 1350000')
  })

  it('family mode drops business words and lists loans as debts, not money', () => {
    const w: Workspace = {
      ...base, mode: 'family', companyName: 'Моя компания',
      accounts: [...base.accounts, { id: 'm', name: 'Ипотека', kind: 'loan', openingBalance: -12_000_000_00, openingDate: '2026-01-01', archived: false, sort: 20 }],
      operations: [op({ direction: 'out', articleId: 'rent', amount: 100_00, status: 'planned', paidOn: '2026-10-09', accruedOn: '2026-10-09' })],
    }
    const text = buildAskContext(w, '2026-10-07')
    expect(text).toContain('Семья: Семейный бюджет.')
    expect(text).toContain('Итого денег: 1000000')
    expect(text).toContain('## Долги')
    expect(text).toContain('- Ипотека: -12000000')
    expect(text).toContain('## Платежи на 90 дней')
    expect(text).toContain('Денег на все запланированные платежи хватает')
    expect(text).not.toMatch(/БДР|БДДС|контрагент|Кассов/i)
  })
})
