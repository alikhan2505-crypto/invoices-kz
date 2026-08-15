# Kaspi Shop: Позиция (buy-box position) — Design

**Status:** self-brainstormed and self-approved under the user's standing overnight instruction ("работай автономно... если будут вопросы выбирай Рекомендованное"). Written same as every other Kaspi Shop design doc this session, but the Q&A below is me answering my own clarifying questions rather than a live dialogue, since the user is asleep.

## What this is

Show the seller where their price ranks among ALL sellers of the same product on Kaspi right now — "#2 из 6 продавцов" — not just whether they're beating the single cheapest competitor (which `PriceLadder`'s green/red dot already shows).

## Why this turned out to need no proxy, no vendor decision

This item was queued earlier in the session with a note that it "needs a paid residential proxy, a real cost decision" — that assumption predates actually reading `checkCycle.ts` and `.github/scripts/kaspi-shop-price-check.mjs` closely for this task. On closer read: **every price-check cycle already fetches the full offer list** for each tracked product/city from `kaspi.kz/yml/offer-view/offers/{sku}` (via the GitHub Actions relay, `sortOption: 'PRICE'`, up to 50 offers) — that's the exact same data a buy-box position needs. No new fetch, no new IP, no new cost. The original "needs a proxy" note was about a *different*, heavier feature (continuous competitor-position monitoring independent of the repricer's own cadence) that was never actually the plan — this feature just reads data the repricer already pulls for its own pricing math.

## What "position" means here (a disclosed approximation)

Kaspi's own buy-box/ranking algorithm isn't public and may weigh seller rating, delivery speed, or promotions, not just price. We only have `{merchantId, price}` per offer — no rating/delivery data. So "position" here is **price-rank among all sellers**, an honest approximation, not literally "are we in Kaspi's buy box." Ties (our price equals a competitor's) count in our favor — we show the best rank achievable at that price, since we can't replicate whatever tiebreaker Kaspi actually uses. This gets a one-line disclaimer in the UI, matching this session's existing pattern for the gender-estimate and Order.destination limitations.

## Data flow

No new Kaspi requests. `computeMarketPosition(offers, ownMerchantId, ownPrice)` (new pure function, `pricing.ts`) takes the *raw* offer list already fetched this cycle (before the seller's own `excluded_merchant_ids` filter — position reflects real market reality, not the seller's own "ignore this competitor for repricing" preference), excludes any offer matching our own merchant id defensively, and counts how many remaining offers are strictly cheaper than `ownPrice`. `position = cheaperCount + 1`, `totalOffers = otherSellers.length + 1`.

Called from `checkCycle.ts`'s `applyPriceCheckResult`, once per branch:
- **Per-city branch:** per city, using that city's raw `cityOffers` and the post-recompute `result.price` — written to `kaspi_shop_product_city_prices.market_position`/`market_offer_count` in the same loop that already writes `no_competitor_streak` per city (that loop's "skip if streak unchanged" shortcut is removed, since position can change even when the streak doesn't — e.g. a competitor's price moves without disappearing).
- **Legacy branch:** using the flat `competitorOffers` and `ownPriceAfter` — written to `kaspi_shop_tracked_products.market_position`/`market_offer_count` in the same `update()` call that already writes `own_current_price`/`no_competitor_streak`.

On a fetch error, neither column is touched (same as `own_current_price` today).

## Storage

Two new nullable integer columns, one pair per table (mirrors how `no_competitor_streak` is split): `kaspi_shop_tracked_products.market_position`/`market_offer_count` (legacy/no-city-tracking path) and `kaspi_shop_product_city_prices.market_position`/`market_offer_count` (per-city path). Nullable = "not checked yet," not "0."

## UI

Minimal, matching the user's own repeated "make it compact" feedback tonight: appended to the existing strategy/frequency subtitle line on each product card ("· #2 из 6") when `market_position` is set — no new badge element, no historical chart, no separate section (YAGNI, same call already made for Макс-памп's "pumping now" badge). In the per-city expanded view, appended the same way next to each city's own price/competitor line.

## Testing

`computeMarketPosition` is a pure function in `pricing.ts` — gets Vitest coverage per this session's established convention (pure pricing math tested, orchestration/UI not): no competitors (position 1 of 1), some cheaper (position = count+1), all cheaper, a tie (doesn't push us down), and the own-merchant-id defensive exclusion (in case Kaspi's endpoint ever includes the caller's own listing).
