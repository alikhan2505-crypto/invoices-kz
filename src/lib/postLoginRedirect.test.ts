import { describe, it, expect } from 'vitest'
import { postLoginRedirectFromSearch } from './postLoginRedirect'

describe('postLoginRedirectFromSearch', () => {
  it('accepts allowlisted product cabinets', () => {
    expect(postLoginRedirectFromSearch('?next=/kaspi-shop')).toBe('/kaspi-shop')
    expect(postLoginRedirectFromSearch('?ref=x&next=/ai-agent')).toBe('/ai-agent')
  })
  it('drops anything else (no open redirect)', () => {
    expect(postLoginRedirectFromSearch('?next=https://evil.com')).toBeNull()
    expect(postLoginRedirectFromSearch('?next=//evil.com')).toBeNull()
    expect(postLoginRedirectFromSearch('?next=/admin')).toBeNull()
    expect(postLoginRedirectFromSearch('')).toBeNull()
  })
})
