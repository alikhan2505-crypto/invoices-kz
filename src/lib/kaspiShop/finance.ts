import { listOrders, Order, PAGE_SIZE } from './cabinetApi'

// Real Kaspi cabinet's own nav has no finance section (confirmed live
// 2026-08-13 against two real accounts) -- this is a report WE compute
// from order data, not a passthrough of a Kaspi endpoint. See
// docs/superpowers/specs/2026-08-13-kaspi-shop-finance-design.md and
// docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md.
export type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number }[]
  truncated: boolean
  sessionExpired: boolean
}

// Only these two statuses represent fulfilled/completed orders -- an order
// still in NEW or UPAKOVKA hasn't happened yet and shouldn't count as
// revenue.
const REVENUE_STATUSES = ['KASPI_DELIVERY_TRANSMITTED', 'ARCHIVED']

// Per status, per request -- a real, deliberate v1 limit, not an oversight.
// A seller past this volume in the selected window sees a totalRevenue
// computed from a subset, with truncated:true telling the UI to say so.
const MAX_PAGES_PER_STATUS = 20

export async function computeFinanceSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number,
  listOrdersFn: typeof listOrders = listOrders
): Promise<FinanceSummary> {
  const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000
  const allOrders: Order[] = []
  let truncated = false
  let sessionExpired = false

  statusLoop: for (const status of REVENUE_STATUSES) {
    let page = 0
    let fetchedForStatus = 0
    let totalForStatus = 0
    while (page < MAX_PAGES_PER_STATUS) {
      const result = await listOrdersFn(sessionCookies, merchantId, status, page)
      if (result.sessionExpired) {
        // A dead session won't recover mid-loop -- stop paginating
        // entirely rather than burning MAX_PAGES_PER_STATUS more 401s.
        sessionExpired = true
        break statusLoop
      }
      allOrders.push(...result.orders)
      fetchedForStatus += result.orders.length
      totalForStatus = result.total
      page += 1
      if (result.orders.length < PAGE_SIZE) break // real last page (short of a full page)
    }
    if (fetchedForStatus < totalForStatus) truncated = true
  }

  const inWindow = allOrders.filter(o => new Date(o.creationTime).getTime() >= cutoffMs)

  const byDayMap = new Map<string, { revenue: number; orderCount: number }>()
  for (const o of inWindow) {
    const date = o.creationTime.slice(0, 10) // YYYY-MM-DD, real creationTime is ISO 8601
    const bucket = byDayMap.get(date) || { revenue: 0, orderCount: 0 }
    bucket.revenue += o.totalPrice
    bucket.orderCount += 1
    byDayMap.set(date, bucket)
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, orderCount: v.orderCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalRevenue = inWindow.reduce((sum, o) => sum + o.totalPrice, 0)
  const orderCount = inWindow.length
  const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

  return { totalRevenue, orderCount, averageOrderValue, byDay, truncated, sessionExpired }
}
