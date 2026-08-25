import { describe, it, expect } from 'vitest'
import { validateDraftInput, canAutoSend, normalizeToolInput, INVOICE_AUTONOMY_THRESHOLD } from './invoiceDrafts'

describe('validateDraftInput', () => {
  it('accepts valid items, trims names, computes total server-side', () => {
    const r = validateDraftInput([{ name: ' Термокружка ', qty: 2, unit_price: 1200 }])
    expect(r).toEqual({ ok: true, items: [{ name: 'Термокружка', qty: 2, unitPrice: 1200 }], total: 2400 })
  })
  it('caps item names at 200 chars', () => {
    const r = validateDraftInput([{ name: 'x'.repeat(500), qty: 1, unit_price: 1 }])
    expect(r.ok && r.items[0].name.length === 200).toBe(true)
  })
  it('accepts camelCase unitPrice too (flow-step path uses it)', () => {
    const r = validateDraftInput([{ name: 'X', qty: 1, unitPrice: 500 }])
    expect(r.ok && r.total === 500).toBe(true)
  })
  it('rejects: empty list, blank name, qty<1, non-integer qty, price<=0, >20 items, total over cap', () => {
    expect(validateDraftInput([]).ok).toBe(false)
    expect(validateDraftInput([{ name: ' ', qty: 1, unit_price: 1 }]).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 0, unit_price: 1 }]).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 1.5, unit_price: 1 }]).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 1, unit_price: 0 }]).ok).toBe(false)
    expect(validateDraftInput(Array.from({ length: 21 }, () => ({ name: 'X', qty: 1, unit_price: 1 }))).ok).toBe(false)
    expect(validateDraftInput([{ name: 'X', qty: 1, unit_price: 10_000_001 }]).ok).toBe(false)
    expect(validateDraftInput('not-an-array' as any).ok).toBe(false)
  })
})

describe('canAutoSend', () => {
  it('requires active agent AND >= threshold approvals', () => {
    expect(canAutoSend('active', INVOICE_AUTONOMY_THRESHOLD)).toBe(true)
    expect(canAutoSend('active', INVOICE_AUTONOMY_THRESHOLD - 1)).toBe(false)
    expect(canAutoSend('training', 100)).toBe(false)
  })
})

describe('normalizeToolInput', () => {
  it('prefers explicit tool values, falls back to collected conversation data', () => {
    const r = normalizeToolInput({ items: [], customer_name: 'Айдос' }, { name: 'Игнор', phone: '7777' })
    expect(r.customerName).toBe('Айдос')
    expect(r.customerPhone).toBe('7777')
  })
  it('returns empty strings when nothing known (caller decides to ask)', () => {
    const r = normalizeToolInput({}, {})
    expect(r.customerName).toBe('')
    expect(r.customerPhone).toBe('')
  })
})
