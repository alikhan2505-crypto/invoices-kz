# Kaspi Shop: Прибыль — Design

## Context

Sixth Kaspi Shop sub-project — the biggest gap found during this session's competitor research on alemdata.kz ("Kaspi Аналитика"). alemdata's entire product is real unit economics: per-SKU and per-store net profit computed from order data minus manually-entered COGS minus ad spend minus commission, with real disclosed pricing (9,900–24,900₸/mo) confirming sellers pay for exactly this. Neither Northline.kz nor PriceFeed.kz (the other two competitors researched) have this either — it's a genuine differentiator, not table stakes. The existing Финансы page (`/kaspi-shop/finance`, shipped 2026-08-13) already computes real revenue from order data, but revenue is not profit — there is no cost concept anywhere in this codebase today.

Three real constraints, already confirmed (not re-researched here):
- Kaspi has no API for accurate commission — alemdata's own in-app disclosure says commission from Kaspi's own order-archive export is "estimated by category, not exact"; their preferred source is a manual Kaspi Pay bank-statement download, not an API.
- Ad spend is equally unavailable via any API — alemdata parses it from that same manual bank statement.
- COGS (себестоимость) is not available from Kaspi anywhere, at any granularity — it is inherently seller-entered, per product. This is the unavoidable core of alemdata's own "Өзіндік құн" flow.

## v1 scope

- **Commission**: a single flat percentage rate, seller-configured per shop (`kaspi_shop_connections.commission_rate_percent`), applied to revenue. No fabricated default — starts unset, and profit is shown without a commission deduction (clearly labeled) until the seller sets it.
- **Ad spend**: manually entered by the seller as one total per period-window (7/30/90 days, matching Финансы's own toggle) — not parsed from any statement, not attempted to attribute per-product.
- **COGS**: a single current value per product (`kaspi_shop_tracked_products.cogs_amount`), overwritable, not a cost history. Every existing order still in the selected window uses today's COGS value, not whatever it was at time of sale — a known, accepted simplification for v1.
- **Honesty pattern (validated against alemdata, kept for this design)**: any figure that depends on an unset input (COGS not entered for a product, commission rate not set, ad spend not entered for the current window) is shown as "не указано" / an inline prompt to fill it in, never silently treated as zero.

## Architecture

**No new catalog table.** `kaspi_shop_tracked_products` already holds one row per product the seller has imported (the repricer's own catalog-import at connect time already populates this for every product, not just demping-enabled ones) — COGS attaches there directly via a new nullable `cogs_amount numeric` column.

**Per-product revenue attribution — a real gap to close first.** Kaspi's real `entries.totalPrice` field (per line item) is already confirmed live and already used in `GET_ORDER_DETAILS_QUERY` (single-order query), but `GET_ORDERS_QUERY` (the list query `finance.ts`/`orders` page already page through) never requested it, and `mapOrderItems` never mapped it — only the whole-order `totalPrice` exists today. Both need extending: add `totalPrice` to the `entries` selection in `GET_ORDERS_QUERY`'s fragment, add `totalPrice: number` to the `OrderItem` type, map it in `mapOrderItems`. This is additive only (existing consumers of `Order`/`OrderItem` are unaffected by an extra field).

**New module `src/lib/kaspiShop/profit.ts`**: `computeProfitSummary(sessionCookies, merchantId, sinceDays, listOrdersFn)` reuses the exact same order-fetching/pagination approach `finance.ts`'s `computeFinanceSummary` already established (KASPI_DELIVERY_TRANSMITTED + ARCHIVED statuses, `MAX_PAGES_PER_STATUS` cap, `sessionExpired` propagation). For each order's items, revenue and units-sold are attributed to whichever `kaspi_shop_tracked_products` row has a matching `kaspi_sku`.

**Join key, confirmed live 2026-08-14 (and confirmed to NOT be the naive guess):** an order entry's `product.code` matches `kaspi_shop_tracked_products.kaspi_master_sku`, **not** `kaspi_sku` as the identifier's name would suggest. Live-checked against a real order on the connected ABIL-SISTERS account: order item `code: "138589313"` had zero matches against `kaspi_sku` in the catalog table, but matched `kaspi_master_sku` exactly (`"Футболка Abil.Sisters Однотонный белый"`, `kaspi_sku: "478218375"` — a different value, evidently the seller's own per-offer SKU rather than Kaspi's master-product identifier that order line items actually reference). Had this not been checked live, the naive `kaspi_sku` join would have silently attributed zero revenue to every product with no error anywhere — exactly the silent-failure class this project has repeatedly hit and fixed elsewhere (`sessionExpired` propagation, `size:50`, etc.). Per-product COGS total is `cogs_amount * unitsSold` when `cogs_amount` is set, or `null` (propagated, not zeroed) when it isn't.

**New table `kaspi_shop_ad_spend`**: `(connection_id, days, amount, updated_at)`, unique on `(connection_id, days)` — exactly one row per one of the three preset windows (7/30/90), matching Финансы's own period toggle rather than inventing an arbitrary date-range concept. The seller edits whichever window they're currently viewing.

**Routes**: `GET /api/kaspi-shop/profit?days={7|30|90}` (same admin-auth pattern as every sibling route, calls `computeProfitSummary`, returns per-product breakdown + store totals); `PATCH /api/kaspi-shop/profit/cogs` (body `{trackedProductId, cogsAmount}`); `PATCH /api/kaspi-shop/profit/commission` (body `{commissionRatePercent}`); `PATCH /api/kaspi-shop/profit/ad-spend` (body `{days, amount}`) — three small, single-purpose update endpoints rather than one do-everything route, matching this codebase's existing preference for narrow routes.

## UI

Dark hero-card (`bg-[#12142E]`), matching every other Kaspi Shop page. Large "Прибыль" figure at the top, with a labeled breakdown row underneath: Выручка / Себестоимость / Реклама / Комиссия, each as a subtracted line. Any unset input (commission rate, current window's ad spend) renders as an inline editable field directly in the hero — not tucked into a separate settings page — so the seller can complete the picture without leaving the page. 7/30/90-day toggle, matching Финансы exactly.

Below the hero: a per-product list (photo, name, units sold this period, revenue) with an inline-editable COGS field per row (the core "Өзіндік құн" interaction) and a computed profit figure per product — or "укажите себестоимость" in place of a number when COGS is unset for that product, never a silently-wrong number.

Sidebar: "Прибыль" is a genuinely new real link (not a promoted "скоро" placeholder — there wasn't one for this) added after "Ниши".

## Billing

Free — no Kaspi Shop Wallet involvement, matching Финансы/Нераспознанные товары/Ниши (all manual/on-demand pages, not automated background work).

## Explicitly out of scope for v1

- Parsing the Kaspi Pay bank statement (Excel/PDF) for real commission or ad-spend figures — alemdata's own more-accurate path, deliberately not attempted here; the flat-rate/manual-total approach is the conscious v1 trade-off.
- COGS history / cost-at-time-of-sale — a single current value only.
- Per-product ad-spend attribution — ad spend is a single store-wide number per window, not broken down by product.
- alemdata's free no-signup lead-magnet tools (Excel profit-checkup, standalone waybill merger) — not applicable here; invoices.kz users are already authenticated and already have a live Kaspi Shop connection, unlike a cold-start acquisition tool.
- Any change to the existing Финансы page — Прибыль is additive, a new page, not a replacement.
