import { describe, it, expect } from 'vitest'
import { isUtilityBarHiddenPath } from './utilityBarPaths'

describe('isUtilityBarHiddenPath', () => {
  it('hides the bar on public and marketing pages', () => {
    const hidden = [
      '/', '/login', '/privacy', '/terms', '/data-deletion', '/cashier-api', '/invoices-landing',
      '/lp/kaspi', '/view/abc', '/contract-view/abc', '/verify/abc', '/promo/CODE', '/shop/store',
      '/tools', '/tools/schet', '/tools/kk/schet', '/tools/en/margin',
      '/guides', '/guides/komissiya-kaspi', '/guides/kk/komissiya-kaspi',
    ]
    for (const p of hidden) expect(isUtilityBarHiddenPath(p), p).toBe(true)
  })

  it('hides the bar on the site generator, the planner and the products hub', () => {
    for (const p of ['/admin/site-generator', '/planner/salon-1', '/planner/x/y', '/products']) {
      expect(isUtilityBarHiddenPath(p), p).toBe(true)
    }
  })

  it('keeps the bar on the cabinet and product shells', () => {
    const shown = [
      '/dashboard', '/profile', '/profile/contracts', '/create', '/kaspi-shop', '/kaspi-shop/orders',
      '/kaspi-api', '/ai-agent', '/ai-agent/setup', '/cfo', '/admin', '/admin/users', '/upgrade',
      '/wildberries', '/auth/callback', '/emails', '/salon',
    ]
    for (const p of shown) expect(isUtilityBarHiddenPath(p), p).toBe(false)
  })

  it('does not match look-alike prefixes', () => {
    // exact-or-prefix-with-slash, never a bare startsWith
    for (const p of ['/toolsbox', '/guidesx', '/products/x', '/planner', '/privacy-policy', '/login/x', '/lp', '/shop']) {
      expect(isUtilityBarHiddenPath(p), p).toBe(false)
    }
  })

  it('treats a missing path as not hidden', () => {
    expect(isUtilityBarHiddenPath(null)).toBe(false)
    expect(isUtilityBarHiddenPath(undefined)).toBe(false)
    expect(isUtilityBarHiddenPath('')).toBe(false)
  })
})
