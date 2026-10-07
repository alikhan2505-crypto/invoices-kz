import { describe, it, expect } from 'vitest'
import { openingDateConflict, validateArticle, validateOperation, validateRecurrence, type OperationDraft, type ValidationContext } from './validate'
import type { CfoAccount, CfoArticle, CfoOperation } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 0, openingDate: '2026-01-01', archived: false, sort: 1 }
const card: CfoAccount = { id: 'card', name: 'Карта', kind: 'card', openingBalance: 0, openingDate: '2026-03-01', archived: false, sort: 2 }
const revenue: CfoArticle = { id: 'rev', name: 'Выручка', kind: 'income', activity: 'operating', pnlGroup: 'revenue', archived: false, sort: 1 }
const rent: CfoArticle = { id: 'rent', name: 'Аренда', kind: 'expense', activity: 'operating', pnlGroup: 'opex', archived: false, sort: 2 }
const ctx: ValidationContext = { accounts: [kaspi, card], articles: [revenue, rent], today: '2026-06-15' }

const base: OperationDraft = { direction: 'out', amount: 1000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', paidOn: '2026-06-01', accruedOn: '2026-06-01', status: 'actual' }

describe('validateOperation', () => {
  it('accepts a normal expense', () => {
    expect(validateOperation(base, ctx)).toBeNull()
  })

  it('requires a positive amount', () => {
    expect(validateOperation({ ...base, amount: 0 }, ctx)).toBe('Укажите сумму больше нуля')
  })

  it('matches the article kind to the direction', () => {
    expect(validateOperation({ ...base, direction: 'in' }, ctx)).toBe('Для прихода нужна статья дохода')
    expect(validateOperation({ ...base, articleId: 'rev' }, ctx)).toBe('Для расхода нужна статья расхода')
  })

  it('requires an article for income and expense', () => {
    expect(validateOperation({ ...base, articleId: null }, ctx)).toBe('Выберите статью')
  })

  it('transfer has two different accounts and no article', () => {
    const transfer: OperationDraft = { ...base, direction: 'transfer', articleId: null, toAccountId: 'card', paidOn: '2026-04-01', accruedOn: '2026-04-01' }
    expect(validateOperation(transfer, ctx)).toBeNull()
    expect(validateOperation({ ...transfer, articleId: 'rent' }, ctx)).toBe('У перевода между счетами нет статьи')
    expect(validateOperation({ ...transfer, toAccountId: null }, ctx)).toBe('Выберите счёт, на который переводите')
    expect(validateOperation({ ...transfer, toAccountId: 'kaspi' }, ctx)).toBe('Счета перевода должны быть разными')
  })

  it('actual operations cannot predate the account', () => {
    expect(validateOperation({ ...base, paidOn: '2025-12-31', accruedOn: '2025-12-31' }, ctx)).toContain('начала учёта')
    const transfer: OperationDraft = { ...base, direction: 'transfer', articleId: null, toAccountId: 'card', paidOn: '2026-02-01', accruedOn: '2026-02-01' }
    expect(validateOperation(transfer, ctx)).toContain('«Карта»')
  })

  it('planned operations may predate the account', () => {
    expect(validateOperation({ ...base, status: 'planned', paidOn: '2025-12-31', accruedOn: '2025-12-31' }, ctx)).toBeNull()
  })

  it('actual operations cannot be in the future', () => {
    expect(validateOperation({ ...base, paidOn: '2026-06-16', accruedOn: '2026-06-16' }, ctx)).toBe('Будущая дата — отметьте операцию как плановую')
    expect(validateOperation({ ...base, status: 'planned', paidOn: '2026-06-16', accruedOn: '2026-06-16' }, ctx)).toBeNull()
  })
})

describe('validateRecurrence', () => {
  const rule = { direction: 'out' as const, amount: 1000, accountId: 'kaspi', toAccountId: null, articleId: 'rent', dayOfMonth: 5, startsOn: '2026-07-05', endsOn: null }

  it('accepts a monthly rule', () => {
    expect(validateRecurrence(rule, ctx)).toBeNull()
  })

  it('rejects a bad day and an end before the start', () => {
    expect(validateRecurrence({ ...rule, dayOfMonth: 0 }, ctx)).toBe('День месяца — от 1 до 31')
    expect(validateRecurrence({ ...rule, endsOn: '2026-07-01' }, ctx)).toBe('Дата окончания должна быть не раньше даты начала')
  })
})

describe('validateArticle', () => {
  it('ties groups to kinds', () => {
    expect(validateArticle({ name: 'Выручка', kind: 'expense', pnlGroup: 'revenue' })).toBe('Выручка бывает только у статьи дохода')
    expect(validateArticle({ name: 'Аренда', kind: 'income', pnlGroup: 'opex' })).toBe('Себестоимость, операционные расходы и налоги — только у статьи расхода')
    expect(validateArticle({ name: 'Проценты', kind: 'expense', pnlGroup: 'finance' })).toBeNull()
    expect(validateArticle({ name: 'Кредит', kind: 'income', pnlGroup: null })).toBeNull()
    expect(validateArticle({ name: '  ', kind: 'income', pnlGroup: null })).toBe('Укажите название статьи')
  })
})

describe('openingDateConflict', () => {
  const ops: CfoOperation[] = [
    { id: 'o1', direction: 'out', amount: 1, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-02-10', accruedOn: '2026-02-10', status: 'actual', recurrenceId: null, recurrenceDate: null },
    { id: 'o2', direction: 'out', amount: 1, accountId: 'kaspi', toAccountId: null, articleId: 'rent', counterparty: null, comment: null, paidOn: '2026-01-05', accruedOn: '2026-01-05', status: 'planned', recurrenceId: null, recurrenceDate: null },
  ]

  it('flags actual operations earlier than the new date', () => {
    expect(openingDateConflict('kaspi', '2026-03-01', ops)).toBe('По счёту есть операции раньше этой даты (2026-02-10)')
    expect(openingDateConflict('kaspi', '2026-02-01', ops)).toBeNull()
    expect(openingDateConflict('card', '2026-03-01', ops)).toBeNull()
  })
})
