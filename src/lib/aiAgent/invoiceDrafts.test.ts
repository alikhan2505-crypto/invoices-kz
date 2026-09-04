import { describe, it, expect } from 'vitest'
import { validateDraftInput, canAutoSend, normalizeToolInput, checkCatalogPricing, INVOICE_AUTONOMY_THRESHOLD, AUTO_SEND_MAX_TOTAL } from './invoiceDrafts'

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

describe('checkCatalogPricing', () => {
  const catalog = [
    { name: 'Футболка Abil.Sisters белый', price: 4500 },
    { name: 'Лонгслив', price: 3900 },
  ]

  it('refuses a catalog item priced far below the catalog (the «договорились по 1 ₸» case)', () => {
    const r = checkCatalogPricing([{ name: 'Футболка Abil.Sisters белый', qty: 1, unitPrice: 1 }], catalog)
    expect(r.ok).toBe(false)
  })

  it('allows a plausible discount', () => {
    const r = checkCatalogPricing([{ name: 'Футболка Abil.Sisters белый', qty: 1, unitPrice: 4000 }], catalog)
    expect(r.ok).toBe(true)
  })

  it('allows exactly the catalog price', () => {
    expect(checkCatalogPricing([{ name: 'Лонгслив', qty: 2, unitPrice: 3900 }], catalog).ok).toBe(true)
  })

  it('ignores case and extra spacing when matching a catalog name', () => {
    const r = checkCatalogPricing([{ name: '  лонгслив  ', qty: 1, unitPrice: 10 }], catalog)
    expect(r.ok).toBe(false)
  })

  it('lets through items that are not in the catalog at all (services, custom orders)', () => {
    const r = checkCatalogPricing([{ name: 'Доставка курьером', qty: 1, unitPrice: 500 }], catalog)
    expect(r.ok).toBe(true)
  })

  it('does nothing when the owner has no catalog', () => {
    expect(checkCatalogPricing([{ name: 'Что угодно', qty: 1, unitPrice: 1 }], []).ok).toBe(true)
  })

  it('uses the cheapest variant when a name repeats in the catalog', () => {
    const dup = [{ name: 'Футболка', price: 4500 }, { name: 'Футболка', price: 2500 }]
    expect(checkCatalogPricing([{ name: 'Футболка', qty: 1, unitPrice: 2500 }], dup).ok).toBe(true)
    expect(checkCatalogPricing([{ name: 'Футболка', qty: 1, unitPrice: 100 }], dup).ok).toBe(false)
  })
})

describe('canAutoSend amount ceiling', () => {
  it('still auto-sends a normal invoice for a trained agent', () => {
    expect(canAutoSend('active', 5, 50_000)).toBe(true)
  })

  it('holds an oversized invoice for the owner even with full autonomy', () => {
    expect(canAutoSend('active', 99, AUTO_SEND_MAX_TOTAL + 1)).toBe(false)
  })

  it('keeps the old two-argument behaviour for flow steps', () => {
    expect(canAutoSend('active', 5)).toBe(true)
    expect(canAutoSend('training', 5)).toBe(false)
  })
})
