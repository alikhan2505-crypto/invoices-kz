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
