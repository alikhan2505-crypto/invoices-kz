export type DempingStrategy = 'undercut_leader' | 'match_leader' | 'stay_above_leader' | 'be_second'

export type RepriceInput = {
  competitorPrices: number[]
  undercutStep: number
  floorPrice: number
  strategy?: DempingStrategy
  ownCurrentPrice?: number
}

export type RepriceResult = {
  price: number
  heldAtFloor: boolean
}

// Given the set of competitor prices already visible for one city (after
// excluded cities/merchants have been filtered out by the caller -- this
// function has no opinion on which competitors count, only what price to
// pick given the ones it's handed), compute the candidate own price under
// one of four strategies. Kaspi Shop v1 (2026-08-11) only had
// undercut_leader against a single lowest price; v2 (2026-08-12) adds the
// rest to match what competitor repricers (Northline, PriceFeed) expose.
export function computeRepriceCandidate({
  competitorPrices,
  undercutStep,
  floorPrice,
  strategy = 'undercut_leader',
  ownCurrentPrice,
}: RepriceInput): RepriceResult {
  if (competitorPrices.length === 0) {
    // Auto-recovery from the floor ("автовыход из ямы минимальной цены"):
    // if we're still sitting at (or, defensively, below) the floor from a
    // previous cycle's undercut race and this cycle finds no competitor at
    // all, step back up by the same increment we'd normally undercut by,
    // instead of staying pinned at the floor forever once the race is
    // over. Only fires when ownCurrentPrice was actually supplied -- a
    // product with no price history yet (first-ever check) still falls
    // through to the plain floor default below, not a recovery step.
    if (ownCurrentPrice !== undefined && ownCurrentPrice <= floorPrice) {
      return { price: ownCurrentPrice + undercutStep, heldAtFloor: false }
    }
    // No competitors to react to -- hold at whatever we're already at (or
    // the floor if we have no current price to hold at). Not flagged as
    // heldAtFloor: that signal means "a competitor is forcing us down to
    // the floor", which isn't true when there's no competitor at all.
    return { price: ownCurrentPrice ?? floorPrice, heldAtFloor: false }
  }

  const sorted = [...competitorPrices].sort((a, b) => a - b)
  const lowest = sorted[0]
  let candidate: number

  if (strategy === 'undercut_leader') {
    candidate = lowest - undercutStep
  } else if (strategy === 'match_leader') {
    candidate = lowest
  } else if (strategy === 'stay_above_leader') {
    // Always steps above the lowest competitor, regardless of where our own
    // current price sits -- if we happened to be cheapest before this
    // recompute, moving to lowest+step naturally cedes that spot without
    // needing a special case.
    candidate = lowest + undercutStep
  } else {
    // be_second: sit just above whichever price separates us from being
    // cheapest -- the second-lowest competitor if there are 2+, or the
    // only competitor if there's just one (nothing to be "second" to
    // otherwise, so we sit above them the same as stay_above_leader would).
    const tier = sorted.length > 1 ? sorted[1] : sorted[0]
    candidate = tier + undercutStep
  }

  if (candidate < floorPrice) {
    return { price: floorPrice, heldAtFloor: true }
  }
  return { price: candidate, heldAtFloor: false }
}

export type CompetitorOffer = { merchantId: string; price: number }
export type CityOffers = { cityCode: string; offers: CompetitorOffer[] }
export type CityRepriceResult = { cityCode: string; price: number; heldAtFloor: boolean }

// Store-wide "important cities" list, minus this one product's own per-product
// exclusion override -- a city outside trackedCityCodes was never in scope to
// begin with, so excluding it is a no-op.
export function resolveTargetCities(trackedCityCodes: string[], excludedCityCodes: string[]): string[] {
  return trackedCityCodes.filter(c => !excludedCityCodes.includes(c))
}

// Runs computeRepriceCandidate once per city, using that city's OWN
// competitor offers and OWN current price as the starting point -- this is
// what makes cities actually diverge instead of every city recomputing
// against one shared reference-city offer list (the bug this feature exists
// to fix; see docs/superpowers/specs/2026-08-14-kaspi-shop-city-pricing-design.md).
// floorPrice/undercutStep/strategy stay global per product by design.
export function computePerCityReprice(params: {
  cityOffers: CityOffers[]
  excludedMerchantIds: string[]
  undercutStep: number
  floorPrice: number
  strategy: DempingStrategy
  currentCityPrices: Record<string, number>
}): CityRepriceResult[] {
  return params.cityOffers.map(({ cityCode, offers }) => {
    const competitorPrices = offers
      .filter(o => !params.excludedMerchantIds.includes(o.merchantId))
      .map(o => o.price)
    const { price, heldAtFloor } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: params.undercutStep,
      floorPrice: params.floorPrice,
      strategy: params.strategy,
      ownCurrentPrice: params.currentCityPrices[cityCode],
    })
    return { cityCode, price, heldAtFloor }
  })
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Matches the <kaspi_catalog> schema documented at guide.kaspi.kz/partner/ru/
// shop/goods/price_list -- fetched and reproduced faithfully 2026-08-11, not
// approximated. stockCount is whatever the seller entered at setup time (not
// live-synced -- inventory sync is explicitly out of scope for this
// repricer), used only to set availability's available yes/no.
export function generatePriceListXml(params: {
  companyName: string
  merchantId: string
  products: { sku: string; model: string; brand: string; storeId: string; stockCount: number; price: number }[]
}): string {
  const offers = params.products.map(p => `    <offer sku="${escapeXml(p.sku)}">
      <model>${escapeXml(p.model)}</model>
      <brand>${escapeXml(p.brand)}</brand>
      <availabilities>
        <availability available="${p.stockCount > 0 ? 'yes' : 'no'}" storeId="${escapeXml(p.storeId)}" stockCount="${p.stockCount}"/>
      </availabilities>
      <price>${Math.round(p.price)}</price>
    </offer>`).join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<kaspi_catalog date="${new Date().toISOString()}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <company>${escapeXml(params.companyName)}</company>
  <merchantid>${escapeXml(params.merchantId)}</merchantid>
  <offers>
${offers}
  </offers>
</kaspi_catalog>`
}
