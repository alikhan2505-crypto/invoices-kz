# Kaspi Shop: Ниши — Design

## Context

Fifth and final Kaspi Shop sub-project — the last "скоро" placeholder in the sidebar, after Демпинг, Заказы+накладные, Финансы, and Нераспознанные товары (all shipped 2026-08-13/14).

Both competitors evaluated earlier this session (Northline, PriceFeed) list "Ниши" in their own menus, but this session had twice deliberately deferred it as needing "an entirely new, much bigger data source" — competitors reportedly power theirs with something like AlgaTop's 15M-product database, which invoices.kz has no equivalent of and was never going to build from scratch.

Live research this session (2026-08-14) found a workable path that needs no such database: Kaspi's own public product-search endpoint, `GET kaspi.kz/yml/product-view/pl/filters`, requires no login and returns real market data for any free-text query. Confirmed live for the query "термокружка": `total: 6192` matching products, price-bucket facets with counts (e.g. "до 10 000 т": 3554, "10 000–49 999 т": 2555, "50 000–99 999 т": 54...), brand facets with counts, and up to 12 product cards per page (title, price, rating, review count, brand, category breadcrumb, `bestMerchant`).

## v1 scope: on-demand niche check, not a browsable catalog

The seller types a product idea (free text, Russian) and gets a live snapshot of that specific market on Kaspi — not a pre-built, browsable list of "promising niches" like AlgaTop-powered competitor tools offer. This is a deliberate, explicit trade: always-fresh real data with zero crawling infrastructure, at the cost of not being able to passively discover niches the seller hasn't already thought of. A browsable catalog is a natural v2 if there's demand for it; not attempted here.

No AI-generated verdict or recommendation in v1. The page shows the real numbers Kaspi returns (competition count, price distribution, brand concentration, top real products) and lets the seller draw their own conclusion — a feature literally advising business decisions shouldn't overclaim insight it doesn't actually have.

## Architecture

Unlike every other Kaspi Shop sub-feature, this one needs **no seller session at all** — `kaspi.kz/yml/product-view/pl/filters` is a fully public endpoint, the same one Kaspi's own storefront search page uses for anonymous visitors. The new route does not call `loadConnection` and does not need a `merchantId`.

New route `GET /api/kaspi-shop/niches?query={text}` calls the real endpoint server-side with a hardcoded city (`c=750000000`, Almaty — no city picker in v1) and maps the response into a compact `NicheSummary`:

```ts
type NicheSummary = {
  total: number
  priceRanges: { label: string; count: number }[]
  topBrands: { name: string; count: number }[]
  products: { name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null }[]
}
```

`priceRanges` comes from the response's `filters` array (the entry with `id: "price"`), `topBrands` from the entry with `id: "manufacturerName"` (sorted by `count`, top 5), `products` from `data.cards` (up to 12, using each card's `title`/`unitSalePrice` (the actual current price a buyer pays, not `unitPrice` which is the pre-discount price and is identical to `unitSalePrice` whenever no discount is active)/`rating`/`reviewsQuantity`/`brand`/`previewImages[0].medium`).

**Open risk, resolved in Task 1 (live, controller-only research, same pattern as every prior sub-project):** this session already confirmed Kaspi blocks Vercel's IP range specifically on public *product-page* HTML (`/shop/p/-{sku}/`, HTTP 429, no rate-limit headers — a hard IP-range block), while Kaspi's authenticated cabinet API is not blocked. This new endpoint is also public and unauthenticated, so it may be blocked the same way — untested from Vercel specifically. Task 1 deploys a diagnostic call to the real route and checks live whether it 429s from Vercel. If blocked, this project already has a working fix for exactly this situation from the repricer sub-project: route the actual fetch through the GitHub Actions runner instead of Vercel (same split used by `getDueTrackedProducts`/`applyPriceCheckResult` — a Vercel endpoint reports what's needed, a GitHub Actions script does the actual outbound fetch with its own IP, a second Vercel endpoint receives the result). No new architecture needs to be invented if this risk materializes — Task 1's job is only to confirm which of the two paths (direct-from-Vercel vs. relay-through-Actions) is required, and the plan should branch on that finding.

## UI

Same dark hero-card visual language (`bg-[#12142E]`) as the rest of Kaspi Shop, with a search input in place of the usual KPI numbers. On submit:
- Hero shows the query and "Товаров по запросу: {total}".
- Below the hero: price-range list (label + count, from `priceRanges`), top-5 brands (name + count, from `topBrands`).
- Below that: a card grid of the real top products (photo, name, price, rating, review count) — same white-card list styling already used on Заказы/Нераспознанные товары, doubling as "who's already competing here" evidence.
- Empty/error states match the established pattern (red retry banner on fetch failure, "Ничего не нашлось" on a genuinely empty result).

Sidebar: "Ниши" moves from `SOON_ITEMS` to a real link (`active: 'niches'`), matching every prior promotion (Финансы, Нераспознанные товары).

## Billing

Free — no Kaspi Shop Wallet credit charged. This is a manual, on-demand lookup the seller triggers by clicking a button, not metered background automation like the repricer's check cycles (which the wallet model was designed around). Nothing prevents adding a limit/charge later if usage patterns ever make that necessary.

## Confirmed live 2026-08-14: Vercel IP is blocked, relay required

Task 1 shipped `checkNiche` calling the Kaspi endpoint directly from the Vercel route. Live verification against production (an authenticated request to the deployed `/api/kaspi-shop/niches` route, then a temporary diagnostic log deployed and checked via Vercel runtime logs — same technique used for this session's earlier `size:50` bug) confirmed: **Kaspi returns `403 Forbidden` (nginx) to this endpoint from Vercel's production IP range.** Same IP-block class already known from public product-page HTML; now confirmed to cover this endpoint too.

Unlike the repricer's competitor-price check (a background cron cycle, where a GitHub Actions runner polling a `due` endpoint every 10 minutes is invisible to the user), this is a synchronous, on-demand feature — the seller clicks "Проверить" and expects an answer in seconds, not on the next cron tick. GitHub Actions' own cron granularity floor (5 minutes) rules out mirroring the repricer's exact pull-based pattern. The fix instead triggers GitHub Actions **on demand** via `workflow_dispatch`, called from Vercel the moment the seller searches:

1. `POST /api/kaspi-shop/niches/request` (Vercel, admin-auth) creates a `kaspi_niche_checks` row (`status: 'pending'`) and calls the GitHub REST API to dispatch a workflow run, passing the new row's id and the query as workflow inputs. Returns the check id immediately.
2. The GitHub Actions workflow runs a script on the runner's own (unblocked) IP, fetches the real Kaspi endpoint, and POSTs the raw response back to `POST /api/kaspi-shop/niches/deliver` (Vercel, protected by the existing `KASPI_SHOP_CRON_SECRET` header, same auth pattern as the repricer's `cron/apply`).
3. `deliver` parses the raw response and writes the mapped `NicheSummary` (or an error) into the row.
4. The page polls `GET /api/kaspi-shop/niches/result?checkId=...` (Vercel, admin-auth) every ~2 seconds until the row is `done` or `error`, or a client-side timeout is hit (60s).

Real, new setup requirement this introduces (not needed by the original v1 design): a GitHub Personal Access Token with `actions:write` scope on this repo, generated by the user at `github.com/settings/tokens` and added to Vercel's environment variables as `KASPI_SHOP_GITHUB_PAT`. This is genuinely new infrastructure — Vercel calling GitHub, not the reverse — unlike the repricer's relay where GitHub always initiated contact with Vercel on its own schedule. The implementation plan's final task lists the exact steps.

Expected UX cost: a search now takes on the order of 15-30 seconds (GitHub Actions runner startup + a short queue) instead of under a second. Acceptable for a deliberate "check this idea" lookup tool, not acceptable for anything resembling live/instant search — the page's loading state must say so explicitly rather than implying a fast wait.

## Explicitly out of scope for v1

- Browsable/pre-built niche catalog (the AlgaTop-style approach) — would require a real crawling pipeline this project doesn't have and wasn't asked to build.
- Search history / saved niches.
- City picker (hardcoded to Almaty, `c=750000000`).
- AI-generated summary or opportunity verdict.
- Request throttling / rate limiting (acceptable for v1 since the whole Kaspi Shop section is still `is_admin`-gated, single trusted user — revisit before any wider rollout).
