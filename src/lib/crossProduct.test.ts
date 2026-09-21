import { describe, it, expect } from 'vitest'
import { crossProductHref, parseHandoff, handoffReturnHref, handoffProductName } from './crossProduct'

describe('crossProductHref', () => {
  it('points at the product host in production and carries the way back', () => {
    const href = crossProductHref({ to: 'kaspiApi', path: '/kaspi-api', from: 'kaspiShop', back: '/kaspi-shop/storefront', hostname: 'kaspi.invoices.kz' })
    expect(href).toBe('https://api.invoices.kz/kaspi-api?from=kaspiShop&back=%2Fkaspi-shop%2Fstorefront')
  })
  it('stays on the current host on localhost and previews', () => {
    expect(crossProductHref({ to: 'aiAgent', path: '/ai-agent/settings', from: 'kaspiShop', back: '/kaspi-shop', hostname: 'localhost' }))
      .toBe('/ai-agent/settings?from=kaspiShop&back=%2Fkaspi-shop')
  })
  it('appends to an existing query string', () => {
    expect(crossProductHref({ to: 'aiAgent', path: '/ai-agent/settings?new=1', from: 'kaspiShop', back: '/kaspi-shop', hostname: 'localhost' }))
      .toBe('/ai-agent/settings?new=1&from=kaspiShop&back=%2Fkaspi-shop')
  })
})

describe('parseHandoff', () => {
  it('reads a valid handoff', () => {
    const h = parseHandoff('?from=kaspiShop&back=%2Fkaspi-shop%2Fstorefront')
    expect(h).toEqual({ from: 'kaspiShop', back: '/kaspi-shop/storefront' })
    expect(handoffProductName(h!)).toBe('Kaspi Bot')
    expect(handoffReturnHref(h!, 'api.invoices.kz')).toBe('https://kaspi.invoices.kz/kaspi-shop/storefront')
    expect(handoffReturnHref(h!, 'localhost')).toBe('/kaspi-shop/storefront')
  })
  it('rejects unknown products and unsafe or foreign paths', () => {
    expect(parseHandoff('?from=evil&back=/kaspi-shop')).toBeNull()
    expect(parseHandoff('?from=kaspiShop&back=https://evil.com')).toBeNull()
    expect(parseHandoff('?from=kaspiShop&back=//evil.com')).toBeNull()
    expect(parseHandoff('?from=kaspiShop&back=/\\evil.com')).toBeNull()
    expect(parseHandoff('?from=kaspiShop&back=/admin')).toBeNull()
    expect(parseHandoff('?from=kaspiShop&back=/kaspi-shopx')).toBeNull()
    expect(parseHandoff('?from=kaspiShop')).toBeNull()
    expect(parseHandoff('')).toBeNull()
  })
})
