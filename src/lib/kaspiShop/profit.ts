import { listOrders } from './cabinetApi'
import { KASPI_CATEGORY_COMMISSIONS } from './margin'
import { fetchRevenueOrders, windowStartForDays, almatyDateOf } from './revenueOrders'

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
  // Ставка, по которой реально посчитана комиссия этого товара: по категории или,
  // если категории нет, общая ставка магазина. null -- ставки нет вообще, комиссия
  // в прибыль товара не вычтена (аудит K32).
  commissionRatePercent: number | null
  commissionSource: 'category' | 'flat' | null
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
  // Есть выручка без какой-либо ставки комиссии (нет ни общей, ни категории):
  // netProfit тогда завышен на эту комиссию.
  commissionMissing: boolean
  netProfit: number
  // «Предварительно»: чего-то не хватает (себестоимости у части товаров, ставки
  // комиссии) или список заказов неполный (K33).
  isPreliminary: boolean
  truncated: boolean
  sessionExpired: boolean
  // См. FinanceSummary.upstreamFailed: Kaspi не ответил на страницу заказов, выручка и
  // прибыль неполные или неизвестны.
  upstreamFailed: boolean
  // С какой даты (по Алматы) посчитан период и по каким данным (см. FinanceSummary).
  periodFrom: string
  fetchedOrders: number
  newestFirst: boolean
}

export type ProfitOptions = {
  windowStartMs?: number
  cacheKey?: string
  nowMs?: number
}

export async function computeProfitSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number,
  catalog: { kaspiMasterSku: string; trackedProductId: string | null; cogsAmount: number | null; commissionCategoryLabel?: string | null }[],
  adSpend: { amount: number; otherAmount: number; configured: boolean },
  commissionRatePercent: number | null,
  listOrdersFn: typeof listOrders = listOrders,
  opts: ProfitOptions = {}
): Promise<ProfitSummary> {
  const nowMs = opts.nowMs ?? Date.now()
  const cutoffMs = opts.windowStartMs ?? windowStartForDays(sinceDays, nowMs)
  const fetched = await fetchRevenueOrders(sessionCookies, merchantId, cutoffMs, listOrdersFn, { cacheKey: opts.cacheKey, nowMs })
  const { truncated, sessionExpired, upstreamFailed } = fetched

  const inWindow = fetched.orders.filter(o => Date.parse(o.creationTime) >= cutoffMs)

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
  let commissionTotal = 0
  let revenueWithoutRate = 0
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
    // Ставка товара: по его категории, а без категории общая ставка магазина
    // (раньше такой товар показывал прибыль без комиссии, а итог её вычитал, и
    // суммы карточек расходились с итогом: аудит K32).
    const rate = categoryRate ?? commissionRatePercent
    const commissionSource: ProductProfit['commissionSource'] = categoryRate !== null ? 'category' : commissionRatePercent !== null ? 'flat' : null
    const productCommission = rate !== null ? agg.revenue * (rate / 100) : null
    if (productCommission !== null) commissionTotal += productCommission
    else revenueWithoutRate += agg.revenue

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
      commissionRatePercent: rate,
      commissionSource,
      commissionAmount: productCommission,
      profit: cogsTotal !== null ? agg.revenue - cogsTotal - (productCommission ?? 0) : null,
    })
  }
  products.sort((a, b) => b.revenue - a.revenue)

  // Derived as the sum of the per-product buckets above (not independently
  // from order.totalPrice) so this number always reconciles with the
  // per-product breakdown shown below it in the UI.
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)
  // Итоговая комиссия -- сумма по товарам: категорийная ставка там, где категория
  // задана, общая на остальное. Тот же результат, что давала прежняя формула
  // «категорийная часть + общая ставка на остаток выручки».
  const commissionAmount = commissionTotal
  const commissionMissing = revenueWithoutRate > 0
  const netProfit = totalRevenue - totalCogsKnown - adSpend.amount - adSpend.otherAmount - commissionAmount
  const isPreliminary = productsWithoutCogsCount > 0 || commissionMissing || truncated || upstreamFailed

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
    commissionMissing,
    netProfit,
    isPreliminary,
    truncated,
    sessionExpired,
    upstreamFailed,
    periodFrom: almatyDateOf(cutoffMs),
    fetchedOrders: fetched.fetchedCount,
    newestFirst: fetched.newestFirst,
  }
}
