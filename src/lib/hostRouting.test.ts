import { describe, it, expect } from 'vitest'
import { productHostRewrite } from './hostRouting'

describe('productHostRewrite', () => {
  it('api host: root shows the Cashier API landing, /docs the docs', () => {
    expect(productHostRewrite('api.invoices.kz', '/', 'invoices.kz')).toBe('/cashier-api')
    expect(productHostRewrite('api.invoices.kz', '/docs', 'invoices.kz')).toBe('/kaspi-api/docs')
    expect(productHostRewrite('api.invoices.kz', '/docs/', 'invoices.kz')).toBe('/kaspi-api/docs')
  })
  it('api host: other paths pass through', () => {
    expect(productHostRewrite('api.invoices.kz', '/kaspi-api', 'invoices.kz')).toBeNull()
    expect(productHostRewrite('api.invoices.kz', '/login', 'invoices.kz')).toBeNull()
  })
  it('other hosts are untouched', () => {
    expect(productHostRewrite('invoices.kz', '/', 'invoices.kz')).toBeNull()
    expect(productHostRewrite('www.invoices.kz', '/', 'invoices.kz')).toBeNull()
    expect(productHostRewrite('salon.invoices.kz', '/', 'invoices.kz')).toBeNull()
    expect(productHostRewrite('api.evil.com', '/', 'invoices.kz')).toBeNull()
    expect(productHostRewrite('x.api.invoices.kz', '/', 'invoices.kz')).toBeNull()
    expect(productHostRewrite('constructor.invoices.kz', '/', 'invoices.kz')).toBeNull()
  })
})
