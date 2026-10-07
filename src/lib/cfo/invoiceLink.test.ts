import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoAccount, CfoArticle, CfoOperation, InvoiceLite } from './types'
import { expectedInflows, forecastOperations, overdueReceivables, unpostedPaid } from './invoiceLink'

const accounts: CfoAccount[] = [
  { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 0, openingDate: '2026-10-01', archived: false, sort: 10 },
  { id: 'bank', name: 'Банк', kind: 'bank', openingBalance: 0, openingDate: '2026-10-01', archived: false, sort: 20 },
]
const articles: CfoArticle[] = [
  { id: 'other', name: 'Прочие доходы', kind: 'income', activity: 'operating', pnlGroup: 'finance', archived: false, sort: 5 },
  { id: 'rev', name: 'Выручка от услуг', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 10 },
]
const inv = (p: Partial<InvoiceLite>): InvoiceLite => ({ id: 'i', number: '1', amount: 100_00, status: 'draft', dueDate: null, createdOn: '2026-10-01', paidOn: null, clientName: 'ТОО Ромашка', ...p })
const ws = (invoices: InvoiceLite[], operations: CfoOperation[] = [], countInvoices = true): Workspace => ({
  userId: 'u', companyId: 'c', companyName: 'X', telegramDigest: false, countInvoices, invoices, accounts, articles, operations, recurrences: [], plan: [],
})

describe('expectedInflows', () => {
  it('turns unpaid invoices due today or later into planned income on the bank account and revenue article', () => {
    const out = expectedInflows(ws([inv({ id: 'a', dueDate: '2026-10-10', number: '15' }), inv({ id: 'b', createdOn: '2026-10-05' })]), '2026-10-07')
    expect(out.map((o) => [o.id, o.paidOn, o.accountId, o.articleId, o.status, o.comment])).toEqual([
      ['inv:a', '2026-10-10', 'bank', 'rev', 'planned', 'Счёт №15'],
      ['inv:b', '2026-10-12', 'bank', 'rev', 'planned', 'Счёт №1'], // без срока — через 7 дней
    ])
  })
  it('ignores paid, cancelled, zero and past-due invoices', () => {
    const out = expectedInflows(ws([inv({ status: 'paid', dueDate: '2026-10-20' }), inv({ status: 'cancelled', dueDate: '2026-10-20' }), inv({ amount: 0, dueDate: '2026-10-20' }), inv({ dueDate: '2026-10-06' })]), '2026-10-07')
    expect(out).toEqual([])
  })
})

describe('overdueReceivables / unpostedPaid / forecastOperations', () => {
  it('lists past-due unpaid invoices, oldest first', () => {
    const out = overdueReceivables(ws([inv({ id: 'new', dueDate: '2026-10-06' }), inv({ id: 'old', dueDate: '2026-09-01' }), inv({ id: 'ok', dueDate: '2026-10-09' })]), '2026-10-07')
    expect(out.map((i) => i.id)).toEqual(['old', 'new'])
  })
  it('offers only paid invoices that have no linked operation yet', () => {
    const linked = { id: 'o', invoiceId: 'p1' } as CfoOperation
    expect(unpostedPaid(ws([inv({ id: 'p1', status: 'paid' }), inv({ id: 'p2', status: 'paid' }), inv({ id: 'u', status: 'draft' })], [linked])).map((i) => i.id)).toEqual(['p2'])
  })
  it('adds expected invoices to the forecast only when enabled', () => {
    const w = (on: boolean) => ws([inv({ dueDate: '2026-10-20' })], [], on)
    expect(forecastOperations(w(true), '2026-10-07')).toHaveLength(1)
    expect(forecastOperations(w(false), '2026-10-07')).toHaveLength(0)
  })
})
