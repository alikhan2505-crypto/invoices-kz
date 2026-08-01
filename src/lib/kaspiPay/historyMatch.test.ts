import { describe, it, expect } from 'vitest'
import { matchOperation, OpenInvoiceForMatch, MatchResult } from './historyMatch'
import { KaspiHistoryOperation } from './client'

function op(amount: number, direction: 'in' | 'out' = 'in'): KaspiHistoryOperation {
  return { id: '1', orderNumber: 'QR1', regDate: '2026-08-01T00:00:00+05:00', amount, clientName: 'Test', direction }
}

function invoice(id: string, amount: number): OpenInvoiceForMatch {
  return { id, number: `INV-${id}`, client_name: 'Client', amount }
}

describe('matchOperation', () => {
  it('returns unmatched when no open invoice has this amount', () => {
    const result = matchOperation(op(500), [invoice('a', 1000)])
    expect(result.kind).toBe('unmatched')
  })

  it('returns unambiguous when exactly one open invoice matches the amount', () => {
    const result = matchOperation(op(1000), [invoice('a', 1000), invoice('b', 2000)])
    expect(result.kind).toBe('unambiguous')
    expect((result as any).invoice.id).toBe('a')
  })

  it('returns ambiguous when two or more open invoices share the amount', () => {
    const result = matchOperation(op(1000), [invoice('a', 1000), invoice('b', 1000)])
    expect(result.kind).toBe('ambiguous')
    expect((result as any).invoices).toHaveLength(2)
  })

  it('returns unmatched for an empty invoice list', () => {
    const result = matchOperation(op(1000), [])
    expect(result.kind).toBe('unmatched')
  })

  it('never matches an outgoing operation, even if the amount coincides', () => {
    const result = matchOperation(op(1000, 'out'), [invoice('a', 1000)])
    expect(result.kind).toBe('unmatched')
  })
})
