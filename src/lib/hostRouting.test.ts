import { describe, it, expect } from 'vitest'
import { productHostRewrite, apexToApiRedirect } from './hostRouting'

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

describe('apexToApiRedirect', () => {
  it('is off by default', () => {
    expect(apexToApiRedirect('invoices.kz', '/cashier-api', 'invoices.kz', false)).toBeNull()
  })
  it('redirects only the landing and docs on the apex when enabled', () => {
    expect(apexToApiRedirect('invoices.kz', '/cashier-api', 'invoices.kz', true)).toBe('https://api.invoices.kz/')
    expect(apexToApiRedirect('invoices.kz', '/cashier-api/', 'invoices.kz', true)).toBe('https://api.invoices.kz/')
    expect(apexToApiRedirect('invoices.kz', '/kaspi-api/docs', 'invoices.kz', true)).toBe('https://api.invoices.kz/docs')
    expect(apexToApiRedirect('invoices.kz', '/kaspi-api', 'invoices.kz', true)).toBeNull()
    expect(apexToApiRedirect('invoices.kz', '/', 'invoices.kz', true)).toBeNull()
  })
  it('never loops on the api host itself', () => {
    expect(apexToApiRedirect('api.invoices.kz', '/cashier-api', 'invoices.kz', true)).toBeNull()
  })
})
