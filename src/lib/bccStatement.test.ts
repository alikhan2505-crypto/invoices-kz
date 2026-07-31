import { describe, it, expect } from 'vitest'
import { mapBccTransactions, BccTransaction } from './bccStatement'

function tx(overrides: Partial<BccTransaction> = {}): BccTransaction {
  return { valueDate: '2026-07-01', amount: 100000, partyIdn: 123456789012, purpose: 'Оплата по счету', ...overrides }
}

describe('mapBccTransactions', () => {
  it('maps BCC transaction fields to StatementRow', () => {
    const rows = mapBccTransactions([tx()])
    expect(rows).toEqual([{ date: '2026-07-01', amount: 100000, bin: '123456789012', description: 'Оплата по счету' }])
  })

  it('skips transactions with no partyIdn', () => {
    const rows = mapBccTransactions([tx({ partyIdn: '' })])
    expect(rows).toHaveLength(0)
  })

  it('normalizes a partyIdn containing formatting characters', () => {
    const rows = mapBccTransactions([tx({ partyIdn: '123 456 789 012' })])
    expect(rows[0].bin).toBe('123456789012')
  })

  it('defaults description to empty string when purpose is missing', () => {
    const rows = mapBccTransactions([tx({ purpose: undefined as any })])
    expect(rows[0].description).toBe('')
  })
})
