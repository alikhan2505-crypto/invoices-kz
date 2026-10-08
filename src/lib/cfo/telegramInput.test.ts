import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import { checkParsed, extractJson, TELEGRAM_MARK } from './telegramInput'

const ws: Workspace = {
  userId: 'u', companyId: 'c', companyName: 'X', telegramDigest: false, countInvoices: false, invoices: [], operations: [], recurrences: [], plan: [],
  accounts: [
    { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 1 },
    { id: 'bank', name: 'Kaspi', kind: 'bank', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 2 },
  ],
  articles: [
    { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 1 },
    { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 2 },
    { id: 'old', name: 'Старая', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: true, sort: 3 },
  ],
}
const T = '2026-10-08'

describe('checkParsed', () => {
  it('accepts a well-formed expense and defaults to the bank account', () => {
    const r = checkParsed({ direction: 'out', amount: 300000, article_id: 'rent', account_id: null, counterparty: 'ИП Ахметов', date: T }, ws, T, 'аренда 300к')
    expect(r).toEqual({ ok: true, draft: expect.objectContaining({ direction: 'out', amount: 300_000_00, accountId: 'bank', articleId: 'rent', status: 'actual', counterparty: 'ИП Ахметов', comment: `${TELEGRAM_MARK}аренда 300к` }) })
  })
  it('turns a future date into a planned payment', () => {
    const r = checkParsed({ direction: 'out', amount: 5000, article_id: 'rent', date: '2026-10-25' }, ws, T, 'x')
    expect(r.ok && r.draft.status).toBe('planned')
  })
  it('rejects wrong-kind, archived or foreign articles, bad amounts and directions', () => {
    expect(checkParsed({ direction: 'in', amount: 1, article_id: 'rent' }, ws, T, 'x').ok).toBe(false)
    expect(checkParsed({ direction: 'out', amount: 1, article_id: 'old' }, ws, T, 'x').ok).toBe(false)
    expect(checkParsed({ direction: 'out', amount: 1, article_id: 'someone-elses' }, ws, T, 'x').ok).toBe(false)
    expect(checkParsed({ direction: 'out', amount: -5, article_id: 'rent' }, ws, T, 'x').ok).toBe(false)
    expect(checkParsed({ direction: 'sideways', amount: 5, article_id: 'rent' }, ws, T, 'x').ok).toBe(false)
  })
  it('ignores an unknown account id and an out-of-range date', () => {
    const r = checkParsed({ direction: 'in', amount: 10, article_id: 'rev', account_id: 'evil', date: '1999-01-01' }, ws, T, 'x')
    expect(r.ok && [r.draft.accountId, r.draft.paidOn]).toEqual(['bank', T])
  })
})

describe('extractJson', () => {
  it('pulls JSON out of a chatty reply and survives garbage', () => {
    expect(extractJson('Вот: {"direction":"out","amount":5} готово')).toEqual({ direction: 'out', amount: 5 })
    expect(extractJson('нет json')).toBeNull()
    expect(extractJson('{broken')).toBeNull()
  })
})
