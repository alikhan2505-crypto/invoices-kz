import { describe, it, expect } from 'vitest'
import { resolveInvoiceVatType, resolveInvoiceKnp, isVatType } from './invoiceTax'

describe('resolveInvoiceVatType', () => {
  it('prefers the value stored on the invoice over the profile', () => {
    expect(resolveInvoiceVatType({ vat_type: 'no_vat' }, { vat_type: 'vat_16' })).toBe('no_vat')
    expect(resolveInvoiceVatType({ vat_type: 'vat_16' }, { vat_type: 'no_vat' })).toBe('vat_16')
  })

  it('falls back to the profile for old invoices without a stored value', () => {
    expect(resolveInvoiceVatType({ vat_type: null }, { vat_type: 'vat_16' })).toBe('vat_16')
    expect(resolveInvoiceVatType({}, { vat_type: 'vat_0' })).toBe('vat_0')
  })

  it('falls back to no_vat when neither side has a usable value', () => {
    expect(resolveInvoiceVatType(null, null)).toBe('no_vat')
    expect(resolveInvoiceVatType({ vat_type: 'garbage' }, { vat_type: '' })).toBe('no_vat')
    expect(resolveInvoiceVatType(undefined, { vat_type: null })).toBe('no_vat')
  })
})

describe('resolveInvoiceKnp', () => {
  it('uses the stored three-digit KNP', () => {
    expect(resolveInvoiceKnp({ knp: '710' })).toBe('710')
    expect(resolveInvoiceKnp({ knp: '119' })).toBe('119')
  })

  it('defaults to 849 when missing or malformed', () => {
    expect(resolveInvoiceKnp({ knp: null })).toBe('849')
    expect(resolveInvoiceKnp({})).toBe('849')
    expect(resolveInvoiceKnp(null)).toBe('849')
    expect(resolveInvoiceKnp({ knp: '84' })).toBe('849')
    expect(resolveInvoiceKnp({ knp: '8490' })).toBe('849')
    expect(resolveInvoiceKnp({ knp: '<b>1' })).toBe('849')
  })
})

describe('isVatType', () => {
  it('accepts only the three known modes', () => {
    expect(isVatType('no_vat')).toBe(true)
    expect(isVatType('vat_0')).toBe(true)
    expect(isVatType('vat_16')).toBe(true)
    expect(isVatType('vat_12')).toBe(false)
    expect(isVatType(null)).toBe(false)
    expect(isVatType(16)).toBe(false)
  })
})
