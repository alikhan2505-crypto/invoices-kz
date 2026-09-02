import { listOrders, Order, PAGE_SIZE } from './cabinetApi'
import { KASPI_CATEGORY_COMMISSIONS } from './margin'

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
  // Seller-assigned Kaspi category for this specific product (2026-09-02,
  // audit finding: Profit used to accept only ONE flat commission % for the
  // whole catalog, while Kaspi's real rate varies by category -- see
  // margin.ts's KASPI_CATEGORY_COMMISSIONS for why this can't be inferred
  // automatically from Kaspi's own raw category string). null means this
  // product still falls back to the catalog-wide flat rate below.
  commissionCategoryLabel: string | null
  commissionRatePercent: number | null
  commissionAmount: number | null
  profit: number | null
}

export type ProfitSummary = {
  products: ProductProfit[]
  totalRevenue: number
  totalCogsKnown: number
  productsWithoutCogsCount: number
  adSpend: number
  // «Прочие расходы» периода (аренда, электроэнергия, упаковка…) --
  // manual seller input alongside рекламы, same honesty model.
  otherExpenses: number
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
  catalog: { kaspiMasterSku: string; trackedProductId: string | null; cogsAmount: number | null; commissionCategoryLabel?: string | null }[],
  adSpend: { amount: number; otherAmount: number; configured: boolean },
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
  // Revenue already covered by a per-product category rate -- subtracted
  // from the flat-rate bucket below so a seller can categorize their top
  // products gradually without double-charging commission on that revenue.
  let categorizedRevenue = 0
  let categorizedCommission = 0
  for (const [sku, agg] of bySku.entries()) {
    const catalogEntry = catalogBySku.get(sku)
    const cogsAmount = catalogEntry?.cogsAmount ?? null
    const cogsTotal = cogsAmount !== null ? cogsAmount * agg.unitsSold : null
    if (cogsTotal !== null) totalCogsKnown += cogsTotal
    else productsWithoutCogsCount += 1

    const commissionCategoryLabel = catalogEntry?.commissionCategoryLabel ?? null
    const categoryRate = commissionCategoryLabel
      ? KASPI_CATEGORY_COMMISSIONS.find(c => c.label === commissionCategoryLabel)?.ratePercent ?? null
      : null
    const productCommission = categoryRate !== null ? agg.revenue * (categoryRate / 100) : null
    if (productCommission !== null) {
      categorizedRevenue += agg.revenue
      categorizedCommission += productCommission
    }

    products.push({
      kaspiMasterSku: sku,
      trackedProductId: catalogEntry?.trackedProductId ?? null,
      productName: agg.name,
      imageUrl: agg.imageUrl,
      unitsSold: agg.unitsSold,
      revenue: agg.revenue,
      cogsAmount,
      cogsTotal,
      commissionCategoryLabel,
      commissionRatePercent: categoryRate,
      commissionAmount: productCommission,
      profit: cogsTotal !== null ? agg.revenue - cogsTotal - (productCommission ?? 0) : null,
    })
  }
  products.sort((a, b) => b.revenue - a.revenue)

  // Derived as the sum of the per-product buckets above (not independently
  // from order.totalPrice) so this number always reconciles with the
  // per-product breakdown shown below it in the UI.
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)
  const uncategorizedRevenue = totalRevenue - categorizedRevenue
  const blendedCommission = commissionRatePercent !== null ? uncategorizedRevenue * (commissionRatePercent / 100) : 0
  const commissionAmount = categorizedCommission + blendedCommission
  const netProfit = totalRevenue - totalCogsKnown - adSpend.amount - adSpend.otherAmount - commissionAmount

  return {
    products,
    totalRevenue,
    totalCogsKnown,
    productsWithoutCogsCount,
    adSpend: adSpend.amount,
    otherExpenses: adSpend.otherAmount,
    adSpendConfigured: adSpend.configured,
    commissionRatePercent,
    commissionAmount,
    netProfit,
    truncated,
    sessionExpired,
  }
}
