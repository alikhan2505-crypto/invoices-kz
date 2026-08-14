export type DempingStrategy = 'undercut_leader' | 'match_leader' | 'stay_above_leader' | 'be_second'

export type RepriceInput = {
  competitorPrices: number[]
  undercutStep: number
  floorPrice: number
  maxPrice?: number
  strategy?: DempingStrategy
  ownCurrentPrice?: number
  noCompetitorStreak?: number
}

export type RepriceResult = {
  price: number
  heldAtFloor: boolean
  newStreak: number
}

// How many consecutive no-competitor cycles must pass before Макс-памп
// starts climbing toward maxPrice, on top of the existing (faster, floor-
// only) auto-recovery. Fixed, not seller-configurable, to avoid an extra
// UI control for v1 -- see docs/superpowers/specs/2026-08-15-kaspi-shop-max-pump-design.md.
export const PUMP_TRIGGER_CYCLES = 3

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
  maxPrice,
  strategy = 'undercut_leader',
  ownCurrentPrice,
  noCompetitorStreak = 0,
}: RepriceInput): RepriceResult {
  if (competitorPrices.length === 0) {
    // Every no-competitor cycle advances the streak, regardless of which
    // of the three cases below fires -- this is what Макс-памп counts
    // against PUMP_TRIGGER_CYCLES.
    const newStreak = noCompetitorStreak + 1

    // Auto-recovery from the floor ("автовыход из ямы минимальной цены")
    // takes priority over pumping: if we're still sitting at (or,
    // defensively, below) the floor from a previous cycle's undercut race,
    // step back up by the same increment we'd normally undercut by, instead
    // of staying pinned at the floor forever once the race is over. Only
    // fires when ownCurrentPrice was actually supplied -- a product with no
    // price history yet (first-ever check) still falls through to the plain
    // floor default below, not a recovery step.
    if (ownCurrentPrice !== undefined && ownCurrentPrice <= floorPrice) {
      return { price: ownCurrentPrice + undercutStep, heldAtFloor: false, newStreak }
    }

    // Макс-памп: sustained absence of competition (not just one blip)
    // gradually recovers margin by climbing toward the seller's own
    // ceiling, one undercutStep at a time, never overshooting it.
    if (
      ownCurrentPrice !== undefined &&
      newStreak >= PUMP_TRIGGER_CYCLES &&
      maxPrice !== undefined &&
      ownCurrentPrice < maxPrice
    ) {
      return { price: Math.min(ownCurrentPrice + undercutStep, maxPrice), heldAtFloor: false, newStreak }
    }

    // No competitors to react to and not yet pumping -- hold at whatever
    // we're already at (or the floor if we have no current price to hold
    // at). Not flagged as heldAtFloor: that signal means "a competitor is
    // forcing us down to the floor", which isn't true when there's no
    // competitor at all.
    return { price: ownCurrentPrice ?? floorPrice, heldAtFloor: false, newStreak }
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

  // A real competitor is present -- the pump/no-competitor streak always
  // resets here, this is the automatic "retreat" Макс-памп needs.
  if (candidate < floorPrice) {
    return { price: floorPrice, heldAtFloor: true, newStreak: 0 }
  }
  return { price: candidate, heldAtFloor: false, newStreak: 0 }
}

export type CompetitorOffer = { merchantId: string; price: number }
export type CityOffers = { cityCode: string; offers: CompetitorOffer[] }
export type CityRepriceResult = { cityCode: string; price: number; heldAtFloor: boolean; newStreak: number }

// Store-wide "important cities" list, minus this one product's own per-product
// exclusion override -- a city outside trackedCityCodes was never in scope to
// begin with, so excluding it is a no-op.
export function resolveTargetCities(trackedCityCodes: string[], excludedCityCodes: string[]): string[] {
  return trackedCityCodes.filter(c => !excludedCityCodes.includes(c))
}

// Runs computeRepriceCandidate once per city, using that city's OWN
// competitor offers, own current price, AND own no-competitor streak as
// the starting point -- this is what lets Макс-памп pump one city
// independently of a sibling city that still has active competition.
// floorPrice/undercutStep/strategy/maxPrice stay global per product by
// design; only the streak varies per city.
export function computePerCityReprice(params: {
  cityOffers: CityOffers[]
  excludedMerchantIds: string[]
  undercutStep: number
  floorPrice: number
  maxPrice?: number
  strategy: DempingStrategy
  currentCityPrices: Record<string, number>
  currentCityStreaks?: Record<string, number>
}): CityRepriceResult[] {
  const streaks = params.currentCityStreaks ?? {}
  return params.cityOffers.map(({ cityCode, offers }) => {
    const competitorPrices = offers
      .filter(o => !params.excludedMerchantIds.includes(o.merchantId))
      .map(o => o.price)
    const { price, heldAtFloor, newStreak } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: params.undercutStep,
      floorPrice: params.floorPrice,
      maxPrice: params.maxPrice,
      strategy: params.strategy,
      ownCurrentPrice: params.currentCityPrices[cityCode],
      noCompetitorStreak: streaks[cityCode],
    })
    return { cityCode, price, heldAtFloor, newStreak }
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
