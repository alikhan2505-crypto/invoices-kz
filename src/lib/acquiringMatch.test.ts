import { describe, it, expect } from 'vitest'
import { normalizeBin, findMatches, OpenInvoice, StatementRow } from './acquiringMatch'

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  return { date: '2026-07-01', amount: 100000, bin: '123456789012', description: 'Оплата', ...overrides }
}

function invoice(overrides: Partial<OpenInvoice> = {}): OpenInvoice {
  return { id: 'inv-1', number: 'INV-0001', client_name: 'ТОО Ромашка', client_bin: '123456789012', amount: 100000, ...overrides }
}

describe('normalizeBin', () => {
  it('strips non-digit characters', () => {
    expect(normalizeBin('123 456 789 012')).toBe('123456789012')
    expect(normalizeBin('БИН: 123456789012')).toBe('123456789012')
  })
})

describe('findMatches', () => {
  it('matches when BIN and amount both match exactly', () => {
    const matches = findMatches([row()], [invoice()])
    expect(matches).toHaveLength(1)
    expect(matches[0].invoice.id).toBe('inv-1')
  })

  it('does not match when BIN differs', () => {
    const matches = findMatches([row({ bin: '999999999999' })], [invoice()])
    expect(matches).toHaveLength(0)
  })

  it('does not match when amount differs', () => {
    const matches = findMatches([row({ amount: 50000 })], [invoice()])
    expect(matches).toHaveLength(0)
  })

  it('skips invoices with no client_bin', () => {
    const matches = findMatches([row()], [invoice({ client_bin: null })])
    expect(matches).toHaveLength(0)
  })

  it('picks only the invoice whose amount matches, among several with the same BIN', () => {
    const invoices = [
      invoice({ id: 'inv-2', number: 'INV-0002', amount: 50000 }),
      invoice({ id: 'inv-3', number: 'INV-0003', amount: 100000 }),
    ]
    const matches = findMatches([row({ amount: 100000 })], invoices)
    expect(matches).toHaveLength(1)
    expect(matches[0].invoice.id).toBe('inv-3')
  })
})
