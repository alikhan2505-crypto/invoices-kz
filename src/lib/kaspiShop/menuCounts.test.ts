import { describe, it, expect } from 'vitest'
import {
  EMPTY_MENU_COUNTS,
  formatBadgeCount,
  menuCountKeyForHref,
  mergeMenuCounts,
  normalizeMenuCounts,
  ordersInWork,
  refundsNeedingAttention,
} from './menuCounts'
import { menuCountDict, menuCountLabel } from '@/lib/i18n/menuCounts'

describe('formatBadgeCount', () => {
  it('shows nothing for 0, unknown and garbage', () => {
    expect(formatBadgeCount(0)).toBeNull()
    expect(formatBadgeCount(null)).toBeNull()
    expect(formatBadgeCount(undefined)).toBeNull()
    expect(formatBadgeCount(-3)).toBeNull()
    expect(formatBadgeCount(NaN)).toBeNull()
    expect(formatBadgeCount(0.4)).toBeNull()
  })
  it('shows the number up to 99 and caps at 99+', () => {
    expect(formatBadgeCount(1)).toBe('1')
    expect(formatBadgeCount(12)).toBe('12')
    expect(formatBadgeCount(99)).toBe('99')
    expect(formatBadgeCount(100)).toBe('99+')
    expect(formatBadgeCount(105)).toBe('99+')
  })
})

describe('menuCountKeyForHref', () => {
  it('maps only the sections where a count means "needs action"', () => {
    expect(menuCountKeyForHref('/kaspi-shop/orders')).toBe('orders')
    expect(menuCountKeyForHref('/kaspi-shop/refunds')).toBe('refunds')
    expect(menuCountKeyForHref('/kaspi-shop/pending-products')).toBe('pendingProducts')
    for (const href of ['/kaspi-shop', '/kaspi-shop/overview', '/kaspi-shop/finance', '/kaspi-shop/niches', '/kaspi-shop/profit', '/kaspi-shop/margin', '/kaspi-shop/reviews', '/kaspi-shop/quality', '/kaspi-shop/nkt', '/kaspi-shop/removed', '/kaspi-shop/storefront']) {
      expect(menuCountKeyForHref(href)).toBeNull()
    }
  })
})

describe('normalizeMenuCounts', () => {
  it('keeps valid numbers and floors fractions', () => {
    expect(normalizeMenuCounts({ orders: 12, refunds: 3.9, pendingProducts: 0 })).toEqual({ orders: 12, refunds: 3, pendingProducts: 0 })
  })
  it('turns missing and invalid values into null (unknown)', () => {
    expect(normalizeMenuCounts({ orders: '5', refunds: -1, pendingProducts: NaN })).toEqual(EMPTY_MENU_COUNTS)
    expect(normalizeMenuCounts(null)).toEqual(EMPTY_MENU_COUNTS)
    expect(normalizeMenuCounts('oops')).toEqual(EMPTY_MENU_COUNTS)
    expect(normalizeMenuCounts({ orders: 4 })).toEqual({ orders: 4, refunds: null, pendingProducts: null })
  })
  it('drops fields it does not know about', () => {
    expect(normalizeMenuCounts({ orders: 1, sessionExpired: true, secret: 'x' })).toEqual({ orders: 1, refunds: null, pendingProducts: null })
  })
})

describe('mergeMenuCounts', () => {
  it('a fresh number replaces the old one, a null keeps the old one, a real 0 clears it', () => {
    const prev = { orders: 5, refunds: 2, pendingProducts: 7 }
    expect(mergeMenuCounts(prev, { orders: 9, refunds: null, pendingProducts: 0 })).toEqual({ orders: 9, refunds: 2, pendingProducts: 0 })
  })
})

describe('ordersInWork', () => {
  it('sums NEW + packing + transfer, same as the Обзор page', () => {
    expect(ordersInWork({
      NEW: 4,
      KASPI_DELIVERY_CARGO_ASSEMBLY: 5,
      KASPI_DELIVERY_WAIT_FOR_COURIER: 3,
      KASPI_DELIVERY_TRANSMITTED: 40,
      ARCHIVED: 900,
      PICKUP: 8,
    })).toBe(12)
  })
  it('is 0 when the cabinet answered but nothing is in work, null when it did not answer', () => {
    expect(ordersInWork({ NEW: 0, ARCHIVED: 10 })).toBe(0)
    expect(ordersInWork({})).toBeNull()
    expect(ordersInWork(null)).toBeNull()
  })
})

describe('refundsNeedingAttention', () => {
  it('sums the attention tabs and ignores closed ones', () => {
    expect(refundsNeedingAttention([
      { tab: 'NEW', total: 1 },
      { tab: 'ON_DELIVERY', total: 2 },
      { tab: 'WAITING_DECISION', total: 0 },
      { tab: 'DISPUTE', total: 4 },
      { tab: 'CLOSED', total: 322 },
    ])).toBe(7)
  })
  it('is null (unknown) for an empty or missing list', () => {
    expect(refundsNeedingAttention([])).toBeNull()
    expect(refundsNeedingAttention(null)).toBeNull()
  })
})

describe('menuCountLabel', () => {
  it('is localised for ru / kk / en and has no gaps', () => {
    expect(menuCountLabel(12, 'ru')).toBe('12 в работе')
    expect(menuCountLabel(12, 'kk')).toBe('12 өңделуде')
    expect(menuCountLabel(12, 'en')).toBe('12 in progress')
    for (const lang of ['ru', 'kk', 'en'] as const) expect(menuCountDict[lang].inWork.length).toBeGreaterThan(0)
  })
})
