# Kaspi Shop: Orders + Waybills — Design

## Context

Second sub-project of the Kaspi Shop cabinet-bot platform (the first, repricing, shipped 2026-08-13). Every competitor evaluated this session (Northline, PriceFeed) treats order visibility and combined waybill printing as core, day-one functionality — sellers currently do this by clicking through Kaspi's own cabinet order-by-order. This spec covers a read-only order view plus combined-waybill printing; order actions (accept, cancel, mark packed) are explicitly out of scope for v1 — read-only carries no risk of corrupting a real order's state on the first pass, matching how the repricer itself started with reads (competitor prices) before writes (price pushes).

## Architecture

### Reuses the existing cabinet-bot session

No new authentication. `cabinetAuth.ts`/`cabinetApi.ts` (shipped with the repricer) already produce and validate `sessionCookies` for a connection; this feature is simply new authenticated calls against that same session.

### Live proxy, no local cache table

Orders are fetched live from Kaspi on every page load (and on manual refresh) rather than synced into a local table on a schedule. Simpler, always current, and avoids inventing a new cron/sync job for a read-only view. If real usage shows this is too slow or too chatty against Kaspi, a cache layer is a natural follow-up — not built preemptively.

### Two pieces of real request/response shape still unknown

Neither has been captured live yet, the same situation the repricer's login flow was in before this session's live-capture work:

1. **The `getOrders` GraphQL query** (`mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders`) — its exact query text, variables (status filter, pagination), and response shape (what fields an order actually carries: customer name, items, amount, status, timestamps) were seen fire during earlier read-only exploration but never inspected.
2. **The waybill (накладная) endpoint** — how the real cabinet serves a single order's waybill (PDF download URL? An endpoint returning PDF bytes directly? Something else?) has never been observed.

Both need a live capture session against the real account before implementation can write real code for them, using the same XMLHttpRequest-interceptor-plus-localStorage technique that finally worked for the login flow (documented in `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md`). This is also the first real end-to-end use of the v2 cabinet-bot connect flow (phone + SMS), which has been implemented but not yet run against a real account — this session's next research pass doubles as that overdue verification.

### Order statuses shown

Mirrors the real cabinet's own grouping (familiar to any seller who's used Kaspi's own interface), read-only: Новые, На подписании, Самовывоз, Моя доставка, Kaspi Доставка, Предзаказ, Упаковка, Передача, Переданы на доставку, Отменены при доставке, Архив, plus Возвраты as its own group (Новые заявки, На доставке, Ожидают решения, Споры, Закрытые заявки).

### Combined waybills

Matches the real workaround every competitor converged on: sellers select multiple orders in "Передача" (the status where a physical waybill is actually needed, to hand off to a courier), click "Распечатать все накладные", and get one merged PDF instead of opening each order's waybill separately. Server-side: fetch each selected order's individual waybill PDF from Kaspi (once the real endpoint is confirmed), merge with `pdf-lib` (new dependency — the codebase's existing `jspdf` builds PDFs from drawing commands, it can't merge pre-existing PDF files), return the merged file for download.

### UI

Kaspi Shop's sidebar (built with the redesign) gets a real "Заказы" item, replacing its current "скоро" lock. Status tabs at the top (matching the grouping above), an order list below, and a checkbox-select + "Распечатать все накладные" bar that appears when one or more orders in "Передача" are selected.

## Explicitly out of scope for this version

Order actions (accept/cancel/mark-packed/etc.), any order-status caching or offline view, накладные for statuses other than "Передача", bulk actions beyond waybill printing.
