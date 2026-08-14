import { listOrders, Order, PAGE_SIZE } from './cabinetApi'

// Real unit economics per product/store -- revenue minus COGS minus ad
// spend minus commission. Kaspi has no API for accurate commission or ad
// spend (confirmed live 2026-08-14, see
// docs/superpowers/specs/2026-08-14-kaspi-shop-profit-design.md), so both
// are seller-entered here. Join key for attributing order revenue to a
// catalog product is kaspi_master_sku, NOT kaspi_sku -- confirmed live
// against a real order (order item code matched kaspi_master_sku exactly;
// kaspi_sku for that same row was a different value, the seller's own
// per-offer identifier).
export type ProductProfit = {
  kaspiMasterSku: string
  trackedProductId: string | null
  productName: string
  imageUrl: string | null
  unitsSold: number
  revenue: number
  cogsAmount: number | null
  cogsTotal: number | null
  profit: number | null
}

export type ProfitSummary = {
  products: ProductProfit[]
  totalRevenue: number
  totalCogsKnown: number
  productsWithoutCogsCount: number
  adSpend: number
  adSpendConfigured: boolean
  commissionRatePercent: number | null
  commissionAmount: number
  netProfit: number
  truncated: boolean
  sessionExpired: boolean
}

const REVENUE_STATUSES = ['KASPI_DELIVERY_TRANSMITTED', 'ARCHIVED']
const MAX_PAGES_PER_STATUS = 20

export async function computeProfitSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number,
  catalog: { kaspiMasterSku: string; trackedProductId: string; cogsAmount: number | null }[],
  adSpend: { amount: number; configured: boolean },
  commissionRatePercent: number | null,
  listOrdersFn: typeof listOrders = listOrders
): Promise<ProfitSummary> {
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
        sessionExpired = true
        break statusLoop
      }
      allOrders.push(...result.orders)
      fetchedForStatus += result.orders.length
      totalForStatus = result.total
      page += 1
      if (result.orders.length < PAGE_SIZE) break
    }
    if (fetchedForStatus < totalForStatus) truncated = true
  }

  const inWindow = allOrders.filter(o => new Date(o.creationTime).getTime() >= cutoffMs)

  const catalogBySku = new Map(catalog.map(c => [c.kaspiMasterSku, c]))
  const bySku = new Map<string, { unitsSold: number; revenue: number; name: string; imageUrl: string | null }>()
  for (const order of inWindow) {
    for (const item of order.items) {
      const bucket = bySku.get(item.code) || { unitsSold: 0, revenue: 0, name: item.name, imageUrl: item.imageUrl }
      bucket.unitsSold += item.quantity
      bucket.revenue += item.totalPrice
      bySku.set(item.code, bucket)
    }
  }

  const products: ProductProfit[] = []
  let totalCogsKnown = 0
  let productsWithoutCogsCount = 0
  for (const [sku, agg] of bySku.entries()) {
    const catalogEntry = catalogBySku.get(sku)
    const cogsAmount = catalogEntry?.cogsAmount ?? null
    const cogsTotal = cogsAmount !== null ? cogsAmount * agg.unitsSold : null
    if (cogsTotal !== null) totalCogsKnown += cogsTotal
    else productsWithoutCogsCount += 1
    products.push({
      kaspiMasterSku: sku,
      trackedProductId: catalogEntry?.trackedProductId ?? null,
      productName: agg.name,
      imageUrl: agg.imageUrl,
      unitsSold: agg.unitsSold,
      revenue: agg.revenue,
      cogsAmount,
      cogsTotal,
      profit: cogsTotal !== null ? agg.revenue - cogsTotal : null,
    })
  }
  products.sort((a, b) => b.revenue - a.revenue)

  // Derived as the sum of the per-product buckets above (not independently
  // from order.totalPrice) so this number always reconciles with the
  // per-product breakdown shown below it in the UI.
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)
  const commissionAmount = commissionRatePercent !== null ? totalRevenue * (commissionRatePercent / 100) : 0
  const netProfit = totalRevenue - totalCogsKnown - adSpend.amount - commissionAmount

  return {
    products,
    totalRevenue,
    totalCogsKnown,
    productsWithoutCogsCount,
    adSpend: adSpend.amount,
    adSpendConfigured: adSpend.configured,
    commissionRatePercent,
    commissionAmount,
    netProfit,
    truncated,
    sessionExpired,
  }
}
