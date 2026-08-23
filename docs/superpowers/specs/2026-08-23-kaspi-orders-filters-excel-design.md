# Kaspi Shop Orders: City Filter, Date Tab, Excel Export — Design

## Context

Founder parity request after fixing накладная printing (2026-08-23, see the waybill fix commit): the real Kaspi cabinet's own "Заказы" page has a city filter, a "Все/Завтра до 20:00" date tab (visible under "Передача"), and a "Выгрузить в Excel" button. This is a first sub-project; a second, separate spec covers redesigning the накладная print layout for A4 vs A6 label printers.

## Architecture

### City filter — global, all statuses

`OrdersPageFragment` in `GET_ORDERS_QUERY` (`cabinetApi.ts`) gets `destination { ... on Point { city { id name } } ... on OrderAddress { city { id name } } ... on Postomat { city { id name } } }` added — a field already confirmed live in the fuller `getOrders` shape (`docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md`), just not previously requested by our trimmed fragment. `Order` type gains `cityId`/`cityName`.

`listOrders` accepts an optional `cityId` param, forwarded into the existing `input.cityId` GraphQL variable (already wired, currently always `''`) — no new endpoint, no guessing.

Dropdown options are **not** sourced from the existing `kaspi_shop_settings/cities` cache (that's the 320-entry national catalog-pricing city list, a different concept/id-space). Instead: on first load of a status tab, the client walks up to 5 pages (50 orders) of that status with no city filter, collects distinct `{cityId, cityName}` pairs client-side, and caches them per status for the session. Good enough for the realistic order volumes in these statuses; a city that's never appeared in the sampled pages simply won't show as an option (documented limitation, not a bug).

### Date tab — Передача/Упаковка only

Kaspi's `getOrders` `input` has no server-side date field (confirmed shape: `presetFilter`, `orderCode`, `cityId` only). The "Завтра до 20:00" tab post-filters the **already-fetched page** by `delivery.plannedDeliveryDate` (needs adding to the fragment) falling within tomorrow's cutoff, vs "Все" showing everything. Only rendered on `KASPI_DELIVERY_WAIT_FOR_COURIER`/`KASPI_DELIVERY_CARGO_ASSEMBLY` (`BULK_PRINTABLE_STATUSES` — already the exact right set). Since this only ever acts on the current page, a status with more than one page of orders will only reflect that page when the tab is toggled — acceptable given these statuses hold small transient counts in practice.

### Excel export

New `GET /api/kaspi-shop/orders/export` accepting the same `status`/`cityId` query params as the list route. Server loops `listOrders` pages (page 0, 1, 2, …) accumulating orders until `total` is reached or **500 orders**, whichever first — 500 is a hard stop against a multi-thousand-row Архив export hanging the request; response includes a `truncated: true` flag surfaced as a toast when hit. Builds an `.xlsx` via the already-installed `xlsx` package: columns — № заказа, Город, Покупатель, Сумма, Дата создания, Дата передачи (blank when n/a), Товары (`name ×qty` joined by `; `). Streams back with `Content-Disposition: attachment; filename="zakazy_{status}_{date}.xlsx"`.

## UI

Header row (next to the "По виду/По дате" toggle): city `<select>` populated per above, and an "Выгрузить в Excel" button — both always visible, not gated on checkbox selection. The date tab ("Все"/"Завтра до 20:00") renders as a second small tab row, only under `BULK_PRINTABLE_STATUSES`, sitting between the status chips and the bulk-print bar.

## Explicitly out of scope

Order-number search / "Расширенный поиск" (not requested); server-side date filtering (would need a still-unconfirmed Kaspi param); Excel export respecting the date-tab sub-filter (exports the full status, city filter only — date tab is a quick on-screen glance, not an export dimension); any change to накладная printing (separate spec).
