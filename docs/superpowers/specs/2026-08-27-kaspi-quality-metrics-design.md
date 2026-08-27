# Kaspi Shop: Показатели качества — Design

2026-08-27. Approved by founder in-session (nav placement confirmed;
scope otherwise pre-agreed via the roadmap). API ground truth:
`2026-08-26-kaspi-refunds-quality-api-findings.md` §2, with the 3 previously
unconfirmed `metricType` enum values captured live this session — see
correction below.

## Problem

The cabinet's «Показатели качества» section (Рейтинг, Возвраты по
качеству, Задержки при передачах, Отмены по вашей вине) has zero presence
in our app. These are the metrics Kaspi uses to penalize or delist
underperforming sellers — exactly the kind of thing the repricer's whole
positioning is built around ("don't get penalized"), so surfacing them
next to Демпинг is a natural fit for this app specifically, not just
generic parity.

## API correction (live-verified 2026-08-27)

The findings doc's `metricType` guess was wrong for 2 of 4 tabs — captured
directly by switching tabs live:
- Рейтинг → `RATING`
- Возвраты по качеству → **`RETURN`** (singular — NOT `RETURNS`)
- Задержки при передачах → `LATE_KASPI_DELIVERY` (as guessed)
- Отмены по вашей вине → **`CANCEL`** (singular — NOT `CANCELS`)

This would have shipped broken (GraphQL rejects an unknown enum value for
the whole query, not just the affected field) had it gone in on the
guess — worth the extra login/relogin from an expired session in this
session.

## Scope

Read-only monitoring, same as Возвраты Phase 1: no actions, nothing to
submit. Four tabs mirroring the cabinet exactly.

## UX

New page `/kaspi-shop/quality`, own top-level entry in `SiteNav`'s Kaspi
Bot section labeled «Качество» (founder confirmed: separate item, not
nested under Демпинг or another existing page).

1. **Tab pills**: Рейтинг / Возвраты по качеству / Задержки при передачах /
   Отмены по вашей вине. All 4 metrics come from ONE shared API call made
   once on page load (`getSingleMetricDetails` returns rating + returned +
   lateKaspiDelivery + cancelled together) — switching tabs is instant,
   no refetch.
2. **Top banner per tab** — mirrors the cabinet layout:
   - Current value vs. violation threshold (`goodValue` vs
     `violationValue`), e.g. "4.6" vs "не ниже 4.0" for rating, or "2%" vs
     "не должно превышать 3%" for cancels.
   - A color indicator derived from `zonePercentage` (0–100, how close to
     the violation threshold): green under 50, amber 50–80, red above 80 —
     this is the "are you at risk" signal the founder's repricer
     positioning cares about.
   - Formula breakdown line from `formulaElements` (`numerator`/
     `denominator`), phrased per metric (e.g. "0 задержек из 11 заказов").
   - When `notEnoughData` is true, replace the value with Kaspi's own
     "Сформируется после N" copy instead of showing a misleading number —
     confirmed live this is the majority state for a low-volume seller
     account, so this path must look intentional, not broken.
   - `ordersCount` and the period (`daysPerPeriod`/`from`/`to`) shown as
     small print, matching cabinet copy ("за последние 30/90 дней").
3. **Per-category table** below the banner (`getQCByCategories`, refetched
   per active tab with the metric-specific `is*` flag + correct enum from
   above): category name + icon, `performanceStatus` badge (e.g. "TOP"/
   "Отлично" — display Kaspi's own status string), count line matching the
   banner's formula style.
4. **bannerGroup.warning`** (top-level cross-metric alert, currently always
   `null` on both captured accounts): render only when non-null, generic
   per-signal rendering (`level`/`metric` fields) since a populated example
   was never observed — do not hardcode specific warning copy.

No new DB tables — pure Kaspi passthrough, same pattern as Возвраты/Заказы.

## Server design

New module `src/lib/kaspiShop/quality.ts`:

- `QUALITY_TABS = ['rating', 'returns', 'lateDelivery', 'cancellations'] as const`
  — our OWN internal tab keys (readable, stable), mapped internally to
  Kaspi's real enum/flags so a future Kaspi rename doesn't ripple through
  the UI layer.
- `getQualityOverview(cookies, merchantId)` → one `getSingleMetricDetails`
  GraphQL call → `{ rating: MetricSummary & { statistics }, returns:
  MetricSummary, lateDelivery: MetricSummary, cancellations: MetricSummary,
  ordersCount, warning: WarningSignal[] | null, sessionExpired }`.
  `MetricSummary = { goodValue, violationValue, zonePercentage, percentage,
  daysPerPeriod, from, to, notEnoughData, numerator, denominator }` (flattens
  `formulaElements`).
- `getQualityCategories(cookies, merchantId, tab, page)` → maps our tab key
  to Kaspi's real `{ metricType, isRating, isReturned, isLateKaspiDelivery,
  isCancelled }` combination internally, calls `getQCByCategories` →
  `{ categories: CategoryRow[], total, sessionExpired }`.
  `CategoryRow = { categoryCode, categoryDisplayName, performanceStatus,
  metric: MetricSummary }`.

API routes (auth + `loadConnection` + `markSessionExpired`, same pattern
as every other kaspiShop route):
- `GET /api/kaspi-shop/quality/overview` → the 4-metric bundle
- `GET /api/kaspi-shop/quality/categories?tab=rating&page=0` → category table

## Testing

Vitest with injected fake `fetchFn`, mirroring `refunds.ts`'s test style:
- overview mapping matches the real captured `getSingleMetricDetails`
  shape, including `notEnoughData` passthrough and `lateExpressDelivery:
  null` tolerance;
- categories: each of the 4 tab keys sends the CORRECT real enum
  (`RATING`/`RETURN`/`LATE_KASPI_DELIVERY`/`CANCEL`) and boolean flags —
  this is the test that would have caught the wrong guess, so it's the
  most important one in this module;
- an invalid tab key throws before any network call (same defensive
  pattern as `refunds.ts`'s `REFUND_TABS` guard);
- 401/403 → `sessionExpired: true` on both functions.

Typecheck + `next build` + full suite before commit, same gate as every
prior feature this cycle.
