# Kaspi Shop: Макс-памп Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When no competitor has been found for a product (or city) for several consecutive check cycles, gradually climb the price back up toward a seller-configured ceiling instead of holding flat, recovering margin once competition has genuinely disappeared.

**Architecture:** Pure logic lives in `src/lib/kaspiShop/pricing.ts` (`computeRepriceCandidate` and `computePerCityReprice` both gain a streak counter and a ceiling input); `checkCycle.ts` stays the thin Supabase-orchestration layer that reads/writes the new columns. No new endpoints, no new relay/GitHub-Actions changes — a pump step is just a different computed price flowing through the existing push pipeline.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres), Next.js API routes.

## Global Constraints

- Trigger: `PUMP_TRIGGER_CYCLES = 3` consecutive no-competitor cycles — a fixed exported constant in `pricing.ts`, not seller-configurable.
- Ceiling: `max_price` is nullable. `NULL` (the default) means the pump behavior is fully off for that product — never invent a default ceiling.
- Climb style: gradual, by `undercut_step` per qualifying cycle, capped at `max_price` — never an instant jump.
- Retreat: automatic — the moment a competitor is found, the function's normal competitor-reacting branch runs and the streak resets to 0. No separate retreat code.
- Streak scope: `kaspi_shop_product_city_prices.no_competitor_streak` for stores with per-city tracking configured (one counter per city); `kaspi_shop_tracked_products.no_competitor_streak` for the legacy path (one counter per product). `max_price` itself is always a single product-level value shared across all of a product's cities.
- Only pure-logic modules (`pricing.ts`) get Vitest tests. `checkCycle.ts` orchestration and the page get no test coverage, matching this project's established convention.
- Direct-to-main commits, no feature branches, no commit-confirmation prompts.
- Every task ends with `npx tsc --noEmit`. The final task also runs `npm run build`.
- The two required columns were already added by the controller before this plan was written — do not write a migration task:
  ```sql
  alter table kaspi_shop_tracked_products
    add column if not exists max_price numeric,
    add column if not exists no_competitor_streak integer not null default 0;
  alter table kaspi_shop_product_city_prices
    add column if not exists no_competitor_streak integer not null default 0;
  ```
- **Known repeat gotcha in this codebase**: a field can exist in the DB and in a page's edit form and still silently fail to save if `PATCH /api/kaspi-shop/products`'s field allowlist isn't updated too. This has already happened twice in this feature area (`demping_strategy`/`excluded_city_codes`/`excluded_merchant_ids` were dropped for a while; fixed 2026-08-14 commit `d224914`). Task 3 must add `max_price` to that allowlist.

---

### Task 1: Pure pricing logic — streak + pump in `pricing.ts`

**Files:**
- Modify: `src/lib/kaspiShop/pricing.ts`
- Test: `src/lib/kaspiShop/pricing.test.ts`

**Interfaces:**
- Consumes: nothing new (extends this module's own existing exports).
- Produces: `PUMP_TRIGGER_CYCLES: number` (exported constant); `RepriceInput` gains `maxPrice?: number` and `noCompetitorStreak?: number`; `RepriceResult` gains `newStreak: number`; `computePerCityReprice`'s params gain `maxPrice?: number` and `currentCityStreaks?: Record<string, number>`; `CityRepriceResult` gains `newStreak: number`. Task 2 consumes all of these exact names/shapes.

**Important — this task changes `RepriceResult`'s shape, which breaks every existing test that asserts on it with `toEqual` (an exact-match matcher, not a subset match) since the actual result will now always include `newStreak`.** Step 1 below is the COMPLETE replacement content for `pricing.test.ts` — every pre-existing assertion has been updated with the correct `newStreak` value alongside the new pump-specific tests. Do not try to patch the existing file incrementally; replace its full content with what's below.

- [ ] **Step 1: Replace `pricing.test.ts` with this complete content**

```ts
import { describe, it, expect } from 'vitest'
import { computeRepriceCandidate, generatePriceListXml, resolveTargetCities, computePerCityReprice } from './pricing'

describe('computeRepriceCandidate', () => {
  it('undercuts the competitor by the seller-set step when above the floor (default strategy)', () => {
    const result = computeRepriceCandidate({ competitorPrices: [10000], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 9900, heldAtFloor: false, newStreak: 0 })
  })

  it('holds at the floor when undercutting would go below it', () => {
    const result = computeRepriceCandidate({ competitorPrices: [5050], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: true, newStreak: 0 })
  })

  it('holds at exactly the floor when the candidate lands exactly on it', () => {
    const result = computeRepriceCandidate({ competitorPrices: [5100], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: false, newStreak: 0 })
  })

  it('holds at own current price (not flagged heldAtFloor) when there are no competitors', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 8500 })
    expect(result).toEqual({ price: 8500, heldAtFloor: false, newStreak: 1 })
  })

  it('falls back to the floor when there are no competitors and no current price', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 5000, heldAtFloor: false, newStreak: 1 })
  })

  it('steps back up by undercutStep when no competitor is found and we are pinned at the floor', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 5000 })
    expect(result).toEqual({ price: 5100, heldAtFloor: false, newStreak: 1 })
  })

  it('also recovers if own current price somehow sits below the floor', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 50, floorPrice: 5000, ownCurrentPrice: 4900 })
    expect(result).toEqual({ price: 4950, heldAtFloor: false, newStreak: 1 })
  })

  it('does not keep climbing once recovered above the floor -- holds flat on the next no-competitor cycle (no maxPrice configured)', () => {
    const result = computeRepriceCandidate({ competitorPrices: [], undercutStep: 100, floorPrice: 5000, ownCurrentPrice: 5100 })
    expect(result).toEqual({ price: 5100, heldAtFloor: false, newStreak: 1 })
  })

  it('undercut_leader uses the lowest of several competitor prices', () => {
    const result = computeRepriceCandidate({ competitorPrices: [10500, 10000, 11000], undercutStep: 100, floorPrice: 5000 })
    expect(result).toEqual({ price: 9900, heldAtFloor: false, newStreak: 0 })
  })
})

describe('computeRepriceCandidate strategies', () => {
  it('match_leader sets price equal to the lowest competitor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'match_leader',
    })
    expect(result).toEqual({ price: 10000, heldAtFloor: false, newStreak: 0 })
  })

  it('match_leader holds at floor if the leader price is below floor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [7000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'match_leader',
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: true, newStreak: 0 })
  })

  it('stay_above_leader sits step above the lowest competitor when we are not already cheapest', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'stay_above_leader',
      ownCurrentPrice: 10200,
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false, newStreak: 0 })
  })

  it('stay_above_leader cedes the top spot and moves above the next seller if we are already cheapest', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'stay_above_leader',
      ownCurrentPrice: 9500,
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false, newStreak: 0 })
  })

  it('be_second sits step above the second-lowest competitor when there are 2+ competitors', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000, 10500, 11000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 10600, heldAtFloor: false, newStreak: 0 })
  })

  it('be_second sits step above the only competitor when there is exactly one', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [10000],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 10100, heldAtFloor: false, newStreak: 0 })
  })

  it('be_second holds at floor if the second-lowest tier would be below floor', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [6000, 6500],
      undercutStep: 100,
      floorPrice: 8000,
      strategy: 'be_second',
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: true, newStreak: 0 })
  })
})

describe('computeRepriceCandidate pump behavior (Макс-памп)', () => {
  it('increments the streak on a no-competitor cycle without pumping while below the trigger threshold', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000,
      ownCurrentPrice: 6000, noCompetitorStreak: 1,
    })
    expect(result).toEqual({ price: 6000, heldAtFloor: false, newStreak: 2 })
  })

  it('pumps by undercutStep once the streak reaches the trigger threshold', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000,
      ownCurrentPrice: 6000, noCompetitorStreak: 2,
    })
    expect(result).toEqual({ price: 6100, heldAtFloor: false, newStreak: 3 })
  })

  it('caps the pumped price at maxPrice instead of overshooting', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 500, floorPrice: 5000, maxPrice: 8000,
      ownCurrentPrice: 7800, noCompetitorStreak: 5,
    })
    expect(result).toEqual({ price: 8000, heldAtFloor: false, newStreak: 6 })
  })

  it('does not pump when maxPrice is not configured, even past the trigger', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000,
      ownCurrentPrice: 6000, noCompetitorStreak: 5,
    })
    expect(result).toEqual({ price: 6000, heldAtFloor: false, newStreak: 6 })
  })

  it('does not pump when ownCurrentPrice is not supplied, even past the trigger', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000,
      noCompetitorStreak: 5,
    })
    expect(result).toEqual({ price: 5000, heldAtFloor: false, newStreak: 6 })
  })

  it('resets the streak to 0 the instant a competitor is found again', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [6200], undercutStep: 100, floorPrice: 5000, maxPrice: 8000,
      ownCurrentPrice: 6000, noCompetitorStreak: 5,
    })
    expect(result.newStreak).toBe(0)
  })

  it('floor-recovery takes priority over pumping when at or below the floor, even past the pump trigger', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000,
      ownCurrentPrice: 5000, noCompetitorStreak: 5,
    })
    expect(result).toEqual({ price: 5100, heldAtFloor: false, newStreak: 6 })
  })

  it('treats a missing noCompetitorStreak as 0 (first-ever check)', () => {
    const result = computeRepriceCandidate({
      competitorPrices: [], undercutStep: 100, floorPrice: 5000, maxPrice: 8000,
      ownCurrentPrice: 6000,
    })
    expect(result).toEqual({ price: 6000, heldAtFloor: false, newStreak: 1 })
  })
})

describe('resolveTargetCities', () => {
  it('returns the tracked list unchanged when nothing is excluded', () => {
    expect(resolveTargetCities(['750000000', '710000000'], [])).toEqual(['750000000', '710000000'])
  })

  it('removes cities that are in this product\'s own exclusion list', () => {
    expect(resolveTargetCities(['750000000', '710000000', '590000000'], ['710000000'])).toEqual(['750000000', '590000000'])
  })

  it('excluding a city not in the tracked list is a no-op', () => {
    expect(resolveTargetCities(['750000000'], ['999999999'])).toEqual(['750000000'])
  })

  it('returns an empty list when nothing is tracked', () => {
    expect(resolveTargetCities([], ['710000000'])).toEqual([])
  })
})

describe('computePerCityReprice', () => {
  it('computes an independent price per city from that city\'s own competitor offers and own current price', () => {
    const results = computePerCityReprice({
      cityOffers: [
        { cityCode: 'A', offers: [{ merchantId: 'm1', price: 10000 }] },
        { cityCode: 'B', offers: [{ merchantId: 'm2', price: 8000 }] },
      ],
      excludedMerchantIds: [],
      undercutStep: 100,
      floorPrice: 5000,
      strategy: 'undercut_leader',
      currentCityPrices: { A: 9950, B: 8200 },
    })
    expect(results).toEqual([
      { cityCode: 'A', price: 9900, heldAtFloor: false, newStreak: 0 },
      { cityCode: 'B', price: 7900, heldAtFloor: false, newStreak: 0 },
    ])
  })

  it('filters excluded merchants per city before computing', () => {
    const results = computePerCityReprice({
      cityOffers: [{ cityCode: 'A', offers: [{ merchantId: 'blocked', price: 1000 }, { merchantId: 'm2', price: 9000 }] }],
      excludedMerchantIds: ['blocked'],
      undercutStep: 100,
      floorPrice: 500,
      strategy: 'undercut_leader',
      currentCityPrices: {},
    })
    expect(results).toEqual([{ cityCode: 'A', price: 8900, heldAtFloor: false, newStreak: 0 }])
  })

  it('holds a city at the floor independently of other cities', () => {
    const results = computePerCityReprice({
      cityOffers: [
        { cityCode: 'A', offers: [{ merchantId: 'm1', price: 5050 }] },
        { cityCode: 'B', offers: [{ merchantId: 'm2', price: 20000 }] },
      ],
      excludedMerchantIds: [],
      undercutStep: 100,
      floorPrice: 5000,
      strategy: 'undercut_leader',
      currentCityPrices: { A: 5000, B: 5000 },
    })
    expect(results).toEqual([
      { cityCode: 'A', price: 5000, heldAtFloor: true, newStreak: 0 },
      { cityCode: 'B', price: 19900, heldAtFloor: false, newStreak: 0 },
    ])
  })

  it('returns an empty array for an empty city-offers list', () => {
    expect(computePerCityReprice({
      cityOffers: [], excludedMerchantIds: [], undercutStep: 100, floorPrice: 500, strategy: 'undercut_leader', currentCityPrices: {},
    })).toEqual([])
  })

  it('pumps a city independently once its own streak crosses the trigger, even while a sibling city still has a competitor', () => {
    const results = computePerCityReprice({
      cityOffers: [
        { cityCode: 'A', offers: [] },
        { cityCode: 'B', offers: [{ merchantId: 'm1', price: 9000 }] },
      ],
      excludedMerchantIds: [],
      undercutStep: 100,
      floorPrice: 5000,
      maxPrice: 8000,
      strategy: 'undercut_leader',
      currentCityPrices: { A: 6000, B: 6000 },
      currentCityStreaks: { A: 2, B: 2 },
    })
    expect(results).toEqual([
      { cityCode: 'A', price: 6100, heldAtFloor: false, newStreak: 3 },
      { cityCode: 'B', price: 8900, heldAtFloor: false, newStreak: 0 },
    ])
  })

  it('defaults a missing per-city streak to 0 when currentCityStreaks is omitted entirely', () => {
    const results = computePerCityReprice({
      cityOffers: [{ cityCode: 'A', offers: [] }],
      excludedMerchantIds: [],
      undercutStep: 100,
      floorPrice: 5000,
      maxPrice: 8000,
      strategy: 'undercut_leader',
      currentCityPrices: { A: 6000 },
    })
    expect(results).toEqual([{ cityCode: 'A', price: 6000, heldAtFloor: false, newStreak: 1 }])
  })
})

describe('generatePriceListXml', () => {
  it('produces a kaspi_catalog document matching the documented offer schema', () => {
    const xml = generatePriceListXml({
      companyName: 'Test Company',
      merchantId: 'MC123',
      products: [
        { sku: 'SKU1', model: 'iphone 5s white 32gb', brand: 'Apple', storeId: 'point1', stockCount: 5, price: 6418 },
      ],
    })
    expect(xml).toContain('<company>Test Company</company>')
    expect(xml).toContain('<merchantid>MC123</merchantid>')
    expect(xml).toContain('<offer sku="SKU1">')
    expect(xml).toContain('<model>iphone 5s white 32gb</model>')
    expect(xml).toContain('<brand>Apple</brand>')
    expect(xml).toContain('<availability available="yes" storeId="point1" stockCount="5"/>')
    expect(xml).toContain('<price>6418</price>')
  })

  it('escapes special XML characters in text fields', () => {
    const xml = generatePriceListXml({
      companyName: 'A & B',
      merchantId: 'MC123',
      products: [{ sku: 'SKU2', model: 'Cable <3m>', brand: 'X&Y', storeId: 'p1', stockCount: 0, price: 100 }],
    })
    expect(xml).toContain('A &amp; B')
    expect(xml).toContain('Cable &lt;3m&gt;')
    expect(xml).toContain('X&amp;Y')
  })

  it('marks zero stock as unavailable', () => {
    const xml = generatePriceListXml({
      companyName: 'C',
      merchantId: 'M',
      products: [{ sku: 'SKU3', model: 'X', brand: 'Y', storeId: 'p1', stockCount: 0, price: 100 }],
    })
    expect(xml).toContain('available="no"')
  })

  it('rounds price to the nearest whole tenge (Kaspi price-list has no decimals)', () => {
    const xml = generatePriceListXml({
      companyName: 'C',
      merchantId: 'M',
      products: [{ sku: 'SKU4', model: 'X', brand: 'Y', storeId: 'p1', stockCount: 1, price: 100.6 }],
    })
    expect(xml).toContain('<price>101</price>')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/lib/kaspiShop/pricing.test.ts`
Expected: FAIL — `RepriceResult`/`CityRepriceResult` don't have `newStreak` yet, `maxPrice`/`noCompetitorStreak`/`currentCityStreaks` aren't accepted params yet.

- [ ] **Step 3: Replace `computeRepriceCandidate` and `computePerCityReprice` in `pricing.ts`**

In `src/lib/kaspiShop/pricing.ts`, replace the existing `RepriceInput`, `RepriceResult`, and `computeRepriceCandidate` (everything from `export type RepriceInput` through the end of `computeRepriceCandidate`'s closing `}`) with:

```ts
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
```

Then replace `CityRepriceResult` and `computePerCityReprice` (everything from `export type CityRepriceResult` through the end of `computePerCityReprice`'s closing `}`) with:

```ts
export type CityRepriceResult = { cityCode: string; price: number; heldAtFloor: boolean; newStreak: number }

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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/lib/kaspiShop/pricing.test.ts`
Expected: PASS, all tests (existing + new).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/kaspiShop/pricing.ts src/lib/kaspiShop/pricing.test.ts
git commit -m "feat(kaspi-shop): Макс-памп pure logic -- streak + gradual climb to a seller ceiling"
git push
```

---

### Task 2: Wire streak + maxPrice into `checkCycle.ts`

**Files:**
- Modify: `src/lib/kaspiShop/checkCycle.ts`

**Interfaces:**
- Consumes: `PUMP_TRIGGER_CYCLES` is not directly needed here (it's internal to `computeRepriceCandidate`); `computeRepriceCandidate`'s and `computePerCityReprice`'s new `maxPrice`/`noCompetitorStreak`/`currentCityStreaks` params and `newStreak` return field, from Task 1.
- Produces: no new exports — `applyPriceCheckResult`'s external signature (`trackedProductId`, `offers`, `fetchError`) is unchanged; only its internal computation and the columns it writes change.

The current live `applyPriceCheckResult` (as of the per-city-pricing feature's final-review fixes, commit `628736c`) is reproduced below in full so you don't have to reconstruct it from memory. **Read the actual current file first anyway** (`src/lib/kaspiShop/checkCycle.ts`) in case anything has changed since this plan was written, then replace the whole function with the new version in Step 2.

- [ ] **Step 1: Confirm the current file matches this plan's assumption**

Run: `sed -n '141,378p' src/lib/kaspiShop/checkCycle.ts` (or open the file and look at `applyPriceCheckResult`) and confirm the function still has the same overall shape: a `perCityOffers` branch using `computePerCityReprice`, a legacy `else if (!fetchError)` branch using `computeRepriceCandidate` directly plus an inner per-city push loop, and an `else` error branch, ending in a shared `kaspi_shop_price_checks` insert and wallet debit. If the shape has materially changed, stop and report back rather than guessing how to merge.

- [ ] **Step 2: Replace `applyPriceCheckResult` with the new version**

Replace the entire function (from `export async function applyPriceCheckResult(` through its closing `}`, right before the final `try { await debitKaspiShopWallet(...)` block stays where it is — that block and everything above the function are unaffected) with:

```ts
export async function applyPriceCheckResult(
  trackedProductId: string,
  offers: ApplyOffers | null,
  fetchError: string | null
): Promise<void> {
  const { data: product } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('*, kaspi_shop_connections(id, user_id, paused, merchant_id, session_cookies, session_status)')
    .eq('id', trackedProductId)
    .single()
  if (!product || !product.enabled) return
  const connection = product.kaspi_shop_connections
  if (connection?.paused) return

  const userId = product.user_id
  const ownPriceBefore = Number(product.own_current_price)
  let action: 'updated' | 'held_at_floor' | 'no_change' | 'error' = 'no_change'
  let ownPriceAfter = ownPriceBefore
  let competitorPrice: number | null = null
  // Collects a message for every push that didn't happen (rate-limited,
  // session issue, upstream error) across whichever branch below runs, so
  // it can be surfaced in the kaspi_shop_price_checks row at the end --
  // previously these were silently discarded (final-review finding I2).
  const pushIssues: string[] = []

  // maxPrice/noCompetitorStreak are read once here and reused by both the
  // top-level computeRepriceCandidate call AND the legacy branch's inner
  // per-city loop -- the loop's own newStreak results are never persisted
  // (the legacy path only tracks one streak per product, per the design),
  // so all its calls deliberately reuse this same "before this cycle"
  // value rather than each other's outputs.
  const maxPrice = product.max_price !== null && product.max_price !== undefined ? Number(product.max_price) : undefined
  const noCompetitorStreak = Number(product.no_competitor_streak) || 0

  if (!fetchError && offers && 'perCityOffers' in offers) {
    const excludedMerchants: string[] = product.excluded_merchant_ids || []
    const { data: cityRows } = await supabase
      .from('kaspi_shop_product_city_prices')
      .select('city_code, own_current_price, no_competitor_streak')
      .eq('tracked_product_id', trackedProductId)
    const currentCityPrices: Record<string, number> = {}
    const currentCityStreaks: Record<string, number> = {}
    for (const c of cityRows || []) {
      currentCityPrices[c.city_code] = Number(c.own_current_price)
      currentCityStreaks[c.city_code] = Number(c.no_competitor_streak) || 0
    }

    const cityOffersList: CityOffers[] = Object.entries(offers.perCityOffers).map(([cityCode, cityOffers]) => ({ cityCode, offers: cityOffers }))
    const results = computePerCityReprice({
      cityOffers: cityOffersList,
      excludedMerchantIds: excludedMerchants,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      maxPrice,
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      currentCityPrices,
      currentCityStreaks,
    })

    if (results.length > 0) {
      ownPriceAfter = Math.min(...results.map(r => r.price))
      const anyHeldAtFloor = results.some(r => r.heldAtFloor)
      action = anyHeldAtFloor ? 'held_at_floor' : (ownPriceAfter === ownPriceBefore ? 'no_change' : 'updated')
      const allCompetitorPrices = cityOffersList.flatMap(c => c.offers.filter(o => !excludedMerchants.includes(o.merchantId)).map(o => o.price))
      competitorPrice = allCompetitorPrices.length > 0 ? Math.min(...allCompetitorPrices) : null

      await supabase
        .from('kaspi_shop_tracked_products')
        .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice })
        .eq('id', trackedProductId)

      if (connection?.session_cookies && connection.session_status === 'active') {
        const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
        const { data: connProducts } = await supabase
          .from('kaspi_shop_tracked_products')
          .select('id')
          .eq('connection_id', connection.id)
        const productIds = (connProducts || []).map((p: any) => p.id)
        for (const result of results) {
          // Decide per city, not from the aggregate `action` above -- the
          // aggregate can read "no_change" even when one city genuinely
          // moved, if a different city happens to still hold the overall
          // minimum. The streak is written every time regardless of push
          // outcome below -- it reflects "was a competitor seen this
          // cycle", not "did the push succeed", so a rate-limited or
          // otherwise-failed cycle must still let the pump countdown
          // advance (a version that only advanced on successful push would
          // let a busy 30-minute window silently stall the pump forever).
          if (currentCityPrices[result.cityCode] !== undefined && result.price === currentCityPrices[result.cityCode]) {
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ no_competitor_streak: result.newStreak })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', result.cityCode)
            continue
          }
          const pushResult = await pushCityPrice({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            trackedProductId,
            productIds,
            sku: product.kaspi_sku,
            model: product.product_name,
            storeId: product.store_id,
            cityCode: result.cityCode,
            newPrice: result.price,
          })
          if (pushResult.pushed) {
            const pushedAt = new Date().toISOString()
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: result.price, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt, no_competitor_streak: result.newStreak })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', result.cityCode)
          } else {
            console.error('kaspi-shop checkCycle: price push skipped for product', trackedProductId, 'city', result.cityCode, '--', pushResult.message)
            pushIssues.push(`${result.cityCode}: ${pushResult.message}`)
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ no_competitor_streak: result.newStreak })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', result.cityCode)
          }
          if (pushResult.sessionExpired) {
            console.error('kaspi-shop checkCycle: session expired for connection', connection.id, '-- stopping city pushes for this product')
            break
          }
        }
      }

      if (anyHeldAtFloor) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telegram_chat_id, notify_telegram')
          .eq('id', userId)
          .single()
        if (profile?.notify_telegram && profile.telegram_chat_id) {
          await sendTelegramNotification(profile.telegram_chat_id,
            `🔴 Kaspi Магазин: цена товара «${product.product_name}» упёрлась в ваш минимум (${product.floor_price} ₸) в одном или нескольких городах — конкурент дешевле, но снижать дальше нельзя. Проверьте вручную, если хотите скорректировать минимум.`)
        }
      }
    }
  } else if (!fetchError) {
    const competitorOffers = offers && 'competitorOffers' in offers ? offers.competitorOffers : null
    const excludedMerchants: string[] = product.excluded_merchant_ids || []
    const competitorPrices = (competitorOffers || [])
      .filter(o => !excludedMerchants.includes(o.merchantId))
      .map(o => o.price)
    competitorPrice = competitorPrices.length > 0 ? Math.min(...competitorPrices) : null
    const { price, heldAtFloor, newStreak } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      maxPrice,
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      ownCurrentPrice: ownPriceBefore,
      noCompetitorStreak,
    })
    ownPriceAfter = price
    action = heldAtFloor ? 'held_at_floor' : (price === ownPriceBefore ? 'no_change' : 'updated')

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice, no_competitor_streak: newStreak })
      .eq('id', trackedProductId)

    if (action === 'updated' && connection?.session_cookies && connection.session_status === 'active') {
      const { data: cityRows } = await supabase
        .from('kaspi_shop_product_city_prices')
        .select('city_code, own_current_price')
        .eq('tracked_product_id', trackedProductId)
      const excludedCities: string[] = product.excluded_city_codes || []
      const citiesToPush = (cityRows || []).filter(c => !excludedCities.includes(c.city_code))

      if (citiesToPush.length > 0) {
        const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
        const { data: connProducts } = await supabase
          .from('kaspi_shop_tracked_products')
          .select('id')
          .eq('connection_id', connection.id)
        const productIds = (connProducts || []).map((p: any) => p.id)
        for (const city of citiesToPush) {
          const cityCandidate = computeRepriceCandidate({
            competitorPrices,
            undercutStep: Number(product.undercut_step),
            floorPrice: Number(product.floor_price),
            maxPrice,
            strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
            ownCurrentPrice: Number(city.own_current_price ?? ownPriceBefore),
            noCompetitorStreak,
          })

          const result = await pushCityPrice({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            trackedProductId,
            productIds,
            sku: product.kaspi_sku,
            model: product.product_name,
            storeId: product.store_id,
            cityCode: city.city_code,
            newPrice: cityCandidate.price,
          })

          if (result.pushed) {
            const pushedAt = new Date().toISOString()
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: cityCandidate.price, last_competitor_price: competitorPrice, updated_at: pushedAt, last_pushed_at: pushedAt })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', city.city_code)
          } else {
            console.error('kaspi-shop checkCycle: price push skipped for product', trackedProductId, 'city', city.city_code, '--', result.message)
            pushIssues.push(`${city.city_code}: ${result.message}`)
          }
          if (result.sessionExpired) {
            console.error('kaspi-shop checkCycle: session expired for connection', connection.id, '-- stopping city pushes for this product')
            break
          }
        }
      }
    }

    if (heldAtFloor) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_chat_id, notify_telegram')
        .eq('id', userId)
        .single()
      if (profile?.notify_telegram && profile.telegram_chat_id) {
        await sendTelegramNotification(profile.telegram_chat_id,
          `🔴 Kaspi Магазин: цена товара «${product.product_name}» упёрлась в ваш минимум (${product.floor_price} ₸) — конкурент дешевле, но снижать дальше нельзя. Проверьте вручную, если хотите скорректировать минимум.`)
      }
    }
  } else {
    action = 'error'
    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', trackedProductId)
  }

  // fetchError takes priority (it's a distinct, more specific failure this
  // cycle never got past); otherwise surface any push issues collected
  // above -- e.g. own_current_price was updated in our DB but Kaspi never
  // actually received it because the rate-limit budget was exhausted, one
  // of the two cases finding I2 flagged as previously silent.
  const errorMessage = fetchError ?? summarizePushIssues(pushIssues)

  await supabase.from('kaspi_shop_price_checks').insert({
    tracked_product_id: trackedProductId,
    competitor_price: competitorPrice,
    own_price_before: ownPriceBefore,
    own_price_after: ownPriceAfter,
    action,
    credit_cost: 1,
    error_message: errorMessage,
  })

  try {
    await debitKaspiShopWallet(userId, 1, `Проверка цены: ${product.product_name}`)
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: wallet debit failed for user', userId, 'product', trackedProductId, ':', err.message)
  }
}
```

(Note what did NOT change: `getDueTrackedProducts`, `pushCityPrice`, `summarizePushIssues`, and the `ApplyOffers` type above `applyPriceCheckResult` are all untouched — only the body of `applyPriceCheckResult` itself changes.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/checkCycle.ts
git commit -m "feat(kaspi-shop): wire Макс-памп streak + ceiling into the price-check cycle

Both the legacy and per-city branches of applyPriceCheckResult now read
max_price and no_competitor_streak, pass them into computeRepriceCandidate/
computePerCityReprice, and persist the returned streak. Per-city streaks
are written every cycle regardless of push outcome (rate-limited or
failed pushes must not stall the pump countdown)."
git push
```

---

### Task 3: UI — max price input, PATCH allowlist, PriceLadder ceiling line

**Files:**
- Modify: `src/app/kaspi-shop/page.tsx`
- Modify: `src/app/api/kaspi-shop/products/route.ts`

**Interfaces:**
- Consumes: nothing new from Tasks 1-2 (reads the same `max_price` column the previous tasks already wired up server-side).
- Produces: nothing new consumed by later tasks (this is the final task).

**The allowlist gotcha**: `PATCH /api/kaspi-shop/products` validates and applies only fields in its `allowed` array. This exact class of bug (a field exists in the DB and the edit form but silently fails to save because this array wasn't updated) has already happened twice in this feature area. Do not skip Step 1.

- [ ] **Step 1: Add `max_price` to the PATCH allowlist**

In `src/app/api/kaspi-shop/products/route.ts`, change:

```ts
  const allowed = ['floor_price', 'undercut_step', 'check_frequency_minutes', 'enabled', 'stock_count', 'demping_strategy', 'excluded_city_codes', 'excluded_merchant_ids']
```

to:

```ts
  const allowed = ['floor_price', 'undercut_step', 'check_frequency_minutes', 'enabled', 'stock_count', 'demping_strategy', 'excluded_city_codes', 'excluded_merchant_ids', 'max_price']
```

- [ ] **Step 2: Add `max_price` to the `Product` type and `editValues`**

In `src/app/kaspi-shop/page.tsx`, change the `Product` type (near the top of the file):

```ts
type Product = {
  id: string
  kaspi_sku: string
  product_name: string
  brand: string
  store_id: string
  stock_count: number
  own_current_price: number
  floor_price: number
  undercut_step: number
  check_frequency_minutes: number
  enabled: boolean
  last_checked_at: string | null
  last_competitor_price: number | null
  demping_strategy: string
  excluded_city_codes: string[]
  excluded_merchant_ids: string[]
}
```

to add `max_price: number | null` after `floor_price`:

```ts
type Product = {
  id: string
  kaspi_sku: string
  product_name: string
  brand: string
  store_id: string
  stock_count: number
  own_current_price: number
  floor_price: number
  max_price: number | null
  undercut_step: number
  check_frequency_minutes: number
  enabled: boolean
  last_checked_at: string | null
  last_competitor_price: number | null
  demping_strategy: string
  excluded_city_codes: string[]
  excluded_merchant_ids: string[]
}
```

Then find the `editValues` state type declaration:

```ts
  const [editValues, setEditValues] = useState<Record<string, { floorPrice: string; undercutStep: string; strategy: string; excludedCities: string; excludedMerchants: string }>>({})
```

and change it to add `maxPrice: string`:

```ts
  const [editValues, setEditValues] = useState<Record<string, { floorPrice: string; maxPrice: string; undercutStep: string; strategy: string; excludedCities: string; excludedMerchants: string }>>({})
```

Then find where `editValues` gets seeded from loaded products (inside `load()`):

```ts
              next[p.id] = {
                floorPrice: String(p.floor_price),
                undercutStep: String(p.undercut_step),
                strategy: p.demping_strategy || 'undercut_leader',
                excludedCities: (p.excluded_city_codes || []).join(', '),
                excludedMerchants: (p.excluded_merchant_ids || []).join(', '),
              }
```

and add `maxPrice`:

```ts
              next[p.id] = {
                floorPrice: String(p.floor_price),
                maxPrice: p.max_price !== null ? String(p.max_price) : '',
                undercutStep: String(p.undercut_step),
                strategy: p.demping_strategy || 'undercut_leader',
                excludedCities: (p.excluded_city_codes || []).join(', '),
                excludedMerchants: (p.excluded_merchant_ids || []).join(', '),
              }
```

Then find the fallback default used when rendering a product whose `editValues` entry hasn't loaded yet:

```ts
                  const v = editValues[p.id] || { floorPrice: String(p.floor_price), undercutStep: String(p.undercut_step), strategy: p.demping_strategy, excludedCities: '', excludedMerchants: '' }
```

and add `maxPrice` there too:

```ts
                  const v = editValues[p.id] || { floorPrice: String(p.floor_price), maxPrice: p.max_price !== null ? String(p.max_price) : '', undercutStep: String(p.undercut_step), strategy: p.demping_strategy, excludedCities: '', excludedMerchants: '' }
```

- [ ] **Step 3: Add the "Максимальная цена" input**

Find the floor-price input in the product edit form:

```tsx
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Минимальная цена</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number"
                                    value={v.floorPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, floorPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Шаг, ₸</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number"
                                    value={v.undercutStep} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, undercutStep: e.target.value } }))} />
                                </label>
                              </div>
```

Replace it with a 3-column grid adding the max-price input:

```tsx
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Минимальная цена</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number"
                                    value={v.floorPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, floorPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Максимальная цена</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number" placeholder="—"
                                    value={v.maxPrice} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, maxPrice: e.target.value } }))} />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Шаг, ₸</span>
                                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" type="number"
                                    value={v.undercutStep} onChange={e => setEditValues(prev => ({ ...prev, [p.id]: { ...v, undercutStep: e.target.value } }))} />
                                </label>
                              </div>
```

- [ ] **Step 4: Save `max_price` in `saveProductSettings`**

Find:

```ts
  async function saveProductSettings(id: string) {
    const v = editValues[id]
    if (!v) return
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', {
      method: 'PATCH', headers,
      body: JSON.stringify({
        id,
        floor_price: Number(v.floorPrice),
        undercut_step: Number(v.undercutStep),
        demping_strategy: v.strategy,
        excluded_city_codes: v.excludedCities.split(',').map(s => s.trim()).filter(Boolean),
        excluded_merchant_ids: v.excludedMerchants.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    load()
  }
```

Change the body to include `max_price` — an empty string means the seller cleared the field, which must save as `null` (pump disabled), not `0` or `NaN`:

```ts
  async function saveProductSettings(id: string) {
    const v = editValues[id]
    if (!v) return
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/products', {
      method: 'PATCH', headers,
      body: JSON.stringify({
        id,
        floor_price: Number(v.floorPrice),
        max_price: v.maxPrice.trim() === '' ? null : Number(v.maxPrice),
        undercut_step: Number(v.undercutStep),
        demping_strategy: v.strategy,
        excluded_city_codes: v.excludedCities.split(',').map(s => s.trim()).filter(Boolean),
        excluded_merchant_ids: v.excludedMerchants.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    load()
  }
```

- [ ] **Step 5: Add a ceiling line to `PriceLadder`**

Find the `PriceLadder` component:

```tsx
function PriceLadder({ own, competitor, floor }: { own: number; competitor: number | null; floor: number }) {
  const ceiling = Math.max(own, competitor ?? own, floor) * 1.15
  const span = Math.max(ceiling - floor, 1)
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - floor) / span) * 100))
  const winning = competitor !== null && own <= competitor
  const atFloor = own <= floor + 0.01

  return (
    <div className="pt-1">
      <div className="relative h-1.5 rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct(floor)}%`, background: 'repeating-linear-gradient(135deg, #FFE2E3 0, #FFE2E3 4px, transparent 4px, transparent 8px)' }}
        />
        {competitor !== null && (
          <motion.div
            className="absolute -top-1.5 w-3.5 h-3.5 rounded-full bg-white ring-2 ring-[#1C2056]/30"
            initial={false}
            animate={{ left: `calc(${pct(competitor)}% - 7px)` }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        )}
        <motion.div
          className={`absolute -top-1.5 w-3.5 h-3.5 rounded-full ring-2 ring-white shadow ${winning ? 'bg-[#00C880]' : 'bg-[#FF5A5F]'}`}
          initial={false}
          animate={{ left: `calc(${pct(own)}% - 7px)` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
        <span>Пол {floor.toLocaleString('ru-KZ')} ₸</span>
        {atFloor && <span className="text-[#FF5A5F] font-medium">Упёрлись в минимум</span>}
        {competitor !== null && <span>Конкурент {competitor.toLocaleString('ru-KZ')} ₸</span>}
      </div>
    </div>
  )
}
```

Replace the whole component (its internal local variable `ceiling` means "top of the visual gauge," a different concept from the new `maxPrice` prop — the seller's actual ceiling — so name the new prop `maxPrice`, not `ceiling`, to avoid confusion) with:

```tsx
function PriceLadder({ own, competitor, floor, maxPrice }: { own: number; competitor: number | null; floor: number; maxPrice: number | null }) {
  const gaugeTop = Math.max(own, competitor ?? own, floor, maxPrice ?? 0) * 1.15
  const span = Math.max(gaugeTop - floor, 1)
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - floor) / span) * 100))
  const winning = competitor !== null && own <= competitor
  const atFloor = own <= floor + 0.01

  return (
    <div className="pt-1">
      <div className="relative h-1.5 rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct(floor)}%`, background: 'repeating-linear-gradient(135deg, #FFE2E3 0, #FFE2E3 4px, transparent 4px, transparent 8px)' }}
        />
        {maxPrice !== null && (
          <div
            className="absolute inset-y-0 right-0 rounded-full"
            style={{ width: `${100 - pct(maxPrice)}%`, background: 'repeating-linear-gradient(135deg, #E2F7EE 0, #E2F7EE 4px, transparent 4px, transparent 8px)' }}
          />
        )}
        {competitor !== null && (
          <motion.div
            className="absolute -top-1.5 w-3.5 h-3.5 rounded-full bg-white ring-2 ring-[#1C2056]/30"
            initial={false}
            animate={{ left: `calc(${pct(competitor)}% - 7px)` }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        )}
        <motion.div
          className={`absolute -top-1.5 w-3.5 h-3.5 rounded-full ring-2 ring-white shadow ${winning ? 'bg-[#00C880]' : 'bg-[#FF5A5F]'}`}
          initial={false}
          animate={{ left: `calc(${pct(own)}% - 7px)` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
        <span>Пол {floor.toLocaleString('ru-KZ')} ₸</span>
        {atFloor && <span className="text-[#FF5A5F] font-medium">Упёрлись в минимум</span>}
        {competitor !== null && <span>Конкурент {competitor.toLocaleString('ru-KZ')} ₸</span>}
        {maxPrice !== null && <span>Потолок {maxPrice.toLocaleString('ru-KZ')} ₸</span>}
      </div>
    </div>
  )
}
```

Then find the call site:

```tsx
                        <PriceLadder own={p.own_current_price} competitor={p.last_competitor_price} floor={p.floor_price} />
```

and pass the new prop:

```tsx
                        <PriceLadder own={p.own_current_price} competitor={p.last_competitor_price} floor={p.floor_price} maxPrice={p.max_price} />
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: passes clean.

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/kaspi-shop/page.tsx src/app/api/kaspi-shop/products/route.ts
git commit -m "feat(kaspi-shop): Макс-памп UI -- max-price input, PATCH allowlist, PriceLadder ceiling line"
git push
```
