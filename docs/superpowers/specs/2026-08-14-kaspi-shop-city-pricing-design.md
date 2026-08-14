# Kaspi Shop: Per-City Competitive Pricing — Design

## Origin

Biggest remaining repricer gap flagged against competitor research (Northline/PriceFeed both have real "Обход города" city-level competition, alemdata's finance module is a separate sub-project already shipped). Chosen by the user as the first of the "big" (non-quick-win) improvements, ahead of Позиция/buy-box tracking and Макс-памп.

## Current state (confirmed live 2026-08-14, before this design)

The plumbing for per-city pricing already exists and already runs live in production, but currently accomplishes nothing useful:

- `kaspi_shop_product_city_prices` (`tracked_product_id, city_code, own_current_price, last_competitor_price, updated_at`) is populated at connect time from the real per-city prices Kaspi returns (`offer.allCityPrices` on `GET /bff/offer-view/list`) — confirmed live: 43,840 rows across 137 products on the connected ABIL-SISTERS account.
- `checkCycle.ts`'s `applyPriceCheckResult` already loops every city row for a product and pushes a recomputed price via `pushCityPrice` → `cabinetPricePush.ts`'s `pushPriceChange` (`cityPrices: [{cityId, value}]`), whenever the product's top-level price is `updated` that cycle.
- **But every city converges to the identical price.** The competitor-offers fetch (`yml/offer-view/offers/{sku}`) is only ever queried once per product, for one fixed reference city (Almaty), and that same `competitorPrices` list feeds every city's `computeRepriceCandidate` call. `floor_price`/`undercut_step`/`demping_strategy` are also global per product. None of `undercut_leader`/`match_leader`/`stay_above_leader`/`be_second`'s formulas depend on the per-city starting price, so after one push cycle every city lands on the exact same number. Confirmed live: queried a real tracked product's city rows, all identical (3200₸ across all ~150+ rows).
- **Zero UI visibility.** The seller cannot see or configure any of this — `/kaspi-shop` shows one price per product; `excluded_city_codes` is a raw comma-separated code field with no city names attached anywhere in the app.
- **Pre-existing rate-limit accounting gap, made materially more dangerous by this change.** Kaspi enforces max 250 price/stock/preorder changes per rolling 30 minutes **per store** (`rateLimitBudget.ts`'s own documented constant). But `pushCityPrice`'s budget check queries `kaspi_shop_price_checks` scoped to `tracked_product_id` — a table that gets exactly one row per price-check *cycle* (not per city push) — so it effectively measures "how many times has this one product's cycle gone `updated` in the last 30 minutes," not the real count of city-level HTTP pushes to Kaspi. It has never actually protected the account's real 250/30min ceiling. This was low-risk while every city converged to the same price (a seller could still generate large real push volume, but it was already happening today, unmeasured); it becomes actively dangerous once per-city prices genuinely diverge and stay diverged, since real reactive push volume goes up and the budget check still can't see it.

## Decisions locked in (from this session's brainstorming)

1. **City scope**: the seller selects a subset of "important" cities to actively manage — not all ~150+. Selection is manual (a picker), not auto-derived from order history or a hardcoded list.
2. **Scope of the city list**: one list per store (`kaspi_shop_connections`), applied to all tracked products — not configured per product.
3. **Floor/step/strategy**: stay global per product, unchanged. Only the competitor-offer discovery becomes city-aware; city-level price divergence emerges naturally from different competitors being found in different cities, not from different seller-configured floors per city.
4. **Billing**: unchanged — 1 credit per check cycle regardless of how many cities that cycle covers, matching the existing "the check itself is the billable work" model. Real per-cycle cost to Kaspi (N offer-view fetches instead of 1) is accepted as internal infrastructure cost, not passed through to the seller.
5. **Rate-limit budget fix is in scope**: the `pushCityPrice` budget check is refactored to be accurate at the connection (store) level, using existing `kaspi_shop_product_city_prices.updated_at` timestamps (real push events) joined through to the connection — no new table.
6. **Cities outside the selected list**: fixed by falling back to today's existing (flawed but harmless) behavior — a product whose store has not configured `tracked_city_codes` yet (empty array) keeps behaving exactly as it does today, so nothing breaks for a seller who hasn't opted in. Once a store has a non-empty `tracked_city_codes`, only the cities in that list (minus any product-level `excluded_city_codes`) get actively checked and pushed; cities outside the list are left alone (no push), not actively synced to a stale reference price.

## Architecture

### Data model

- **New column** `kaspi_shop_connections.tracked_city_codes text[]` (nullable, default `'{}'`) — the store-wide list of city codes the seller has opted into. Empty = feature not configured, legacy single-reference-city behavior applies.
- **Existing** `kaspi_shop_tracked_products.excluded_city_codes text[]` — unchanged column, but its *meaning* narrows: it is now only consulted to remove a city from the store's `tracked_city_codes` for one specific product (excluding a city outside the tracked list is a no-op).
- **Existing** `kaspi_shop_product_city_prices` — unchanged shape; starts actually holding divergent per-city values once this ships.
- **New column** `kaspi_shop_connections.city_lookup_cache jsonb` (nullable) — a cached `{cityCode: cityName}` map fetched from Kaspi's cabinet, refreshed opportunistically (e.g. on connect and on-demand from the settings UI), so the city picker never needs a live round-trip through the GitHub Actions relay just to render names. Falls back to showing raw codes if the cache is empty (never blocks the picker from working).

### Live research required before implementation (Task 1)

The exact endpoint/shape for a human-readable city list has not been captured live. `getPointCities` was seen in the cabinet's GraphQL operation list during the original 2026-08-12 reconnaissance but its response shape was never captured. Task 1 of the implementation plan is a live-capture research task (same pattern as every other Kaspi Shop sub-project this session): log into the real cabinet, drive whatever UI surfaces a city list (e.g. Настройки or the price-list city picker), capture the real request/response shape via the browser network log, and confirm it returns `{code, name}` pairs (or find the real source if `getPointCities` turns out not to be it). If no such endpoint exists, the fallback is showing raw city codes in the picker (still functional, just less friendly) — the rest of this design does not depend on which of these two outcomes occurs.

### Competitor-check pipeline

`.github/scripts/kaspi-shop-price-check.mjs`, per due product:
1. Compute `targetCities = trackedCityCodes.filter(c => !excludedCityCodes.includes(c))`.
2. If `targetCities` is empty (store hasn't configured `tracked_city_codes`), fall back to today's behavior exactly: one `yml/offer-view/offers/{sku}` fetch for the fixed reference city, forwarded as a single `competitorOffers` array (existing shape, existing route logic, zero behavior change for unconfigured stores).
3. If non-empty, fetch `yml/offer-view/offers/{sku}` once per city in `targetCities` (small delay between requests, same anti-block headers already in use), building `perCityOffers: { [cityCode]: CompetitorOffer[] }`. POST this to `/cron/apply` instead of the single-array shape.

`applyPriceCheckResult` (`checkCycle.ts`):
- Branches on whether the payload is the legacy single-array shape or the new per-city map.
- Legacy path: unchanged, exactly today's code.
- Per-city path: for each city in the map, filter that city's offers by `excluded_merchant_ids` (same as today), compute `computeRepriceCandidate` using that city's own competitor list and that city's own `own_current_price` (from `kaspi_shop_product_city_prices`) as the starting point, push only if the computed price differs from the stored one, and only to cities present in the map (i.e. only the seller's tracked cities — no longer all ~150+ rows).
- Top-level `kaspi_shop_tracked_products.own_current_price` becomes the **minimum** across the product's tracked-city prices once a store has `tracked_city_codes` configured (matches what the existing product-list "цена" column has always implied — the seller's best current price somewhere), rather than the authoritative single price it is today. Set after the per-city push loop completes, from the just-written `kaspi_shop_product_city_prices` rows.

### Rate-limit budget fix

`pushCityPrice`'s budget check changes from:
```
select checked_at from kaspi_shop_price_checks where tracked_product_id = X and action = 'updated' and checked_at >= since
```
to counting real push events at the connection level:
```
select updated_at from kaspi_shop_product_city_prices
  where tracked_product_id in (select id from kaspi_shop_tracked_products where connection_id = <connection_id>)
  and updated_at >= since
```
`isWithinBudget`/`remainingBudget` (`rateLimitBudget.ts`) are unchanged — only the caller's query scope changes. This makes the existing 250/30min guard actually reflect Kaspi's real per-store ceiling instead of a per-product approximation that never filled up.

### UI

- New card on `/kaspi-shop` (near the existing pause toggle): city multi-select, backed by `city_lookup_cache` names (raw codes as fallback), chips for currently selected, saves via new `PATCH /api/kaspi-shop/settings/cities` (extends the existing `settings/route.ts` file) updating `tracked_city_codes`.
- Product edit form's `excludedCities` field: replaced from raw comma-separated text input to a multi-select populated only from the store's current `tracked_city_codes` (excluding a city outside that list is a no-op, so it's not offered).
- Product card: new expandable "Цены по городам" section listing, per tracked city, the city name, current `own_current_price`, and `last_competitor_price` — the first real visibility the seller gets into what this feature is actually doing.

## Testing

- `computeRepriceCandidate` (`pricing.ts`) is unchanged — it already takes an arbitrary `competitorPrices` array and `ownCurrentPrice`; the only change is that callers now pass per-city values. No new test cases needed there.
- New unit tests for the payload-shape branch in `applyPriceCheckResult` (legacy single-array vs. per-city map), and for the rate-limit budget query scope change (mock Supabase, assert the query now joins through `connection_id`).
- Routes and pages: no test coverage, matching this project's established convention.
