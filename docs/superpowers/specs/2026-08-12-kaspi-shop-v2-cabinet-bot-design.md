# Kaspi Shop v2: Cabinet-Bot Foundation — Design

## Context

Kaspi Shop (shipped 2026-08-12, see `2026-08-11-kaspi-shop-repricer-design.md`) currently reprices via Kaspi's official, documented Merchant API: a seller-generated API token validates the connection, and price changes reach Kaspi through an hourly-polled XML price-list feed. Live competitor research (Northline.kz, PriceFeed.kz — both registered as real test accounts, and a live technical trace against the user's own real Kaspi Магазин seller account) established that **every competitor in this market bypasses the official API almost entirely**. They log into the seller's actual Kaspi Магазин cabinet (`kaspi.kz/mc`, backed by `idmc.shop.kaspi.kz` for auth and `mc.shop.kaspi.kz` for the cabinet's internal GraphQL/REST APIs) using the seller's real email/phone + password, the same way a human would in a browser. That authenticated session is what actually unlocks:

- Reading the seller's existing product catalog (no such endpoint exists in the public Merchant API)
- Instant price/stock updates (seconds to minutes, not the ~hourly ceiling of the official XML feed)
- Order management, waybill generation, financial data, NTIN applications — none of which the public API exposes at all

The user has explicitly decided to build Kaspi Shop v2 on this same mechanism: **"делаем кабинет-бота как у всех, заходит через логин/пароль или телефон/смс"**. This is a deliberate escalation from Kaspi Shop v1's "official API only, low risk" posture to the same risk tier as [[kaspi-pay-cashier]] — storing and using a seller's real Kaspi account credentials/session, not just a self-scoped API token.

This spec covers **only the foundation**: the cabinet-bot connection itself, what it unlocks for the existing repricer (Демпинг), and the data-model changes that follow directly from what the real cabinet actually returns. Catalog auto-import beyond pricing, Заказы (orders), накладные (waybills), Финансы, Каталог НКТ, Предзаказ, and Ниши are each their own future sub-project, built on top of this foundation once it exists — explicitly out of scope here.

## Architecture

### Connection flow

Replacing Kaspi Shop v1's single API-token field, the connect flow becomes:

1. Seller enters their Kaspi Магазин login (phone or email, matching the two tabs on `idmc.shop.kaspi.kz/login`) and password in our connect form.
2. Our server performs the login against `idmc.shop.kaspi.kz` on the seller's behalf.
3. If Kaspi requires SMS verification (phone-based login), our UI shows a second step asking the seller for the code that arrives on their own phone — we never intercept or auto-fetch SMS ourselves.
4. On success, Kaspi issues session cookies (`mc-session`, `mc-sid`, confirmed live) scoped to `.kaspi.kz`. We capture and store these, not the password.
5. Immediately after connecting, we call the cabinet's `getMerchant` GraphQL query to auto-fill company name and logo — the seller confirms/edits, never types it manually.
6. We then call `GET /bff/offer-view/list` to pull the existing catalog (SKU, title, brand, category, current per-city prices) as the seller's initial tracked-product candidates, instead of the current manual entry form.

### Credential and session storage

- The password is used exactly once, in-memory, for the login call — it is never written to the database.
- The resulting session cookies are encrypted at rest with the same AES-256-GCM helper already used for `kaspi_connections` and Kaspi Shop v1's API token (`src/lib/kaspiPay/crypto.ts`), reusing the existing `KASPI_SHOP_ENCRYPTION_KEY` — no new secret needed.
- Kaspi sessions expire; every cabinet call must handle an auth failure by marking the connection `status: 'session_expired'` and prompting the seller to log in again — never silently retrying with a dead session, and never storing the password to auto-relogin. This mirrors how the real cabinet itself expects re-authentication, and matches how competitors' own UIs surface this ("Кабинет не подключён или сессия истекла").

### Data model changes

Kaspi genuinely prices per delivery point, not per product: the real `offer-view/list` response includes `allCityPrices`, a map of ~150+ city/point codes each with their own `{price, oldPrice, discount}`. `kaspi_shop_tracked_products.own_current_price` (a single value) cannot represent this. This spec introduces:

- `kaspi_shop_tracked_products` gains `kaspi_master_sku`, `kaspi_brand`, `kaspi_category` (populated from the real catalog read, not typed by the seller).
- A new `kaspi_shop_product_city_prices` table: `tracked_product_id`, `city_code`, `own_current_price`, `last_competitor_price`, `updated_at` — one row per (product, city) the seller actually sells in, rather than a single global price.
- The repricing loop (`computeRepriceCandidate`) runs per city code the product is listed in, not once per product — a seller can undercut differently (or not at all — see "Обход города" below) per city.

### Демпинг v2 — what the cabinet session unlocks

- **Instant updates**: price pushes go through the authenticated cabinet session instead of the hourly XML feed. Exact push endpoint/shape is one of the open technical items below (not yet captured live) — likely a `mc.shop.kaspi.kz` REST or GraphQL mutation, mirrored on the same session used for reads.
- **Rate-limit budgeting**: Kaspi enforces a hard cap of 250 price/stock/preorder changes per 30 minutes per store (confirmed via competitor documentation) — exceeding it blocks all changes for 30 minutes. The check-cycle scheduler must track a rolling request count per connection and throttle itself under this ceiling rather than discovering the block reactively.
- **New algorithms**, matching what competitors expose and are technically grounded in what the cabinet data actually supports:
  - *Быть на 1-м месте* (existing): undercut the lowest competitor by the step.
  - *Цена конкурента на 1 месте*: match the leader's price exactly, no undercut.
  - *Прижиматься к первому*: sit `step` above the lowest competitor instead of below — if we're already cheapest, cede that position and sit just above the next seller. A deliberate anti-price-war option.
  - *Быть 2-м*: position one tier above the cheapest competitor.
  - *Обход города*: exclude specific city codes from repricing for a product (now grounded in real per-city pricing, not a cosmetic toggle).
  - *Не конкурировать с магазинами*: a per-product blocklist of specific competitor merchant IDs to ignore when computing the lowest price.
- **AI-suggested floor/step**: given a tracked product's category and the seller's own cost (if provided), one Anthropic call proposes a starting floor price and undercut step — the seller can accept or override. Reuses the existing Anthropic integration pattern already in this codebase (Instagram auto-reply), not a new provider.

## Error handling

- Login failure (wrong password, account locked, unexpected 2FA form): surfaced as a specific, actionable error, not a generic "connection failed" — mirrors the care already taken in Kaspi Shop v1's connect route.
- Mid-operation session expiry: the affected check cycle logs an `error` row (existing `kaspi_shop_price_checks` pattern) with a clear "session expired" reason, debits the credit as usual (the check attempt is still billable work), and the connection surfaces a reconnect prompt on the Kaspi Shop page.
- Rate-limit exhaustion: the scheduler skips remaining due products for that connection once its 30-minute budget is spent, logging why, rather than firing requests that Kaspi will reject anyway.

## Explicitly out of scope (future sub-projects, not built here)

Заказы (order management), накладные (waybill generation/merging), Финансы (unit economics, FIFO cost tracking), Каталог НКТ (NTIN applications), Предзаказ (preorder management), Ниши (market/niche analytics). Each gets its own spec once this foundation ships and is confirmed working live.

Also explicitly deferred, not forgotten: covering this launch on Instagram and on the invoices.kz marketing pages, once the feature is actually live — matching how past features (Kaspi Pay Cashier, the original repricer) were promoted only after shipping, not before.

## Open technical items (research, not yet captured)

Two pieces of the real request/response shape were not captured during the live trace and are needed before implementation can start with confidence:

1. The exact login POST shape on `idmc.shop.kaspi.kz` itself (the trace accidentally hit a different Kaspi system, `merchant.kaspi.kz`, first, and by the time the correct cabinet was reached the login had already been completed by the user directly).
2. The OTP-verification request (if phone/SMS login is used) — endpoint, payload shape, and how it correlates to the initial login call.
3. The actual price-push mechanism once inside the cabinet session (a write counterpart to the `offer-view/list` read) — not yet observed live, since no price changes were made during the read-only trace.

These need a follow-up live trace (the user logging into the correct system while network requests are captured) before the implementation plan can specify exact integration code.
