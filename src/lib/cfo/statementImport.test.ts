import { describe, expect, it } from 'vitest'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'
import { NO_COLUMN, detectColumns, extractRows, markDuplicates, parseCellDate, parseCellMoney, rowProblem, suggestChoice, toDraft, type ParsedRow } from './statementImport'

const art = (id: string, name: string, kind: 'income' | 'expense', archived = false): CfoArticle =>
  ({ id, name, kind, activity: 'operating', pnlGroup: null, sort: 0, archived } as CfoArticle)
const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: 'o', direction: 'out', amount: 100, accountId: 'acc', toAccountId: null, articleId: null, counterparty: null, comment: null,
  paidOn: '2026-10-01', accruedOn: '2026-10-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p,
})
const row = (p: Partial<ParsedRow>): ParsedRow => ({ line: 2, date: '2026-10-01', direction: 'out', amount: 100, counterparty: '', purpose: '', ...p })

describe('parseCellDate', () => {
  it('reads dd.mm.yyyy with and without time', () => {
    expect(parseCellDate('05.10.2026')).toBe('2026-10-05')
    expect(parseCellDate('5.10.2026 14:33:01')).toBe('2026-10-05')
    expect(parseCellDate('05/10/2026')).toBe('2026-10-05')
    expect(parseCellDate('05.10.26')).toBe('2026-10-05')
  })
  it('reads ISO and Excel serial numbers', () => {
    expect(parseCellDate('2026-10-05T00:00:00')).toBe('2026-10-05')
    expect(parseCellDate(46300)).toBe('2026-10-05') // Excel: 01.01.2026 = 46023
  })
  it('rejects junk and impossible dates', () => {
    expect(parseCellDate('Итого')).toBeNull()
    expect(parseCellDate('')).toBeNull()
    expect(parseCellDate('31.02.2026')).toBeNull()
    expect(parseCellDate(12)).toBeNull()
  })
})

describe('parseCellMoney', () => {
  it('handles kz/ru formatting', () => {
    expect(parseCellMoney('1 250 000,50')).toBe(125000050)
    expect(parseCellMoney('1 250 000,50 ₸')).toBe(125000050)
    expect(parseCellMoney('-300')).toBe(-30000)
    expect(parseCellMoney('−300 KZT')).toBe(-30000)
    expect(parseCellMoney('(500)')).toBe(-50000)
    expect(parseCellMoney('1,250,000.50')).toBe(125000050)
    expect(parseCellMoney('+42.1')).toBe(4210)
    expect(parseCellMoney(1250.5)).toBe(125050)
  })
  it('returns null for text and empty cells', () => {
    expect(parseCellMoney('')).toBeNull()
    expect(parseCellMoney('abc')).toBeNull()
    expect(parseCellMoney(null)).toBeNull()
  })
})

describe('detectColumns + extractRows', () => {
  it('finds a debit/credit statement below a title block', () => {
    const grid = [
      ['Выписка по счёту KZ12...'],
      ['Период: 01.10.2026 - 07.10.2026'],
      ['Дата операции', 'Наименование контрагента', 'Назначение платежа', 'Дебет', 'Кредит'],
      ['01.10.2026', 'ТОО Ромашка', 'Оплата по счёту 15', '', '600 000,00'],
      ['02.10.2026', 'ИП Аренда', 'Аренда за октябрь', '300 000,00', ''],
      ['', 'Итого', '', '300 000,00', '600 000,00'],
    ]
    const d = detectColumns(grid)!
    expect(d.headerRow).toBe(2)
    expect(d.map).toMatchObject({ date: 0, counterparty: 1, purpose: 2, debit: 3, credit: 4, amount: NO_COLUMN })
    const rows = extractRows(grid, d.headerRow, d.map)
    expect(rows).toEqual([
      { line: 4, date: '2026-10-01', direction: 'in', amount: 60000000, counterparty: 'ТОО Ромашка', purpose: 'Оплата по счёту 15' },
      { line: 5, date: '2026-10-02', direction: 'out', amount: 30000000, counterparty: 'ИП Аренда', purpose: 'Аренда за октябрь' },
    ])
  })
  it('handles a single signed amount column', () => {
    const grid = [['Дата', 'Сумма', 'Детали'], ['03.10.2026', '-1 500', 'Комиссия банка'], ['03.10.2026', '0', 'нулевая']]
    const d = detectColumns(grid)!
    expect(d.map.amount).toBe(1)
    expect(extractRows(grid, d.headerRow, d.map)).toEqual([
      { line: 2, date: '2026-10-03', direction: 'out', amount: 150000, counterparty: '', purpose: 'Комиссия банка' },
    ])
  })
  it('returns null when there is no date or amount header', () => {
    expect(detectColumns([['a', 'b'], ['1', '2']])).toBeNull()
  })
})

describe('suggestChoice', () => {
  const articles = [
    art('rev', 'Выручка от продажи товаров', 'income'),
    art('oin', 'Прочие доходы', 'income'),
    art('rent', 'Аренда', 'expense'),
    art('fee', 'Банковские комиссии и эквайринг', 'expense'),
    art('tax', 'Налоги и взносы с зарплаты (ОПВ, СО, ВОСМС, СН, ИПН)', 'expense'),
    art('oout', 'Прочие расходы', 'expense'),
  ]
  it('reuses the article last used for the same counterparty, ignoring legal form and quotes', () => {
    const history = [op({ counterparty: 'ТОО «Ромашка»', articleId: 'rent', paidOn: '2026-09-01' })]
    expect(suggestChoice(row({ counterparty: 'Ромашка' }), history, articles)).toEqual({ kind: 'article', articleId: 'rent' })
  })
  it('falls back to keywords, then to «Прочие»', () => {
    expect(suggestChoice(row({ purpose: 'Комиссия за перевод' }), [], articles)).toEqual({ kind: 'article', articleId: 'fee' })
    expect(suggestChoice(row({ purpose: 'Перечисление ОПВ за сентябрь' }), [], articles)).toEqual({ kind: 'article', articleId: 'tax' })
    expect(suggestChoice(row({ purpose: 'Возврат долга' }), [], articles)).toEqual({ kind: 'article', articleId: 'oout' })
    expect(suggestChoice(row({ direction: 'in', purpose: 'Оплата за товар' }), [], articles)).toEqual({ kind: 'article', articleId: 'rev' })
  })
  it('never suggests an article of the wrong kind or an archived one', () => {
    const only = [art('rent', 'Аренда', 'expense', true)]
    expect(suggestChoice(row({ purpose: 'аренда' }), [], only)).toEqual({ kind: 'none' })
    expect(suggestChoice(row({ direction: 'in', purpose: 'аренда' }), [], articles)).toEqual({ kind: 'article', articleId: 'oin' })
  })
})

describe('markDuplicates', () => {
  it('matches existing actual operations one-for-one, including transfers on either side', () => {
    const ops = [
      op({ paidOn: '2026-10-01', amount: 500, direction: 'out' }),
      op({ paidOn: '2026-10-02', amount: 700, direction: 'transfer', accountId: 'other', toAccountId: 'acc' }),
      op({ paidOn: '2026-10-03', amount: 900, status: 'planned' }),
    ]
    const rows = [
      row({ line: 2, date: '2026-10-01', amount: 500 }),
      row({ line: 3, date: '2026-10-01', amount: 500 }), // вторая такая же покупка — не дубль
      row({ line: 4, date: '2026-10-02', amount: 700, direction: 'in' }),
      row({ line: 5, date: '2026-10-03', amount: 900 }), // плановая не считается
    ]
    expect([...markDuplicates(rows, 'acc', ops)]).toEqual([2, 4])
  })
})

describe('rowProblem / toDraft', () => {
  const account = { id: 'acc', openingDate: '2026-10-01' } as CfoAccount
  it('flags future and pre-opening rows', () => {
    expect(rowProblem(row({ date: '2026-10-08' }), account, '2026-10-07')).toBe('дата в будущем')
    expect(rowProblem(row({ date: '2026-09-30' }), account, '2026-10-07')).toBe('раньше начала учёта по счёту')
    expect(rowProblem(row({}), account, '2026-10-07')).toBeNull()
  })
  it('builds article and transfer drafts with the right sides', () => {
    expect(toDraft(row({ counterparty: 'X', purpose: 'Y' }), 'acc', { kind: 'article', articleId: 'a' }))
      .toMatchObject({ direction: 'out', accountId: 'acc', articleId: 'a', toAccountId: null, counterparty: 'X', comment: 'Y', status: 'actual' })
    expect(toDraft(row({ direction: 'out' }), 'acc', { kind: 'transfer', otherAccountId: 'cash' }))
      .toMatchObject({ direction: 'transfer', accountId: 'acc', toAccountId: 'cash', articleId: null })
    expect(toDraft(row({ direction: 'in' }), 'acc', { kind: 'transfer', otherAccountId: 'cash' }))
      .toMatchObject({ direction: 'transfer', accountId: 'cash', toAccountId: 'acc' })
    expect(toDraft(row({}), 'acc', { kind: 'none' })).toBeNull()
  })
})
