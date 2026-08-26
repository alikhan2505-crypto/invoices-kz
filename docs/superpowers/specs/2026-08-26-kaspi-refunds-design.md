# Kaspi Shop: Возвраты — Design

2026-08-26. Approved by founder in-session. API ground truth:
`2026-08-26-kaspi-refunds-quality-api-findings.md` §1 — every endpoint below
was captured live against a real seller account (425002, 322 historical
refunds) with real item/detail data.

## Problem

The cabinet's «Возвраты» section (return requests and disputes) has zero
presence in our app. Sellers must open the real Kaspi cabinet to see what's
happening with a return, forcing a context switch away from our Kaspi Bot
dashboard for one of the most common post-sale events.

## Scope

**Phase 1 (this spec): full read-only visibility** across all 5 tabs —
Новые, На доставке, Ожидают решения, Споры, Закрытые заявки. List, detail,
timeline, photos, counts.

**Deferred to Phase 1b:** action buttons (accept/reject a pending decision,
respond to a dispute). The API's `actions[]` field on a refund's detail is
confirmed to exist but its populated shape (what buttons/payloads it offers
for an active pending request) was never observed — both live-captured
accounts had zero currently-active refunds, only historical CLOSED ones.
Guessing this shape risks a wrong action against a real customer's money.
Capture it for real the first time either account has a live pending refund,
then build Phase 1b as its own pass.

## UX

New page `/kaspi-shop/refunds`, added to `SiteNav`'s Kaspi Bot section
(after Заказы). Same visual language as `/kaspi-shop/orders`:

1. **Tab pills** with live counts: Новые / На доставке / Ожидают решения /
   Споры / Закрытые заявки — from `load-refunds-count`. Default tab:
   whichever has the highest count among Новые/На доставке/Ожидают
   решения/Споры (the "needs attention" tabs), falling back to Закрытые
   заявки if all four are zero (mirrors the Заказы page's "show me
   something useful first" default).
2. **Card grid** (same `grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`
   pattern as `/kaspi-shop/removed`): per refund — product name (link to
   the Kaspi product page), order code, customer name, amount (`sum`),
   reason (`refundReason.reasonDescription`), status pill
   (`description`/`stepDescription` —「Возврат оформляется」etc., colored by
   a small status→color map: `*оформлен*` green, `*отменён*` neutral,
   `*оформляется*`/anything else amber-in-progress).
3. **Detail panel** (slide-over or modal, consistent with the existing
   stock-edit modal's styling) on card click, fetched from
   `load-refund-details`:
   - Header: применение number, order link, customer name.
   - Financial line: item price (`total`) vs actual payout (`totalWithdraw`)
     — surfaced explicitly since this is a real, useful "why is my payout
     less than the price" answer the cabinet itself doesn't explain inline.
   - Timeline: `stateSteps[]` rendered as a vertical stepper — title +
     status dot (`stepStatus`: SUCCESS green / IN_PROGRESS amber / anything
     else neutral) + `expirationTime` where present. Rendered generically
     off `stepType`/`stepStatus`/`stage` without hardcoding the specific
     step titles, since new step types are plausible for other tabs
     (DISPUTE in particular was never observed with real steps).
   - Photos: `imageUrls[]` as a small gallery (buyer's return-condition
     photos).
   - Reason + comment (`refundReason.reasonDescription`, `comment` if
     present).
   - Delivery tracking link (`klTrackUrl`) when present.
   - **`actions[]` (Phase 1b placeholder):** if non-empty, render a neutral
     "Ответьте в кабинете Kaspi" note with a raw list of action labels
     rather than functional buttons — visible signal that something needs a
     response, without fabricating the response mechanism.

No new DB tables — this is a pure Kaspi passthrough view, same as
`/kaspi-shop/orders`. No caching beyond the page's own React state; a manual
refresh (re-fetch on tab switch) is enough given Kaspi's own async
processing cadence.

## Server design

New module `src/lib/kaspiShop/refunds.ts` (fake `fetchFn` injection, same
pattern as every other kaspiShop module):

- `getRefundCounts(cookies, merchantId)` → `GET load-refunds-count` →
  `{ tab, tabTitle, total }[]`, `sessionExpired` on 401/403.
- `listRefunds(cookies, merchantId, tab, page)` → `GET load-refunds-by-tab`
  → `{ refunds: RefundListItem[], total, sessionExpired }`. `tab` is one of
  `NEW | ON_DELIVERY | WAITING_DECISION | DISPUTE | CLOSED` (server-side
  validated against this exact set — NOT the `REFUND_NEW`-style hash value
  the frontend route uses, per the findings doc's explicit warning about the
  naming mismatch).
- `getRefundDetails(cookies, merchantId, refundId, applicationNumber)` →
  `GET load-refund-details` → full detail object, typed defensively
  (`stateSteps` items typed as `{ title, stepStatus, stage, result,
  stepType, expirationTime }` with all consumers tolerant of extra/missing
  fields — the API is clearly still evolving per the empty vs. unknown
  `actions[]` gap).

API routes:
- `GET /api/kaspi-shop/refunds/counts` → `{ counts: [...] }`
- `GET /api/kaspi-shop/refunds?tab=NEW&page=0` → `{ refunds, total }`
- `GET /api/kaspi-shop/refunds/[refundId]?applicationNumber=...` → detail
  object (applicationNumber passed as query since Kaspi's own endpoint
  requires both refundId and code together)

All three follow the existing auth pattern (`requireUser` + `loadConnection`
+ `markSessionExpired` on session-expired responses), matching
`orders/route.ts` and `removed-products/route.ts`.

## Testing

Vitest on `refunds.ts` with injected fake `fetchFn`:
- counts/list/detail map real captured JSON shapes correctly;
- `tab` validation rejects the frontend hash-style values
  (`REFUND_NEW`) to catch the naming-mismatch bug class before it ships;
- 401/403 → `sessionExpired: true` on all three;
- detail mapping tolerates `actions` being absent/empty/non-empty without
  throwing (defensive parsing, since the non-empty shape is unconfirmed).

Typecheck + `next build` + full test suite before commit, same gate as the
last two features. Live smoke test by the founder against the ABIL-SISTERS
store (425002) after deploy — that account has real historical data to
verify against immediately, unlike the primary test account.
