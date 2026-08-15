import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeFinanceSummary, computeBehavioralAnalytics, estimateGender } from './finance'
import type { Order } from './cabinetApi'

function makeOrder(code: string, totalPrice: number, creationTime: string, customerFirstName = 'Test'): Order {
  return { code, status: 'TRANSMITTED', customerFirstName, customerLastName: 'T', totalPrice, creationTime, items: [] }
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
      { date: '2026-08-10', revenue: 500, orderCount: 1, unitsSold: 0 },
      { date: '2026-08-12', revenue: 1000, orderCount: 1, unitsSold: 0 },
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

  it('sums item quantities into byDay.unitsSold, not just order count', async () => {
    const orderWithItems: Order = {
      code: '1', status: 'TRANSMITTED', customerFirstName: 'Test', customerLastName: 'T',
      totalPrice: 900, creationTime: '2026-08-12T10:00:00.000Z',
      items: [
        { code: 'a', name: 'A', imageUrl: null, quantity: 2, totalPrice: 600 },
        { code: 'b', name: 'B', imageUrl: null, quantity: 3, totalPrice: 300 },
      ],
    }
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _p = 0) =>
      status === 'KASPI_DELIVERY_TRANSMITTED' ? { total: 1, sessionExpired: false, orders: [orderWithItems] } : { total: 0, sessionExpired: false, orders: [] }
    )

    const summary = await computeFinanceSummary('cookies', 'merchant1', 7, fakeListOrders as any)

    expect(summary.byDay).toEqual([{ date: '2026-08-12', revenue: 900, orderCount: 1, unitsSold: 5 }])
  })
})

describe('estimateGender', () => {
  it('guesses female for names ending in а or я', () => {
    expect(estimateGender('Мария')).toBe('female')
    expect(estimateGender('Динара')).toBe('female')
  })

  it('guesses male for names not ending in а/я', () => {
    expect(estimateGender('Ерлан')).toBe('male')
    expect(estimateGender('Дмитрий')).toBe('male')
  })

  it('overrides the ending heuristic for known male exceptions', () => {
    expect(estimateGender('Никита')).toBe('male')
    expect(estimateGender('Илья')).toBe('male')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(estimateGender('  МАРИЯ  ')).toBe('female')
  })

  it('returns unknown for an empty name', () => {
    expect(estimateGender('')).toBe('unknown')
    expect(estimateGender('   ')).toBe('unknown')
  })

  it('documents a known real limitation: Kazakh female names not ending in а/я are misread as male', () => {
    // Not a bug -- pinning down the heuristic's actual, disclosed weakness
    // so a future change doesn't accidentally "fix" this silently without
    // updating the UI copy that already discloses it.
    expect(estimateGender('Айгерим')).toBe('male')
    expect(estimateGender('Айгуль')).toBe('male')
  })
})

describe('computeBehavioralAnalytics', () => {
  it('buckets orders by Kazakhstan-local weekday and hour, not server-local time', () => {
    // 2026-08-12T20:30:00Z is a Wednesday in UTC, but +5h KZ-local lands
    // at 01:30 the NEXT day (Thursday) -- the real point of this test:
    // confirms the function shifts by the fixed KZ offset before reading
    // weekday/hour, not whatever timezone the process happens to run in.
    const order = { code: '1', status: 'TRANSMITTED', customerFirstName: 'Ерлан', customerLastName: 'T', totalPrice: 1000, creationTime: '2026-08-12T20:30:00.000Z', items: [] } as Order
    const result = computeBehavioralAnalytics([order])

    const thursday = result.byWeekday.find(w => w.label === 'Чт')!
    expect(thursday.orderCount).toBe(1)
    expect(result.byHour.find(h => h.hour === 1)?.orderCount).toBe(1)
  })

  it('splits orders into before/after the 10th of the (KZ-local) month', () => {
    const orders = [
      makeOrder('1', 100, '2026-08-05T10:00:00.000Z'), // 5th -- before payday
      makeOrder('2', 200, '2026-08-10T10:00:00.000Z'), // 10th itself -- before payday (inclusive)
      makeOrder('3', 300, '2026-08-15T10:00:00.000Z'), // 15th -- after payday
    ]
    const result = computeBehavioralAnalytics(orders)

    expect(result.beforePayday).toEqual({ orderCount: 2, revenue: 300 })
    expect(result.afterPayday).toEqual({ orderCount: 1, revenue: 300 })
  })

  it('counts a real fixed-date Kazakhstan holiday order and labels it', () => {
    const orders = [makeOrder('1', 500, '2026-05-09T09:00:00.000Z')] // Victory Day
    const result = computeBehavioralAnalytics(orders)

    expect(result.holidayOrders).toEqual([{ date: '2026-05-09', label: 'День Победы', orderCount: 1, revenue: 500 }])
  })

  it('does not flag a non-holiday date', () => {
    const orders = [makeOrder('1', 500, '2026-08-12T09:00:00.000Z')]
    const result = computeBehavioralAnalytics(orders)

    expect(result.holidayOrders).toEqual([])
  })

  it('estimates gender split by customer first name', () => {
    const orders = [
      makeOrder('1', 100, '2026-08-12T10:00:00.000Z', 'Мария'),
      makeOrder('2', 100, '2026-08-12T10:00:00.000Z', 'Ерлан'),
      makeOrder('3', 100, '2026-08-12T10:00:00.000Z', ''),
    ]
    const result = computeBehavioralAnalytics(orders)

    expect(result.genderEstimate).toEqual({ male: 1, female: 1, unknown: 1 })
  })

  it('returns all 7 weekday buckets and all 24 hour buckets even with zero orders', () => {
    const result = computeBehavioralAnalytics([])

    expect(result.byWeekday).toHaveLength(7)
    expect(result.byHour).toHaveLength(24)
    expect(result.byWeekday.every(w => w.orderCount === 0)).toBe(true)
  })
})
