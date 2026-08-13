# Kaspi Shop: Нераспознанные товары — Design

## Context

Fourth sub-project of the Kaspi Shop cabinet-bot platform, after Демпинг, Заказы+накладные, and Финансы (all shipped 2026-08-13).

**Correction from the original version of this doc:** this feature was originally assumed to be about НКТ (National Product Catalog) tax/cash-register compliance, based on a `merchant-nct/mc/nct/kassa-status` request seen firing on every cabinet page load. Live research (Task 1, see `docs/superpowers/specs/2026-08-13-kaspi-nkt-api-findings.md`) confirmed that endpoint is actually a single Kaspi Kassa (POS) activation boolean, unrelated to products, and is discarded from this design entirely.

The real feature, confirmed live against merchant 425002 ("ABIL-SISTERS"), is the cabinet's own **"Нераспознанные товары"** (Unrecognized products) page under ТОВАРЫ: products Kaspi's catalog-matching system could not automatically link to an existing master product/category. A seller normally goes into Kaspi's own cabinet to review Kaspi's suggested category and resolve it. It has 4 tabs — Без привязки / Требуют доработок / На проверке / Отклонены — with live per-tab counts, real endpoint `bff/pending-products/{merchantId}`.

## v1 scope: read-only status view for the confirmed tab only, no write action

Following the same caution this session already applied to накладная generation and Task 1's own recommendation: v1 is **read-only**, and covers only the one tab whose real request/response shape was actually observed with data (**Без привязки**, `approvalStatus: "CHECK"`). The other three tabs' `approvalStatus` keys (`PENDING`, `IMPORTED`, `TRASH`) are inferred from position, not confirmed against a populated response, and the seller's real account had 0 items in all three anyway — so v1 shows them as disabled placeholders rather than risk shipping an unconfirmed request shape. Reclassifying/fixing a product is entirely out of scope (that write action's real request shape is unconfirmed).

## Architecture

Reuses all existing session infrastructure (`loadConnection`, `cabinetApi.ts` pattern). New module `src/lib/kaspiShop/pendingProducts.ts`:

- `listPendingProducts(sessionCookies, merchantId, page): Promise<{ products: PendingProduct[], hasMore: boolean }>` — calls `POST https://mc.shop.kaspi.kz/bff/pending-products/{merchantId}` with `{ page, searchTerm: '', pageSize: 5, approvalStatus: 'CHECK', isMobileApp: false }` (real page numbering starts at **1**, not 0 — different from `getOrders`). `hasMore` is `data.length === pageSize` (no `total` field in the real response, unlike orders).
- `getPendingCount(sessionCookies, merchantId): Promise<number>` — calls `GET https://mc.shop.kaspi.kz/content/pending/mc/product/{merchantId}/count`, returns just `.CHECK` (the only confirmed tab, used for the sidebar badge).

`PendingProduct` type: `{ code, name, brand, categoryName: string | null, imageUrl: string | null }`, mapped from the real response's `category.name` and `images[0].medium` (real pre-built CDN URL, no URL-building needed — different pattern than the `baseUrl + paths[]` scheme `cabinetApi.ts` already uses for order photos).

New route `GET /api/kaspi-shop/pending-products?page={n}`, new page `/kaspi-shop/pending-products`.

## UI

Distinct from Демпинг/Финансы's three-number hero pattern — this is a review checklist, not a KPI dashboard. Shows:
- Page header "Нераспознанные товары" with the real count next to it.
- A 4-segment tab strip matching the real cabinet's own labels (Без привязки / Требуют доработок / На проверке / Отклонены), but only "Без привязки" is clickable in v1 — the other three are visibly disabled (greyed, no click handler) rather than hidden, so the seller can see the feature covers the same ground as Kaspi's own page without us silently dropping capability.
- Below it, a list of unrecognized products: photo (`imageUrl`), name, brand, and Kaspi's suggested category shown as "Kaspi предлагает: {categoryName}" (never phrased as already-assigned, since `category.leaf` was `false` on the real captured item — it's a guess, not a confirmed assignment) — read-only, no action buttons in v1.
- Same dark hero-card visual language (`bg-[#12142E]`) as the rest of Kaspi Shop for the page header band.
- Sidebar: "Каталог НКТ" is renamed to "Нераспознанные товары" (matching the real cabinet's own naming — the original "Каталог НКТ" label was itself part of the wrong assumption) and moves from the "скоро" list to a real link, matching the pattern already used for Заказы/Финансы.

## Explicitly out of scope for v1

- Any write/fix action for reclassifying an unrecognized product (real endpoint shape unconfirmed — v2 candidate once live-captured).
- The three unconfirmed tabs (Требуют доработок / На проверке / Отклонены) — shown disabled until their real `approvalStatus` values and response shapes are confirmed live against an account that actually has items in those states.
- Bulk actions.
- Historical/trend view of recognition rate over time.
