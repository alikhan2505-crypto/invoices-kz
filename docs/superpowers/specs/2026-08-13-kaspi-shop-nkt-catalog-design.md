# Kaspi Shop: Каталог НКТ — Design

## Context

Fourth sub-project of the Kaspi Shop cabinet-bot platform, after Демпинг, Заказы+накладные, and Финансы (all shipped 2026-08-13). Both competitors evaluated earlier (Northline, PriceFeed) list "Каталог НКТ" in their own menus. The real Kaspi Магазин cabinet has its own real feature this maps to: a "Нераспознанные товары" (Unrecognized products) item under ТОВАРЫ in the cabinet's own nav, plus a `merchant-nct` backend namespace (`GET .../merchant-nct/mc/nct/kassa-status?m={merchantId}`) that fires on every cabinet page load — confirmed live this session, real, reachable via the session already built.

НКТ (Национальный каталог товаров, National Product Catalog) is a real Kazakhstan compliance concept: cash-register/tax reporting requires products to be matched to a national catalog code. A product Kaspi's own system can't auto-match shows up as "unrecognized" — a seller normally has to go into Kaspi's own cabinet to resolve this.

## v1 scope: read-only status view, no write action

Following the same caution this session already applied to накладная generation (deferred a real mutating action until its exact shape is live-confirmed): v1 is **read-only**. It shows which products are unrecognized and their basic info — it does not attempt to fix/reclassify them, since that write action's real request shape is unconfirmed and out of scope until a dedicated live-capture session confirms it (recorded as a stretch goal for v2, matching the same pattern Финансы used for the payout-endpoint question).

## Architecture

Reuses all existing session infrastructure (`loadConnection`, `cabinetApi.ts` pattern). Task 1 is a live, controller-only research task (same pattern as every previous sub-project) against the already-connected real account, to observe:
1. The real request/response shape of "Нераспознанные товары" (`kaspi.kz/mc/#/products/pending`) — what fields describe an unrecognized product.
2. The real shape of the `merchant-nct/mc/nct/kassa-status` endpoint already observed firing, to confirm what it actually reports (its name suggests a cash-register-readiness check, possibly a single overall status rather than per-product data — Task 1 confirms which).

No code is written for the data-fetching layer until Task 1's findings are recorded, matching this project's established discipline of not guessing real API shapes.

## UI

Distinct from Демпинг/Финансы's three-number hero pattern — this is a compliance checklist, not a KPI dashboard, and pretending otherwise would misrepresent the content. Shows:
- A single segmented status bar: "Распознано" vs "Не распознано" (recognized vs unrecognized), same dark hero-card visual language (`bg-[#12142E]`) as the rest of Kaspi Shop, but as a proportion indicator instead of three big numbers.
- Below it, a list of unrecognized products (name, photo if the real data has one, SKU) — read-only, no action buttons in v1.
- Sidebar: "Каталог НКТ" moves from the "скоро" list to a real link, matching the pattern already used for Заказы/Финансы.

## Explicitly out of scope for v1

- Any write/fix action for reclassifying an unrecognized product (real endpoint shape unconfirmed — v2 candidate once live-captured).
- Bulk actions.
- Historical/trend view of recognition rate over time.
