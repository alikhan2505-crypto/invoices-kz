# Kaspi Shop: Per-City Competitive Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make competitor-price discovery genuinely city-aware (instead of every city converging to one identical price) for a seller-chosen subset of "important" cities, fix a pre-existing rate-limit budget accounting bug this makes materially more dangerous, and give the seller real visibility/control over it.

**Architecture:** Extend the existing GitHub-Actions-relay repricer pipeline (already fetches competitor offers and pushes per-city prices, just does it identically for every city today) to fetch and push per selected city. Pure per-city repricing math lives in `pricing.ts` as new, independently testable functions; `checkCycle.ts` stays the thin orchestration layer that calls them.

**Tech Stack:** Next.js (App Router) API routes, Supabase (Postgres), Vitest, GitHub Actions (`.mjs` script), Kaspi's `yml/offer-view/offers/{sku}` (public, unauthenticated, city-scoped) and `pricefeed/upload/merchant/process` (authenticated cabinet session) endpoints.

## Global Constraints

- A store that has NOT configured `tracked_city_codes` (empty array — the default) must see **zero behavior change** from before this plan. This is the single most important constraint: the legacy code path must remain byte-for-byte the same for unconfigured stores.
- `floor_price` / `undercut_step` / `demping_strategy` stay global per product — not configurable per city (locked design decision, do not add per-city overrides).
- `tracked_city_codes` is one list per store (`kaspi_shop_connections`), applied to all tracked products — not configured per product.
- Billing stays 1 Kaspi Shop Wallet credit per check cycle regardless of how many cities that cycle covers.
- Only pure-logic modules get Vitest tests (this plan: `pricing.ts`'s new functions). Routes, pages, and the GitHub Actions script get no test coverage, matching this project's established convention.
- Direct-to-main commits, no feature branches — commit after every task, push after every commit.
- Every task ends with `npx tsc --noEmit`. The final task also runs `npm run build`.
- Supabase migrations are applied directly via the `apply_migration` MCP tool against project_id `terjitbqgrjlqezyydql` by the controller, not written as a plan step — the two columns this plan needs (`kaspi_shop_connections.tracked_city_codes text[] not null default '{}'` and `kaspi_shop_connections.city_lookup_cache jsonb`) were already applied before this plan was written. Do not re-run this migration.

---

### Task 1: Live research — city-name lookup source (controller-only, no subagent dispatch)

**Files:**
- Create: `docs/superpowers/specs/2026-08-14-kaspi-cabinet-city-names-findings.md`

**Interfaces:**
- Produces: a findings doc stating either (a) a confirmed endpoint + real request/response shape for a `{cityCode -> cityName}` lookup reachable using an already-connected seller's stored `session_cookies`, or (b) an explicit "no clean source found" conclusion. Task 5 depends on this file's conclusion.

This is a controller-only research task — do not dispatch it to a subagent, it requires either live browser driving of the real Kaspi cabinet or a temporary diagnostic route deployed to production and inspected via Vercel runtime logs (the same pattern already used earlier this session for confirming `yml/offer-view/offers/{sku}`'s existence). `getPointCities` was seen in the cabinet's GraphQL operation catalog during the original 2026-08-12 reconnaissance (`mc/facade/graphql`) but its exact response shape was never captured.

- [ ] **Step 1: Attempt to confirm `getPointCities` (or an equivalent) live**

Prefer the low-cost route first: add a temporary diagnostic addition to an already-authenticated, already-deployed code path (mirroring `diagnosticCheckOfferViewEndpoint`'s pattern from the seller-blocklist feature earlier this session) that calls `mc.shop.kaspi.kz/facade/graphql` with `opName=getPointCities` (or whatever the real operation is, if `getPointCities` turns out wrong) using the already-connected ABIL-SISTERS account's stored, decrypted `session_cookies` — no fresh phone/SMS login needed, since a valid connected session already exists server-side. Deploy, trigger once, read the real response via Vercel runtime logs, then remove the diagnostic code in the same commit (or the next one) so it never ships.

- [ ] **Step 2: Write the findings doc**

If a real source was found, document: the exact URL, HTTP method, request body/query shape, and a real captured response sample showing `{code, name}`-shaped entries (or whatever the real field names are). State explicitly whether it requires the connection's `session_cookies` (authenticated) or is public.

If no clean source was found after a reasonable attempt, write that conclusion explicitly instead of leaving the file half-done — Task 5 has a fully-specified fallback for this case (raw city codes shown in the picker, no name cache attempted) and is not blocked by a "no" answer.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-14-kaspi-cabinet-city-names-findings.md
git commit -m "docs(kaspi-shop): capture the real city-name lookup source (or its absence)"
git push
```

---

### Task 2: Pure per-city repricing helpers

**Files:**
- Modify: `src/lib/kaspiShop/pricing.ts`
- Test: `src/lib/kaspiShop/pricing.test.ts`

**Interfaces:**
- Consumes: `computeRepriceCandidate` (already exists in this file, unchanged).
- Produces: `resolveTargetCities(trackedCityCodes: string[], excludedCityCodes: string[]): string[]`, `computePerCityReprice(params): CityRepriceResult[]`, and the types `CompetitorOffer`, `CityOffers`, `CityRepriceResult` — Task 3 imports `resolveTargetCities`, Task 4 imports `computePerCityReprice` and the three types.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/kaspiShop/pricing.test.ts` (append after the existing `describe('computeRepriceCandidate', ...)` block, before `generatePriceListXml`'s tests if any exist below it):

```ts
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
      { cityCode: 'A', price: 9900, heldAtFloor: false },
      { cityCode: 'B', price: 7900, heldAtFloor: false },
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
    expect(results).toEqual([{ cityCode: 'A', price: 8900, heldAtFloor: false }])
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
      { cityCode: 'A', price: 5000, heldAtFloor: true },
      { cityCode: 'B', price: 19900, heldAtFloor: false },
    ])
  })

  it('returns an empty array for an empty city-offers list', () => {
    expect(computePerCityReprice({
      cityOffers: [], excludedMerchantIds: [], undercutStep: 100, floorPrice: 500, strategy: 'undercut_leader', currentCityPrices: {},
    })).toEqual([])
  })
})
```

Update the top import line of `pricing.test.ts` to also import the new functions:

```ts
import { describe, it, expect } from 'vitest'
import { computeRepriceCandidate, generatePriceListXml, resolveTargetCities, computePerCityReprice } from './pricing'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kaspiShop/pricing.test.ts`
Expected: FAIL — `resolveTargetCities`/`computePerCityReprice` are not exported yet.

- [ ] **Step 3: Implement the functions**

Add to `src/lib/kaspiShop/pricing.ts`, after the existing `computeRepriceCandidate` function (before `escapeXml`):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kaspiShop/pricing.test.ts`
Expected: PASS, all tests including the pre-existing `computeRepriceCandidate` ones.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/kaspiShop/pricing.ts src/lib/kaspiShop/pricing.test.ts
git commit -m "feat(kaspi-shop): pure per-city repricing helpers (resolveTargetCities, computePerCityReprice)"
git push
```

---

### Task 3: `getDueTrackedProducts` city targeting + rate-limit budget scope fix

**Files:**
- Modify: `src/lib/kaspiShop/checkCycle.ts`

**Interfaces:**
- Consumes: `resolveTargetCities` from Task 2 (`./pricing`).
- Produces: `DueTrackedProduct = { id: string; kaspiSku: string; targetCities: string[] }` (the `targetCities` field is new — Task 4's GitHub Actions script step reads it).

- [ ] **Step 1: Extend `DueTrackedProduct` and `getDueTrackedProducts`**

In `src/lib/kaspiShop/checkCycle.ts`, change the current import line:

```ts
import { computeRepriceCandidate, DempingStrategy } from './pricing'
```

to:

```ts
import { computeRepriceCandidate, DempingStrategy, resolveTargetCities } from './pricing'
```

Replace the current `DueTrackedProduct` type and `getDueTrackedProducts` function:

```ts
export type DueTrackedProduct = { id: string; kaspiSku: string; targetCities: string[] }

export async function getDueTrackedProducts(): Promise<DueTrackedProduct[]> {
  const { data: due } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_sku, last_checked_at, check_frequency_minutes, enabled, excluded_city_codes, kaspi_shop_connections(paused, tracked_city_codes)')
    .eq('enabled', true)

  const now = Date.now()
  return (due || [])
    .filter((p: any) => {
      if (p.kaspi_shop_connections?.paused) return false
      if (!p.last_checked_at) return true
      const elapsedMinutes = (now - new Date(p.last_checked_at).getTime()) / 60000
      return elapsedMinutes >= p.check_frequency_minutes
    })
    .map((p: any) => ({
      id: p.id,
      kaspiSku: p.kaspi_sku,
      targetCities: resolveTargetCities(p.kaspi_shop_connections?.tracked_city_codes || [], p.excluded_city_codes || []),
    }))
}
```

- [ ] **Step 2: Fix `pushCityPrice`'s rate-limit budget query scope**

Replace the current budget-check block inside `pushCityPrice` (the part reading `kaspi_shop_price_checks` scoped to `tracked_product_id`):

```ts
  const since = new Date(Date.now() - KASPI_RATE_LIMIT_WINDOW_MS).toISOString()
  const { data: recentPushes } = await supabase
    .from('kaspi_shop_price_checks')
    .select('checked_at')
    .eq('tracked_product_id', params.trackedProductId)
    .eq('action', 'updated')
    .gte('checked_at', since)
  const timestamps = (recentPushes || []).map(r => new Date(r.checked_at).getTime())
```

with a version scoped to the whole connection (store), using real per-city push timestamps instead of an approximation from cycle-level log rows:

```ts
  const since = new Date(Date.now() - KASPI_RATE_LIMIT_WINDOW_MS).toISOString()
  const { data: connProducts } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id')
    .eq('connection_id', params.connectionId)
  const productIds = (connProducts || []).map((p: any) => p.id)
  const { data: recentPushes } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('updated_at')
    .in('tracked_product_id', productIds)
    .gte('updated_at', since)
  const timestamps = (recentPushes || []).map((r: any) => new Date(r.updated_at).getTime())
```

(the `isWithinBudget(timestamps, Date.now())` check right below this block, and everything after it in `pushCityPrice`, is unchanged — only how `timestamps` gets computed changes; the previous 250/30min limit was per-product cycles, this now reflects the actual per-store push count, which is what Kaspi's real limit applies to).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes. (`applyPriceCheckResult` still references the old `CompetitorOffer[] | null` signature at this point — that's fine, Task 4 changes it; this task only touches `getDueTrackedProducts` and `pushCityPrice`, which don't reference `applyPriceCheckResult`'s signature.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiShop/checkCycle.ts
git commit -m "fix(kaspi-shop): scope the price-push rate-limit budget to the whole store, not one product

The 250-changes/30min Kaspi limit is per store, but the budget check was
querying kaspi_shop_price_checks scoped to tracked_product_id -- a table
with one row per check CYCLE, not one row per actual city-level push. It
never reflected real push volume. Also threads targetCities (tracked
minus excluded cities) through getDueTrackedProducts for the upcoming
per-city fetch loop."
git push
```

---

### Task 4: Per-city repricing rewire — `applyPriceCheckResult`, `/cron/apply`, GitHub Actions script

**Files:**
- Modify: `src/lib/kaspiShop/checkCycle.ts`
- Modify: `src/app/api/kaspi-shop/cron/apply/route.ts`
- Modify: `.github/scripts/kaspi-shop-price-check.mjs`

**Interfaces:**
- Consumes: `computePerCityReprice`, `CityOffers`, `CompetitorOffer` from Task 2 (`./pricing`); `DueTrackedProduct.targetCities` from Task 3.
- Produces: `applyPriceCheckResult(trackedProductId: string, offers: ApplyOffers | null, fetchError: string | null): Promise<void>` where `ApplyOffers = { perCityOffers: Record<string, CompetitorOffer[]> } | { competitorOffers: CompetitorOffer[] }`.

- [ ] **Step 1: Replace `applyPriceCheckResult` in `checkCycle.ts`**

First, change the import line at the top of the file (Task 3 left it as `import { computeRepriceCandidate, DempingStrategy, resolveTargetCities } from './pricing'`) to also pull in the two new pure functions and types this task needs:

```ts
import { computeRepriceCandidate, DempingStrategy, resolveTargetCities, computePerCityReprice, CompetitorOffer, CityOffers } from './pricing'
```

Then replace the entire current `applyPriceCheckResult` function (from `export async function applyPriceCheckResult(` through its closing `}`) with:

```ts
export type ApplyOffers =
  | { perCityOffers: Record<string, CompetitorOffer[]> }
  | { competitorOffers: CompetitorOffer[] }

// One tracked product, one already-fetched set of competitor offers (or a
// fetch error, reported by the caller since the fetch itself no longer
// happens here). Never throws -- a single product's failure must not abort
// the rest of the caller's batch. Always logs a kaspi_shop_price_checks row
// and debits one credit, even on error -- the competitor-price check itself
// is the billable work, and an error row is real information the seller
// should see in their history, not a silently dropped cycle.
//
// Two payload shapes: `perCityOffers` (the store has configured
// tracked_city_codes -- each city gets its own competitor offers and its
// own computeRepriceCandidate call) and the legacy `competitorOffers` flat
// array (the store hasn't configured per-city tracking yet -- exact
// pre-existing behavior, untouched, so nothing changes for a store that
// hasn't opted in). See docs/superpowers/specs/2026-08-14-kaspi-shop-city-pricing-design.md.
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

  if (!fetchError && offers && 'perCityOffers' in offers) {
    const excludedMerchants: string[] = product.excluded_merchant_ids || []
    const { data: cityRows } = await supabase
      .from('kaspi_shop_product_city_prices')
      .select('city_code, own_current_price')
      .eq('tracked_product_id', trackedProductId)
    const currentCityPrices: Record<string, number> = {}
    for (const c of cityRows || []) currentCityPrices[c.city_code] = Number(c.own_current_price)

    const cityOffersList: CityOffers[] = Object.entries(offers.perCityOffers).map(([cityCode, cityOffers]) => ({ cityCode, offers: cityOffers }))
    const results = computePerCityReprice({
      cityOffers: cityOffersList,
      excludedMerchantIds: excludedMerchants,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      currentCityPrices,
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
        for (const result of results) {
          // Decide per city, not from the aggregate `action` above -- the
          // aggregate can read "no_change" even when one city genuinely
          // moved, if a different city happens to still hold the overall
          // minimum.
          if (currentCityPrices[result.cityCode] !== undefined && result.price === currentCityPrices[result.cityCode]) continue
          const pushResult = await pushCityPrice({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            trackedProductId,
            sku: product.kaspi_sku,
            model: product.product_name,
            storeId: product.store_id,
            cityCode: result.cityCode,
            newPrice: result.price,
          })
          if (pushResult.pushed) {
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: result.price, last_competitor_price: competitorPrice, updated_at: new Date().toISOString() })
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
    const { price, heldAtFloor } = computeRepriceCandidate({
      competitorPrices,
      undercutStep: Number(product.undercut_step),
      floorPrice: Number(product.floor_price),
      strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
      ownCurrentPrice: ownPriceBefore,
    })
    ownPriceAfter = price
    action = heldAtFloor ? 'held_at_floor' : (price === ownPriceBefore ? 'no_change' : 'updated')

    await supabase
      .from('kaspi_shop_tracked_products')
      .update({ own_current_price: ownPriceAfter, last_checked_at: new Date().toISOString(), last_competitor_price: competitorPrice })
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
        for (const city of citiesToPush) {
          const cityCandidate = computeRepriceCandidate({
            competitorPrices,
            undercutStep: Number(product.undercut_step),
            floorPrice: Number(product.floor_price),
            strategy: (product.demping_strategy as DempingStrategy) || 'undercut_leader',
            ownCurrentPrice: Number(city.own_current_price ?? ownPriceBefore),
          })

          const result = await pushCityPrice({
            connectionId: connection.id,
            merchantId: connection.merchant_id,
            sessionCookies,
            trackedProductId,
            sku: product.kaspi_sku,
            model: product.product_name,
            storeId: product.store_id,
            cityCode: city.city_code,
            newPrice: cityCandidate.price,
          })

          if (result.pushed) {
            await supabase
              .from('kaspi_shop_product_city_prices')
              .update({ own_current_price: cityCandidate.price, last_competitor_price: competitorPrice, updated_at: new Date().toISOString() })
              .eq('tracked_product_id', trackedProductId)
              .eq('city_code', city.city_code)
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

  await supabase.from('kaspi_shop_price_checks').insert({
    tracked_product_id: trackedProductId,
    competitor_price: competitorPrice,
    own_price_before: ownPriceBefore,
    own_price_after: ownPriceAfter,
    action,
    credit_cost: 1,
    error_message: fetchError,
  })

  try {
    await debitKaspiShopWallet(userId, 1, `Проверка цены: ${product.product_name}`)
  } catch (err: any) {
    console.error('kaspi-shop checkCycle: wallet debit failed for user', userId, 'product', trackedProductId, ':', err.message)
  }
}
```

- [ ] **Step 2: Update `/cron/apply`'s route to forward either payload shape**

Replace the body of `src/app/api/kaspi-shop/cron/apply/route.ts`'s `POST` handler's last two lines (`await applyPriceCheckResult(...)` and the return) with:

```ts
  const offers = body.perCityOffers
    ? { perCityOffers: body.perCityOffers }
    : body.competitorOffers
    ? { competitorOffers: body.competitorOffers }
    : null

  await applyPriceCheckResult(body.trackedProductId, offers, body.fetchError ?? null)
  return NextResponse.json({ ok: true })
```

(everything above that in the file — the secret check and the `trackedProductId` presence check — is unchanged.)

- [ ] **Step 3: Update the GitHub Actions script to fetch per city**

In `.github/scripts/kaspi-shop-price-check.mjs`, rename `fetchCompetitorOffers(kaspiSku)` to `fetchOffersForCity(kaspiSku, cityId)` and parameterize the hardcoded city:

```js
const CITY_ID = '750000000' // Almaty -- legacy reference city, used only when a product has no targetCities configured
const OFFERS_LIMIT = 50 // covers every real product observed live (max seen: 30 offers) in one request, no pagination needed

async function fetchOffersForCity(kaspiSku, cityId) {
  const productPageUrl = `https://kaspi.kz/shop/p/-${encodeURIComponent(kaspiSku)}/?c=${cityId}`
  const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${encodeURIComponent(kaspiSku)}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/*',
      'content-type': 'application/json; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      Referer: productPageUrl,
      Origin: 'https://kaspi.kz',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify({ cityId, id: kaspiSku, merchantUID: [], limit: OFFERS_LIMIT, page: 0, sortOption: 'PRICE' }),
  })
  if (!res.ok) {
    throw new Error(`Kaspi offer-view fetch failed for sku ${kaspiSku} city ${cityId}: HTTP ${res.status}`)
  }
  const json = await res.json()
  const offers = Array.isArray(json.offers) ? json.offers : []
  return offers
    .filter(o => o && o.merchantId != null && Number(o.price) > 0)
    .map(o => ({ merchantId: String(o.merchantId), price: Number(o.price) }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

Replace the `main()` function's per-product loop body with:

```js
  for (const product of due) {
    let competitorOffers = null
    let perCityOffers = null
    let fetchError = null
    try {
      if (product.targetCities && product.targetCities.length > 0) {
        perCityOffers = {}
        for (const cityCode of product.targetCities) {
          perCityOffers[cityCode] = await fetchOffersForCity(product.kaspiSku, cityCode)
          await sleep(300)
        }
      } else {
        competitorOffers = await fetchOffersForCity(product.kaspiSku, CITY_ID)
      }
    } catch (err) {
      fetchError = err.message
    }

    const applyRes = await fetch(`${baseUrl}/api/kaspi-shop/cron/apply`, {
      method: 'POST',
      headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ trackedProductId: product.id, competitorOffers, perCityOffers, fetchError }),
    })
    if (!applyRes.ok) {
      console.error(`apply failed for ${product.id}: HTTP ${applyRes.status}`)
    } else {
      const offerCount = perCityOffers ? Object.values(perCityOffers).reduce((sum, arr) => sum + arr.length, 0) : (competitorOffers ? competitorOffers.length : 0)
      console.log(`${product.id}: ${offerCount} offer(s) across ${perCityOffers ? Object.keys(perCityOffers).length : 1} cit(y/ies), fetchError=${fetchError}`)
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/checkCycle.ts src/app/api/kaspi-shop/cron/apply/route.ts .github/scripts/kaspi-shop-price-check.mjs
git commit -m "feat(kaspi-shop): fetch and reprice per city for stores that configure tracked_city_codes

Stores that haven't configured tracked_city_codes see zero behavior
change (the legacy single-reference-city path is untouched). Stores that
have now get an independent computeRepriceCandidate call per tracked
city, using that city's own competitor offers -- fixing the bug where
every city converged to the same price."
git push
```

---

### Task 5: City-name lookup/cache + settings route

**Files:**
- Modify: `src/lib/kaspiShop/cabinetApi.ts` (only if Task 1's findings doc confirmed a real endpoint — see Step 1)
- Modify: `src/app/api/kaspi-shop/settings/route.ts`

**Interfaces:**
- Consumes: Task 1's findings doc (`docs/superpowers/specs/2026-08-14-kaspi-cabinet-city-names-findings.md`) for the exact shape, if one was found.
- Produces: `PATCH /api/kaspi-shop/settings/cities` (body `{trackedCityCodes: string[]}` → `{ok: true}`), updating `kaspi_shop_connections.tracked_city_codes` and best-effort refreshing `city_lookup_cache`.

- [ ] **Step 1: Read the Task 1 findings doc first**

Open `docs/superpowers/specs/2026-08-14-kaspi-cabinet-city-names-findings.md`. It concludes one of two ways:

**(a) A real endpoint was confirmed.** Implement, in `src/lib/kaspiShop/cabinetApi.ts`, a function matching the doc's exact confirmed shape:

```ts
export async function fetchCityNames(sessionCookies: string, merchantId: string): Promise<Record<string, string>> {
  // Use the exact URL, method, and request body the findings doc captured.
  // Parse its exact response shape into { [cityCode]: cityName }.
  // On any non-ok response or parse failure, return {} rather than throwing
  // -- this is a best-effort cache refresh, never something that should
  // block saving the seller's city selection.
}
```

**(b) No clean source was found.** Skip this step entirely — do not add `fetchCityNames` or touch `cabinetApi.ts`. Proceed directly to Step 2; the `PATCH` handler in that case simply does not attempt any cache refresh, and the UI (Task 6) already falls back to showing raw city codes when `city_lookup_cache` is empty.

- [ ] **Step 2: Add the `PATCH` handler to the settings route**

Add to `src/app/api/kaspi-shop/settings/route.ts`, after the existing `POST` handler and before `DELETE` (import `loadConnection` from `./connection` alongside whatever else the file already imports, if not already imported):

If Task 1 found a real endpoint (case (a) above), add this import at the top of the file:

```ts
import { fetchCityNames } from '@/lib/kaspiShop/cabinetApi'
```

Then add the handler:

```ts
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const trackedCityCodes = body?.trackedCityCodes
  if (!Array.isArray(trackedCityCodes) || !trackedCityCodes.every((c: unknown) => typeof c === 'string')) {
    return NextResponse.json({ error: 'trackedCityCodes (string[]) required' }, { status: 400 })
  }

  const { data: connection, error } = await supabase
    .from('kaspi_shop_connections')
    .update({ tracked_city_codes: trackedCityCodes })
    .eq('user_id', user.id)
    .select('id, merchant_id, session_cookies')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

If Task 1 found a real endpoint (case (a)), extend the handler to also best-effort refresh the cache right before the final `return`, guarded so a fetch failure never fails the save the seller is waiting on:

```ts
  if (connection?.session_cookies) {
    try {
      const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
      const names = await fetchCityNames(sessionCookies, connection.merchant_id)
      if (Object.keys(names).length > 0) {
        await supabase.from('kaspi_shop_connections').update({ city_lookup_cache: names }).eq('id', connection.id)
      }
    } catch (err: any) {
      console.error('kaspi-shop settings: city name cache refresh failed (non-fatal)', err.message)
    }
  }

  return NextResponse.json({ ok: true })
```

(replace the earlier plain `return NextResponse.json({ ok: true })` with this block; this needs `decryptAtRest` from `@/lib/kaspiPay/crypto` and `getKey` from `./connection` imported at the top of the file alongside `fetchCityNames`, matching the pattern already used in `checkCycle.ts`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kaspi-shop/settings/route.ts src/lib/kaspiShop/cabinetApi.ts
git commit -m "feat(kaspi-shop): PATCH /settings/cities to save the store's tracked_city_codes"
git push
```

---

### Task 6: UI — city picker, excluded-cities multi-select, per-product city prices

**Files:**
- Modify: `src/app/kaspi-shop/page.tsx`
- Modify: `src/app/api/kaspi-shop/wallet/route.ts`
- Create: `src/app/api/kaspi-shop/products/city-prices/route.ts`

**Interfaces:**
- Consumes: `PATCH /api/kaspi-shop/settings/cities` from Task 5.
- Produces: `GET /api/kaspi-shop/products/city-prices?id=<trackedProductId>` → `{cities: {cityCode: string; cityName: string; ownPrice: number; competitorPrice: number | null}[]}`.

- [ ] **Step 1: New route for per-product city prices**

Create `src/app/api/kaspi-shop/products/city-prices/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Only shows the store's tracked_city_codes, not all ~150+ imported city
// rows -- those are the only cities this feature actively manages, so
// they're the only ones worth showing the seller.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trackedProductId = req.nextUrl.searchParams.get('id')
  if (!trackedProductId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: product, error: productError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, connection_id, kaspi_shop_connections(tracked_city_codes, city_lookup_cache)')
    .eq('id', trackedProductId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: 'Не удалось загрузить цены по городам' }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  const connection: any = product.kaspi_shop_connections
  const trackedCityCodes: string[] = connection?.tracked_city_codes || []
  const cityNames: Record<string, string> = connection?.city_lookup_cache || {}

  const { data: cityRows, error: cityError } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('city_code, own_current_price, last_competitor_price')
    .eq('tracked_product_id', trackedProductId)
    .in('city_code', trackedCityCodes)
  if (cityError) return NextResponse.json({ error: 'Не удалось загрузить цены по городам' }, { status: 500 })

  const cities = (cityRows || []).map(c => ({
    cityCode: c.city_code,
    cityName: cityNames[c.city_code] || c.city_code,
    ownPrice: Number(c.own_current_price),
    competitorPrice: c.last_competitor_price !== null ? Number(c.last_competitor_price) : null,
  }))

  return NextResponse.json({ cities })
}
```

- [ ] **Step 2: City picker card on `/kaspi-shop`**

In `src/app/kaspi-shop/page.tsx`, add new state near the existing `editValues` state (after line 120's `const [editValues, ...] = useState(...)`):

```ts
  const [trackedCities, setTrackedCities] = useState<string[]>([])
  const [availableCities, setAvailableCities] = useState<{ code: string; name: string }[]>([])
  const [citiesSaving, setCitiesSaving] = useState(false)
```

In `load()`'s `walletRes.ok` branch (where `setBalance`/`setConnected`/etc. are set from `walletRes`'s JSON), add after the existing `setCompanyName(data.companyName ?? null)` line:

```ts
        setTrackedCities(data.trackedCityCodes || [])
        setAvailableCities(Object.entries(data.cityLookupCache || {}).map(([code, name]) => ({ code, name: String(name) })))
```

This requires extending `GET /api/kaspi-shop/wallet` (`src/app/api/kaspi-shop/wallet/route.ts`) to also return the two new fields. Its current `select(...)` call and response object are:

```ts
  const { data: connection } = await supabase
    .from('kaspi_shop_connections')
    .select('paused, session_status, company_name')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({
    balance,
    connected: !!connection,
    paused: connection?.paused ?? false,
    sessionStatus: connection?.session_status ?? null,
    companyName: connection?.company_name ?? null,
  })
```

Change to:

```ts
  const { data: connection } = await supabase
    .from('kaspi_shop_connections')
    .select('paused, session_status, company_name, tracked_city_codes, city_lookup_cache')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({
    balance,
    connected: !!connection,
    paused: connection?.paused ?? false,
    sessionStatus: connection?.session_status ?? null,
    companyName: connection?.company_name ?? null,
    trackedCityCodes: connection?.tracked_city_codes ?? [],
    cityLookupCache: connection?.city_lookup_cache ?? {},
  })
```

Add a new function near `togglePause`:

```ts
  async function saveTrackedCities(codes: string[]) {
    setTrackedCities(codes)
    setCitiesSaving(true)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/settings/cities', { method: 'PATCH', headers, body: JSON.stringify({ trackedCityCodes: codes }) })
    setCitiesSaving(false)
  }

  function toggleTrackedCity(code: string) {
    const next = trackedCities.includes(code) ? trackedCities.filter(c => c !== code) : [...trackedCities, code]
    saveTrackedCities(next)
  }
```

Add the picker card in the JSX, right after the closing `</motion.div>` of the hero card (after the line containing `</div>\n            </motion.div>` that follows the balance/credits block, i.e. right before the `{companyName && activeCount === 0 && ...}` block):

```tsx
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
              <div className="text-sm font-semibold text-gray-800 mb-1">Города для отслеживания конкурентов</div>
              <div className="text-[11px] text-gray-400 mb-3">
                {trackedCities.length === 0
                  ? 'Не настроено — цена реагирует на одного эталонного конкурента для всех городов, как раньше.'
                  : `Выбрано: ${trackedCities.length}. Конкурента и цену проверяем отдельно по каждому.`}
                {citiesSaving && ' Сохраняем…'}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableCities.map(city => (
                  <button key={city.code} onClick={() => toggleTrackedCity(city.code)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-colors ${trackedCities.includes(city.code) ? 'bg-[#1C2056] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {city.name}
                  </button>
                ))}
                {availableCities.length === 0 && (
                  <div className="text-[11px] text-gray-400">Список городов ещё не загружен.</div>
                )}
              </div>
            </div>
```

- [ ] **Step 3: Replace the raw-text excludedCities field with a multi-select**

Replace the current excludedCities `<label>` block (the one with `Исключить города (коды через запятую)` and its raw text `<input>`) with a multi-select limited to `trackedCities`:

```tsx
                              <label className="block mb-2">
                                <span className="text-[11px] text-gray-400 mb-1 block">Исключить города (для этого товара)</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {trackedCities.length === 0 && <span className="text-[11px] text-gray-400">Сначала выберите отслеживаемые города выше.</span>}
                                  {trackedCities.map(code => {
                                    const excluded = v.excludedCities.split(',').map(s => s.trim()).filter(Boolean).includes(code)
                                    const cityName = availableCities.find(c => c.code === code)?.name || code
                                    return (
                                      <button key={code} type="button"
                                        onClick={() => {
                                          const current = v.excludedCities.split(',').map(s => s.trim()).filter(Boolean)
                                          const next = excluded ? current.filter(c => c !== code) : [...current, code]
                                          setEditValues(prev => ({ ...prev, [p.id]: { ...v, excludedCities: next.join(', ') } }))
                                        }}
                                        className={`text-[11px] px-2 py-1 rounded-full ${excluded ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
                                        {cityName}
                                      </button>
                                    )
                                  })}
                                </div>
                              </label>
```

This keeps `editValues[id].excludedCities` as the same comma-separated string it already is (so `saveProductSettings`'s existing `v.excludedCities.split(',').map(s => s.trim()).filter(Boolean)` line needs no change) — only the editor UI changes, not the state shape or the save payload.

- [ ] **Step 4: Per-product "Цены по городам" section**

Add new state near `expandedId`:

```ts
  const [cityPrices, setCityPrices] = useState<Record<string, { cityCode: string; cityName: string; ownPrice: number; competitorPrice: number | null }[]>>({})
```

Replace the `onClick={() => setExpandedId(expanded ? null : p.id)}` handler on the product card's toggle button with one that also lazy-loads city prices the first time a card expands:

```tsx
                      <button onClick={() => {
                        const next = expanded ? null : p.id
                        setExpandedId(next)
                        if (next && !cityPrices[p.id] && trackedCities.length > 0) {
                          authHeader().then(headers =>
                            fetch(`/api/kaspi-shop/products/city-prices?id=${p.id}`, { headers })
                              .then(res => res.ok ? res.json() : { cities: [] })
                              .then(data => setCityPrices(prev => ({ ...prev, [p.id]: data.cities || [] })))
                          )
                        }
                      }} className="w-full text-left p-4">
```

Add the display block in the expanded section, right after the `excludedMerchants` `<label>` block and before the `<div className="flex gap-2">` (buttons row):

```tsx
                              {trackedCities.length > 0 && (
                                <div className="mb-3">
                                  <span className="text-[11px] text-gray-400 mb-1 block">Цены по городам</span>
                                  {!cityPrices[p.id] && <div className="text-[11px] text-gray-400">Загрузка…</div>}
                                  {cityPrices[p.id] && cityPrices[p.id].length === 0 && (
                                    <div className="text-[11px] text-gray-400">Нет данных ещё — появятся после первой проверки цен по этому товару.</div>
                                  )}
                                  {cityPrices[p.id] && cityPrices[p.id].length > 0 && (
                                    <div className="space-y-1">
                                      {cityPrices[p.id].map(c => (
                                        <div key={c.cityCode} className="flex items-center justify-between text-[11px]">
                                          <span className="text-gray-500">{c.cityName}</span>
                                          <span className="font-mono">
                                            <span className="text-[#1C2056] font-semibold">{c.ownPrice.toLocaleString('ru-KZ')} ₸</span>
                                            {c.competitorPrice !== null && <span className="text-gray-400"> · конкурент {c.competitorPrice.toLocaleString('ru-KZ')} ₸</span>}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: passes clean.

Run: `npm run build`
Expected: builds clean (catches any Next.js route-shape issues `tsc --noEmit` alone misses, per this project's established lesson from the original repricer plan).

- [ ] **Step 6: Commit**

```bash
git add src/app/kaspi-shop/page.tsx src/app/api/kaspi-shop/wallet/route.ts src/app/api/kaspi-shop/products/city-prices/route.ts
git commit -m "feat(kaspi-shop): city picker, per-product city exclusion multi-select, per-city price visibility"
git push
```
