# Kaspi Shop: Финансы — Design

## Context

Third sub-project of the Kaspi Shop cabinet-bot platform, after the repricer (Демпинг) and Заказы + накладные, both shipped 2026-08-13. Both competitors evaluated earlier (Northline.kz, PriceFeed.kz) have a "Финансы" section in their own product menus, and the user wants feature parity plus original improvements.

**A real constraint shapes this design:** the real Kaspi Магазин cabinet's own left-hand navigation — confirmed live twice this session, against two different real seller accounts (merchant 30067228 and merchant 425002) — has no "Финансы" item at all. Its structure is only ЗАКАЗЫ (+ Возвраты), ТОВАРЫ, and ОСТАЛЬНОЕ (Показатели качества/Рейтинг/Задержки при передачах/Возвраты по качеству/Отмены по вашей вине/Пользователи/Настройки/Kaspi Marketing). This strongly suggests Northline/PriceFeed's "Финансы" is a report *they* build by aggregating order data themselves, not a passthrough of some dedicated Kaspi finance endpoint — but this is inference, not confirmed. A real payout/commission endpoint may still exist (possibly on `merchant.kaspi.kz`, the separate Kaspi Pay/acquiring system noted elsewhere in project memory as distinct from the Магазин cabinet), and Task 1 checks for it.

**Design principle:** ship a real, useful v1 built entirely on data already confirmed working (`listOrders`, shipped with the Orders+Waybills sub-project) — don't block v1 on an unconfirmed endpoint. If Task 1's live capture finds a real commission/payout endpoint, that becomes a v2 follow-up, not a v1 requirement.

## Architecture

Reuses all existing session infrastructure — `loadConnection`, `cabinetApi.ts`'s pattern — no new cabinet authentication.

**Revenue definition:** aggregates over orders in `KASPI_DELIVERY_TRANSMITTED` and `ARCHIVED` statuses only (fulfilled/completed orders) — not the other 8 statuses, which represent orders not yet fulfilled and shouldn't count as realized revenue yet. This matches ordinary accounting sense and avoids the design ambiguity of "is a brand-new order revenue."

**Server-side pagination loop:** `listOrders` is paginated 10-per-page (a real, confirmed Kaspi limit — see the Orders+Waybills findings doc). Computing a revenue total across a date range means the server loops pages internally (not pushed to the client) until either the page comes back short of 10 orders (last page) or a safety cap of 20 pages (200 orders) per status is hit per request — documented as a known v1 limit, not silently wrong: a seller with more than 200 fulfilled orders in the selected window sees a total computed from the most recent 200, with that limit stated in the UI rather than hidden.

**New module** `src/lib/kaspiShop/finance.ts`:
```ts
export type FinanceSummary = {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  byDay: { date: string; revenue: number; orderCount: number }[]
  truncated: boolean // true if the 200-order safety cap was hit
}

export async function computeFinanceSummary(
  sessionCookies: string,
  merchantId: string,
  sinceDays: number
): Promise<FinanceSummary>
```
Internally calls `listOrders` for `KASPI_DELIVERY_TRANSMITTED` and `ARCHIVED`, paging through each up to the safety cap, then filters the fetched orders by `creationTime >= now - sinceDays` client-side (server-side, but after fetching). No early-stop-on-sort-order optimization: the real `creationTime` values observed in the Orders+Waybills captures are NOT monotonically ordered within a page (confirmed by inspecting a real response), so assuming newest-first and stopping early would silently miss orders. Pages through the full cap every time instead.

**New route** `GET /api/kaspi-shop/finance?days={7|30|90}` — auth-gated the same way as `/api/kaspi-shop/orders`, calls `computeFinanceSummary`, returns the `FinanceSummary` JSON.

**New page** `/kaspi-shop/finance` — same dark hero-card visual language as Демпинг (`bg-[#12142E]`, three-number hero: revenue / orders / average order value), a 7/30/90-day period switcher (preset buttons, not a custom date-range picker — v1 scope), and a simple revenue-by-day list below (not a chart — a charting library is a real new dependency, deferred until real usage validates the feature is worth the investment). Uses `KaspiShopSidebar`, which gets `active="finance"` added alongside `"demping"`/`"orders"`; "Финансы" moves from the sidebar's "скоро" list to a real link.

**Task 1 (live, controller-only, same pattern as the previous two sub-projects):** drive the real cabinet (already-connected sister's account, merchant 425002, has real fulfilled orders to test against) and specifically look for any dedicated finance/payout/commission surface — check Настройки, any hidden or role-gated nav items, and specifically probe `merchant.kaspi.kz` (confirmed in project memory as a *different* system, Kaspi Pay/acquiring, reached via the same phone login) for a real payout/commission endpoint. Write findings to `docs/superpowers/specs/2026-08-13-kaspi-finance-api-findings.md` regardless of outcome — a confirmed "no such endpoint exists" is as valuable to record as a confirmed shape, so a future session doesn't re-spend a live capture re-checking it.

## Explicitly out of scope for v1

- Real Kaspi commission/fee breakdown, unless Task 1 confirms a real endpoint — flagged as a stretch outcome, not promised in this design.
- Payout/withdrawal tracking to the seller's bank account.
- Tax reporting or accounting-software export.
- Custom date ranges (only the 7/30/90-day presets).
- Charts/graphs (list-based daily breakdown only).
- Any status other than `KASPI_DELIVERY_TRANSMITTED`/`ARCHIVED` counted as revenue.
