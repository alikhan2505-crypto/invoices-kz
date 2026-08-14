import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeFinanceSummary } from './finance'
import type { Order } from './cabinetApi'

function makeOrder(code: string, totalPrice: number, creationTime: string): Order {
  return { code, status: 'TRANSMITTED', customerFirstName: 'Test', customerLastName: 'T', totalPrice, creationTime, items: [] }
}

describe('computeFinanceSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sums revenue from both fulfilled statuses, excluding orders outside the window', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 2,
          sessionExpired: false,
          orders: [
            makeOrder('1', 1000, '2026-08-12T10:00:00.000Z'), // inside 7-day window
            makeOrder('2', 2000, '2026-08-01T10:00:00.000Z'), // outside 7-day window
          ],
        }
      }
      if (status === 'ARCHIVED') {
        return { total: 1, sessionExpired: false, orders: [makeOrder('3', 500, '2026-08-10T10:00:00.000Z')] }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(1500)
    expect(summary.orderCount).toBe(2)
    expect(summary.averageOrderValue).toBe(750)
    expect(summary.byDay).toEqual([
      { date: '2026-08-10', revenue: 500, orderCount: 1 },
      { date: '2026-08-12', revenue: 1000, orderCount: 1 },
    ])
    expect(summary.truncated).toBe(false)
    expect(summary.sessionExpired).toBe(false)
  })

  it('paginates a status until a short page, without assuming sort order', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, status: string, page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, sessionExpired: false, orders: [] }
      if (page === 0) {
        return { total: 12, sessionExpired: false, orders: Array.from({ length: 10 }, (_, i) => makeOrder(`p0-${i}`, 100, '2026-08-11T10:00:00.000Z')) }
      }
      if (page === 1) {
        return { total: 12, sessionExpired: false, orders: [makeOrder('p1-0', 100, '2026-08-12T10:00:00.000Z'), makeOrder('p1-1', 100, '2026-08-12T10:00:00.000Z')] }
      }
      throw new Error('should not fetch a third page when the second page is short')
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.orderCount).toBe(12)
    expect(summary.totalRevenue).toBe(1200)
    expect(summary.truncated).toBe(false)
  })

  it('sets truncated when a status hits the page cap', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, status: string, _page = 0) => {
      if (status !== 'KASPI_DELIVERY_TRANSMITTED') return { total: 0, sessionExpired: false, orders: [] }
      // Every page is a full page of 10 -- the loop never sees a short page
      // and must stop at the 20-page cap instead of looping forever.
      return { total: 500, sessionExpired: false, orders: Array.from({ length: 10 }, (_, i) => makeOrder(`x-${i}`, 100, '2026-08-11T10:00:00.000Z')) }
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.truncated).toBe(true)
    // 20 calls for TRANSMITTED (capped, not 50 = 500/10) + 1 for ARCHIVED
    // (immediately short-circuits on an empty page).
    expect(fakeListOrders).toHaveBeenCalledTimes(21)
  })

  it('returns a zero summary with no division by zero when there are no orders', async () => {
    const fakeListOrders = vi.fn(async () => ({ total: 0, sessionExpired: false, orders: [] }))

    const summary = await computeFinanceSummary('cookies', 'merchant1', 30, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(0)
    expect(summary.orderCount).toBe(0)
    expect(summary.averageOrderValue).toBe(0)
    expect(summary.byDay).toEqual([])
    expect(summary.truncated).toBe(false)
  })

  it('stops immediately and reports sessionExpired when the session is dead, without finishing the loop', async () => {
    const fakeListOrders = vi.fn(async (_sessionCookies: string, _merchantId: string, _status: string, _page = 0) => {
      return { total: 0, sessionExpired: true, orders: [] }
    })

    const summary = await computeFinanceSummary('cookies', 'merchant1', 30, fakeListOrders as any)

    expect(summary.sessionExpired).toBe(true)
    expect(summary.totalRevenue).toBe(0)
    expect(summary.orderCount).toBe(0)
    // Only the first call (TRANSMITTED, page 0) should happen -- the
    // expired-session short-circuit must break out of both the page loop
    // and the status loop, not keep burning requests against a dead session.
    expect(fakeListOrders).toHaveBeenCalledTimes(1)
  })
})
