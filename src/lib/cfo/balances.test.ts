import { describe, it, expect } from 'vitest'
import { accountBalanceAt, totalBalanceAt, totalDelta } from './balances'
import type { CfoAccount, CfoOperation } from './types'

const kaspi: CfoAccount = { id: 'kaspi', name: 'Kaspi', kind: 'bank', openingBalance: 100_000_000, openingDate: '2026-01-01', archived: false, sort: 1 }
const cash: CfoAccount = { id: 'cash', name: 'Касса', kind: 'cash', openingBalance: 5_000_000, openingDate: '2026-01-01', archived: false, sort: 2 }
const card: CfoAccount = { id: 'card', name: 'Карта', kind: 'card', openingBalance: 0, openingDate: '2026-03-01', archived: false, sort: 3 }

const op = (p: Partial<CfoOperation>): CfoOperation => ({ id: 'x', direction: 'out', amount: 0, accountId: 'kaspi', toAccountId: null, articleId: 'a', counterparty: null, comment: null, paidOn: '2026-01-01', accruedOn: '2026-01-01', status: 'actual', recurrenceId: null, recurrenceDate: null, ...p })

const ops: CfoOperation[] = [
  op({ id: 'o1', direction: 'in', amount: 20_000_000, paidOn: '2026-01-10' }),
  op({ id: 'o2', direction: 'out', amount: 5_000_000, paidOn: '2026-01-20' }),
  op({ id: 'o3', direction: 'transfer', amount: 3_000_000, toAccountId: 'cash', articleId: null, paidOn: '2026-01-25' }),
  op({ id: 'o4', direction: 'out', amount: 1_000_000, paidOn: '2026-01-28', status: 'planned' }),
]

describe('balances', () => {
  it('applies income, expense and transfers to the right accounts', () => {
    expect(accountBalanceAt(kaspi, ops, '2026-01-31')).toBe(112_000_000)
    expect(accountBalanceAt(cash, ops, '2026-01-31')).toBe(8_000_000)
  })

  it('ignores planned operations and dates after the cut-off', () => {
    expect(accountBalanceAt(kaspi, ops, '2026-01-15')).toBe(120_000_000)
  })

  it('an account before its opening date holds nothing', () => {
    expect(accountBalanceAt(card, ops, '2026-02-01')).toBe(0)
  })

  it('a transfer does not change the total', () => {
    expect(totalBalanceAt([kaspi, cash, card], ops, '2026-01-31')).toBe(120_000_000)
    expect(totalBalanceAt([kaspi, cash, card], ops, '2026-01-15')).toBe(125_000_000)
    expect(totalDelta(ops[2])).toBe(0)
    expect(totalDelta(ops[0])).toBe(20_000_000)
    expect(totalDelta(ops[1])).toBe(-5_000_000)
  })

  it('archived accounts still count', () => {
    expect(totalBalanceAt([kaspi, { ...cash, archived: true }], ops, '2026-01-31')).toBe(120_000_000)
  })
})


describe('loan accounts', () => {
  const mortgage: CfoAccount = { id: 'mortgage', name: 'Ипотека', kind: 'loan', openingBalance: -12_000_000, openingDate: '2026-01-01', archived: false, sort: 4 }
  const pay = op({ id: 'pay', direction: 'transfer', amount: 2_000_000, toAccountId: 'mortgage', articleId: null, paidOn: '2026-01-15' })

  it('cash excludes the loan, debt is the loan balance, a payment moves money from one to the other', async () => {
    const { cashBalanceAt, debtAt, cashDelta, loanIds } = await import('./balances')
    const all = [kaspi, cash, mortgage]
    expect(cashBalanceAt(all, [...ops, pay], '2026-01-31')).toBe(118_000_000)
    expect(debtAt(all, [...ops, pay], '2026-01-31')).toBe(-10_000_000)
    const loans = loanIds(all)
    expect(cashDelta(pay, loans)).toBe(-2_000_000)
    expect(cashDelta(op({ direction: 'transfer', amount: 1, accountId: 'mortgage', toAccountId: 'kaspi', articleId: null }), loans)).toBe(1)
    expect(cashDelta(ops[2], loans)).toBe(0) // перевод между своими денежными счетами
    expect(cashDelta(op({ direction: 'out', amount: 7, accountId: 'mortgage' }), loans)).toBe(0) // списание с кредитного счёта — не деньги
    expect(cashDelta(ops[0], loans)).toBe(20_000_000)
  })

  it('isCashOut / isCashIn classify by the effect on money', async () => {
    const { isCashIn, isCashOut, loanIds } = await import('./balances')
    const loans = loanIds([kaspi, cash, mortgage])
    const payout = op({ direction: 'transfer', amount: 1, accountId: 'mortgage', toAccountId: 'kaspi', articleId: null })
    const onLoan = op({ direction: 'out', amount: 7, accountId: 'mortgage' })
    expect([isCashOut(pay, loans), isCashIn(pay, loans)]).toEqual([true, false])
    expect([isCashOut(payout, loans), isCashIn(payout, loans)]).toEqual([false, true])
    expect([isCashOut(ops[1], loans), isCashIn(ops[0], loans)]).toEqual([true, true])
    expect([isCashOut(ops[2], loans), isCashIn(ops[2], loans)]).toEqual([false, false]) // свой перевод
    expect([isCashOut(onLoan, loans), isCashIn(onLoan, loans)]).toEqual([false, false]) // начисление на кредитном счёте
  })
})
