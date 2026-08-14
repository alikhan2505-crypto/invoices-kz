# Kaspi Shop: Макс-памп (margin recovery when no competitor) — Design

## Origin

Next item on the user's own prioritized list of remaining repricer gaps vs competitors (Northline/PriceFeed both advertise this), picked right after per-city competitive pricing shipped (2026-08-14/15). Chosen over Позиция/buy-box tracking, which needs a residential proxy — a real cost decision deliberately deferred to a separate conversation.

## Current state

`computeRepriceCandidate` (`src/lib/kaspiShop/pricing.ts`) already has an auto-recovery-from-floor behavior (shipped 2026-08-14): when zero competitors are found and the product is at/below its floor, it steps price up by `undercutStep` once per cycle. This stops the moment the price clears the floor — there is no mechanism to keep climbing toward a real ceiling when competition stays absent for a sustained period, and no seller-configured ceiling exists anywhere in the schema.

## Decisions locked in (from brainstorming)

1. **Trigger**: N consecutive check cycles with zero competitors found (not a fixed time window) — reuses the existing cycle-based mental model, no new timestamp semantics needed. `N = PUMP_TRIGGER_CYCLES = 3`, a fixed constant, not seller-configurable (avoids an extra UI control for v1; can become a field later if requested).
2. **Ceiling**: a new nullable `max_price` field per product. `NULL` (the default) means the pump behavior is off for that product — no hidden default ceiling ever gets invented.
3. **Climb style**: gradual, by `undercut_step` per qualifying cycle (same mechanic as the existing floor-recovery step), capped at `max_price` — never an instant jump, to avoid a startling price swing for a buyer mid-comparison.
4. **Retreat**: automatic and immediate by construction — the moment a competitor reappears, `computeRepriceCandidate` takes its normal competitor-reacting branch regardless of any pump state, and the streak resets to 0. No special retreat logic needed.
5. **Streak scope**: separate per city for stores that have configured `tracked_city_codes` (a city with sustained no competition pumps independently of a sibling city that has one) — consistent with per-city pricing's own premise that cities can genuinely differ. Stores without per-city tracking configured (every store today) use a single per-product streak, matching how `floor_price`/`undercut_step`/`demping_strategy` already stay global per product post-city-pricing.

## Architecture

### Data model

- `kaspi_shop_tracked_products.max_price numeric` (nullable, default `NULL`).
- `kaspi_shop_tracked_products.no_competitor_streak integer not null default 0` — used by the legacy (non-per-city) path.
- `kaspi_shop_product_city_prices.no_competitor_streak integer not null default 0` — used by the per-city path.

### `pricing.ts` (pure logic)

`computeRepriceCandidate` gains two new optional inputs, `maxPrice?: number` and `noCompetitorStreak?: number` (the streak count going into this cycle, before this cycle's own outcome), and returns `newStreak` alongside its existing `price`/`heldAtFloor`. Inside the zero-competitor branch:

1. If `ownCurrentPrice <= floorPrice`: existing floor-recovery step (`ownCurrentPrice + undercutStep`), `newStreak = (noCompetitorStreak ?? 0) + 1`.
2. Else if `newStreak >= PUMP_TRIGGER_CYCLES` and `maxPrice` is set and `ownCurrentPrice < maxPrice`: step up by `undercutStep`, capped at `maxPrice`.
3. Else: hold flat (unchanged from today), `newStreak` still increments.

Whenever a competitor IS found (the non-empty branch), `newStreak = 0` is returned alongside the existing per-strategy price logic — this is the automatic retreat.

`computePerCityReprice` gains the same `maxPrice?: number` (one value, shared across all cities of a product — ceiling stays product-level even though the streak doesn't) and `currentCityStreaks: Record<string, number>`, and each per-city result gains its own `newStreak`.

### `checkCycle.ts` (orchestration)

- Legacy path: reads `product.max_price`/`product.no_competitor_streak`, passes them into `computeRepriceCandidate`, writes the returned `newStreak` back to `kaspi_shop_tracked_products` in the same `UPDATE` that already sets `own_current_price`.
- Per-city path: reads each city row's `no_competitor_streak` alongside its `own_current_price` (already queried), passes the map into `computePerCityReprice`, writes each city's `newStreak` back in the same per-city `UPDATE` that already sets `own_current_price`/`last_competitor_price`.
- No change to rate-limit budgeting — a pump step is just a different computed price inside the existing push cycle; `last_pushed_at`-based budgeting already covers it.

### UI (`src/app/kaspi-shop/page.tsx`)

- New "Максимальная цена" input in the product edit form, next to "Минимальная цена" — same styling, empty means the feature is off for that product.
- `PriceLadder` gains a ceiling line mirroring the existing floor line, so the seller sees both boundaries of the race on one graphic.
- No separate "pumping now" badge — visible enough via the price itself trending toward the ceiling over time (YAGNI).

## Testing

- `computeRepriceCandidate` and `computePerCityReprice` (`pricing.test.ts`) get new cases: streak increments on no-competitor cycles; pump only fires at/after the trigger threshold; pump respects the ceiling; pump only fires when `maxPrice` is set; streak resets to 0 the instant a competitor is found; floor-recovery still takes priority over pumping when at/below the floor.
- No test coverage for `checkCycle.ts` orchestration or the UI, matching this project's established convention.
