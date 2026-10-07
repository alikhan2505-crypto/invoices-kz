import { describe, expect, it } from 'vitest'
import type { Workspace } from './data'
import type { CfoArticle, CfoOperation } from './types'
import { alreadyAdded, planTaxes, simplifiedDates, simplifiedEstimate, taxArticle, taxMark, vatDates } from './taxCalendar'

const art = (id: string, name: string, kind: 'income' | 'expense', activity: CfoArticle['activity'] = 'operating', archived = false): CfoArticle =>
  ({ id, name, kind, activity, pnlGroup: null, archived, sort: 0 })
const articles = [
  art('pay', 'Налоги и взносы с зарплаты (ОПВ, СО, ВОСМС, СН, ИПН)', 'expense'),
  art('inc', 'Налог на доход (ИПН ИП / КПН)', 'expense'),
  art('vat', 'НДС к уплате', 'expense'),
  art('rev', 'Выручка от продажи товаров', 'income'),
  art('loan', 'Получение кредита / займа', 'income', 'financing'),
]
const op = (p: Partial<CfoOperation>): CfoOperation => ({
  id: 'o', direction: 'in', amount: 0, accountId: 'acc', toAccountId: null, articleId: 'rev', counterparty: null, comment: null,
  paidOn: '2026-08-01', accruedOn: '2026-08-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p,
})
const ws = (ops: CfoOperation[] = [], comments: string[] = []): Workspace => ({
  userId: 'u', companyId: 'c', companyName: 'X', telegramDigest: false, countInvoices: false, invoices: [], accounts: [], articles, operations: ops, plan: [],
  recurrences: comments.map((c, i) => ({ id: `r${i}`, direction: 'out', amount: 1, accountId: 'acc', toAccountId: null, articleId: 'pay', counterparty: null, comment: c, dayOfMonth: 25, startsOn: '2026-10-01', endsOn: null })),
})

describe('due dates', () => {
  it('lists the next 910 and VAT deadlines from today, including today', () => {
    expect(simplifiedDates('2026-10-07')).toEqual(['2027-02-25', '2027-08-25'])
    expect(simplifiedDates('2026-08-25')).toEqual(['2026-08-25', '2027-02-25'])
    expect(vatDates('2026-10-07')).toEqual(['2026-11-25', '2027-02-25', '2027-05-25', '2027-08-25'])
  })
})

describe('planTaxes', () => {
  it('turns monthly taxes into day-25 recurrences and 910/VAT into dated planned payments', () => {
    const plan = planTaxes({ amounts: { payroll: 205_000_00, simplified: 400_000_00, vat: 0 }, accountId: 'acc', articles, today: '2026-10-07' })
    expect(plan.recurrences).toEqual([expect.objectContaining({ articleId: 'pay', amount: 205_000_00, dayOfMonth: 25, startsOn: '2026-10-07', direction: 'out', comment: taxMark('payroll') })])
    expect(plan.operations.map((o) => [o.articleId, o.paidOn, o.status])).toEqual([['inc', '2027-02-25', 'planned'], ['inc', '2027-08-25', 'planned']])
  })
  it('skips a tax whose article was deleted or archived', () => {
    const plan = planTaxes({ amounts: { vat: 100 }, accountId: 'acc', articles: articles.filter((a) => a.id !== 'vat'), today: '2026-10-07' })
    expect(plan.operations).toEqual([])
    expect(taxArticle('vat', [art('vat', 'НДС к уплате', 'expense', 'operating', true)])).toBeNull()
  })
})

describe('simplifiedEstimate', () => {
  it('takes 4% of real income since the start of the half-year, excluding loans and plans', () => {
    const w = ws([
      op({ amount: 1_000_000_00, paidOn: '2026-07-15' }),
      op({ amount: 500_000_00, paidOn: '2026-06-30' }), // прошлое полугодие
      op({ amount: 300_000_00, articleId: 'loan', paidOn: '2026-08-01' }),
      op({ amount: 200_000_00, status: 'planned', paidOn: '2026-09-01' }),
    ])
    expect(simplifiedEstimate(w, '2026-10-07')).toBe(40_000_00)
  })
})

describe('alreadyAdded', () => {
  it('recognises taxes added earlier by their mark', () => {
    expect([...alreadyAdded(ws([], [taxMark('payroll'), 'что-то другое']))]).toEqual(['payroll'])
  })
})
