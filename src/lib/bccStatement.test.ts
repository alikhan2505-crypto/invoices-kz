import { describe, it, expect } from 'vitest'
import { mapBccTransactions, BccTransaction } from './bccStatement'

function tx(overrides: Partial<BccTransaction> = {}): BccTransaction {
  return { valueDate: '2026-07-01', amount: 100000, partyIdn: 123456789012, purpose: 'Оплата по счету', dbcrfl: 1, ...overrides }
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

  // A BCC statement carries outgoing transactions too — one the user SENT to a
  // counterparty whose BIN and amount match an open invoice must never surface
  // as a "payment received". dbcrfl === 1 is treated as credit/incoming; see
  // the warning comment on the filter in bccStatement.ts — the real-world value
  // mapping still needs confirmation against a live BCC pull.
  it('keeps only credit (incoming) transactions, dropping debits', () => {
    const rows = mapBccTransactions([
      tx({ dbcrfl: 1, amount: 100000 }),
      tx({ dbcrfl: 0, amount: 250000 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(100000)
  })

  it('skips transactions whose dbcrfl is anything other than the credit flag', () => {
    expect(mapBccTransactions([tx({ dbcrfl: 0 })])).toHaveLength(0)
    expect(mapBccTransactions([tx({ dbcrfl: 2 })])).toHaveLength(0)
    expect(mapBccTransactions([tx({ dbcrfl: undefined as any })])).toHaveLength(0)
  })
})
