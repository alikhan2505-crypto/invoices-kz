import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeProfitSummary } from './profit'
import type { Order } from './cabinetApi'

function makeOrder(code: string, creationTime: string, items: { code: string; name: string; imageUrl: string | null; quantity: number; totalPrice: number }[]): Order {
  const totalPrice = items.reduce((sum, i) => sum + i.totalPrice, 0)
  return { code, status: 'TRANSMITTED', customerFirstName: 'Test', customerLastName: 'T', totalPrice, creationTime, items }
}

describe('computeProfitSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('attributes revenue per product and keeps totalRevenue consistent with the per-product sum', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [
              { code: 'SKU1', name: 'Товар 1', imageUrl: 'https://cdn/1.jpg', quantity: 2, totalPrice: 2000 },
              { code: 'SKU2', name: 'Товар 2', imageUrl: 'https://cdn/2.jpg', quantity: 1, totalPrice: 500 },
            ]),
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const catalog = [
      { kaspiMasterSku: 'SKU1', trackedProductId: 'tp-1', cogsAmount: 300 },
      { kaspiMasterSku: 'SKU2', trackedProductId: 'tp-2', cogsAmount: null },
    ]

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, catalog, { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(2500)
    const sumOfProducts = summary.products.reduce((sum, p) => sum + p.revenue, 0)
    expect(sumOfProducts).toBe(summary.totalRevenue)

    const sku1 = summary.products.find(p => p.kaspiMasterSku === 'SKU1')!
    expect(sku1).toMatchObject({ trackedProductId: 'tp-1', unitsSold: 2, revenue: 2000, cogsAmount: 300, cogsTotal: 600, profit: 1400 })

    const sku2 = summary.products.find(p => p.kaspiMasterSku === 'SKU2')!
    expect(sku2).toMatchObject({ trackedProductId: 'tp-2', unitsSold: 1, revenue: 500, cogsAmount: null, cogsTotal: null, profit: null })
  })

  it('uses the first-encountered name/imageUrl for a SKU across multiple orders (documents actual behavior, not aggregated/deduped)', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 2,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [{ code: 'SKU1', name: 'Первое имя', imageUrl: 'https://cdn/first.jpg', quantity: 1, totalPrice: 500 }]),
            makeOrder('2', '2026-08-13T11:00:00.000Z', [{ code: 'SKU1', name: 'Второе имя', imageUrl: 'https://cdn/second.jpg', quantity: 1, totalPrice: 500 }]),
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.products).toHaveLength(1)
    expect(summary.products[0]).toMatchObject({ productName: 'Первое имя', imageUrl: 'https://cdn/first.jpg', unitsSold: 2, revenue: 1000 })
  })

  it('sorts products by revenue descending', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [
              { code: 'CHEAP', name: 'Дешёвый', imageUrl: null, quantity: 1, totalPrice: 100 },
              { code: 'PRICEY', name: 'Дорогой', imageUrl: null, quantity: 1, totalPrice: 900 },
            ]),
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.products.map(p => p.kaspiMasterSku)).toEqual(['PRICEY', 'CHEAP'])
  })

  it('counts a product with no catalog match as revenue with no COGS, not an error', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'UNKNOWN', name: 'Товар вне каталога', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(1000)
    expect(summary.products[0]).toMatchObject({ trackedProductId: null, cogsAmount: null, cogsTotal: null, profit: null })
    expect(summary.productsWithoutCogsCount).toBe(1)
  })

  it('missing COGS does not block netProfit, only flags productsWithoutCogsCount', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'SKU1', name: 'Товар 1', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })
    const catalog = [{ kaspiMasterSku: 'SKU1', trackedProductId: 'tp-1', cogsAmount: null }]

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, catalog, { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalCogsKnown).toBe(0)
    expect(summary.productsWithoutCogsCount).toBe(1)
    expect(summary.netProfit).toBe(1000) // revenue - 0 cogs - 0 ads - 0 commission
  })

  it('missing commission rate results in commissionAmount 0, not a blocked netProfit', async () => {
    const fakeListOrders = vi.fn(async () => ({ total: 0, sessionExpired: false, orders: [] }))

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.commissionRatePercent).toBe(null)
    expect(summary.commissionAmount).toBe(0)
  })

  it('applies the commission rate to totalRevenue when configured', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'SKU1', name: 'Товар 1', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, otherAmount: 0, configured: false }, 10, fakeListOrders as any)

    expect(summary.commissionAmount).toBe(100)
    expect(summary.netProfit).toBe(900)
  })

  it('subtracts configured ad spend from netProfit', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 1,
          sessionExpired: false,
          orders: [makeOrder('1', '2026-08-13T10:00:00.000Z', [
            { code: 'SKU1', name: 'Товар 1', imageUrl: null, quantity: 1, totalPrice: 1000 },
          ])],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 150, otherAmount: 0, configured: true }, null, fakeListOrders as any)

    expect(summary.adSpend).toBe(150)
    expect(summary.adSpendConfigured).toBe(true)
    expect(summary.netProfit).toBe(850)
  })

  it('excludes orders outside the sinceDays window', async () => {
    const fakeListOrders = vi.fn(async (_c: string, _m: string, status: string, _page = 0) => {
      if (status === 'KASPI_DELIVERY_TRANSMITTED') {
        return {
          total: 2,
          sessionExpired: false,
          orders: [
            makeOrder('1', '2026-08-13T10:00:00.000Z', [{ code: 'SKU1', name: 'In', imageUrl: null, quantity: 1, totalPrice: 1000 }]), // inside 7-day window
            makeOrder('2', '2026-08-01T10:00:00.000Z', [{ code: 'SKU2', name: 'Out', imageUrl: null, quantity: 1, totalPrice: 2000 }]), // outside
          ],
        }
      }
      return { total: 0, sessionExpired: false, orders: [] }
    })

    const summary = await computeProfitSummary('cookies', 'merchant1', 7, [], { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.totalRevenue).toBe(1000)
  })

  it('stops immediately and reports sessionExpired when the session is dead', async () => {
    const fakeListOrders = vi.fn(async () => ({ total: 0, sessionExpired: true, orders: [] }))

    const summary = await computeProfitSummary('cookies', 'merchant1', 30, [], { amount: 0, otherAmount: 0, configured: false }, null, fakeListOrders as any)

    expect(summary.sessionExpired).toBe(true)
    expect(summary.totalRevenue).toBe(0)
    expect(fakeListOrders).toHaveBeenCalledTimes(1)
  })
})
