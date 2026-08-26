# Kaspi Возвраты + Показатели качества — Live-Captured Request Shapes

Captured live 2026-08-26 on merchant **30067228** via chrome-devtools MCP
(fresh SMS re-login — the 2026-08-25 session had expired). Common headers
same as every other `mc.shop.kaspi.kz` capture in this repo: `x-auth-version:
3`, session cookie, `origin`/`referer: https://kaspi.kz/`.

## 1. Возвраты (Refunds & Disputes) — endpoints confirmed, item shape NOT

The merchant has **zero refund requests in every tab** (Новые/На доставке/
Ожидают решения/Споры/Закрытые — all `total: 0`), so the endpoints below are
confirmed live but the shape of an individual refund item is **unknown**.

```
GET /refund/api/v1/merchant-cabinet/load-refunds-count?merchantId=30067228
→ [{"tab":"WAITING_DECISION","tabTitle":"Ожидают решения","total":0},
   {"tab":"ON_DELIVERY","tabTitle":"На доставке","total":0},
   {"tab":"CLOSED","tabTitle":"Закрытые заявки","total":0},
   {"tab":"DISPUTE","tabTitle":"Споры","total":0},
   {"tab":"NEW","tabTitle":"Новые","total":0}]

GET /refund/api/v1/merchant-cabinet/load-refunds-by-tab?merchantId={m}&tab={TAB}&p=0&s=10
→ {"data":[],"total":0}
```
`tab` values confirmed by direct navigation: `NEW`, `DISPUTE` (and by the
count endpoint's own keys: `ON_DELIVERY`, `WAITING_DECISION`, `CLOSED`). Note
the URL hash uses `REFUND_NEW` for the tab param name in the route
(`#/refunds?status=REFUND_NEW`) but the actual API call sends `tab=NEW` —
these are NOT the same string, don't conflate them.

The list page also has a **search box** — «Поиск по номеру заказа или
заявки» — strongly implying each item carries an order code and its own
заявка id/number, but no request was observed (nothing to search for).

**What this means for building:** the count endpoint is enough today to
build a real, honest "у вас N новых заявок на возврат" badge/counter
anywhere in our app (e.g. next to Заказы). The full list/detail/action UI
(view a return request, respond to a dispute, approve/reject) needs a real
item to inspect — **defer that part** until either this test account gets a
real return, or capture is retried on a seller account that has one. Do not
guess the item's field names.

## 2. Показатели качества (Quality/Rating) — FULLY confirmed, real data

One shared page component serves all 4 sub-tabs (Рейтинг, Задержки при
передачах, Возвраты по качеству, Отмены по вашей вине); each tab fires the
**same two GraphQL operations** against `/mc/facade/graphql`, differing only
in which field of the first response is displayed and which boolean flag is
set in the second.

### 2.1 Top banner numbers — `getSingleMetricDetails`
```graphql
query getSingleMetricDetails($id: String!, $version: QcVersion!) {
  merchant(id: $id) {
    qualityControl(version: $version) {
      ratingWithStatistics { details {...} statistics { oneCount twoCount threeCount fourCount fiveCount } }
      returned          { details {...} }   # Возвраты по качеству
      lateKaspiDelivery { details {...} }   # Задержки при передачах
      lateExpressDelivery { details {...} } # null when not applicable (this merchant: no express)
      cancelled         { details {...} }   # Отмены по вашей вине
      state { ... on TrialQualityMetricState { dayToStayInSegment countDaysForSegment } }
      capabilities { shopInShop { status data { ... on QcShopInShopGracePeriodData { blockDate } } } }
      bannerGroup { warning { generalLevel signals { level metric } } topMerchant { status requiredImprovement } info { info } }
      ordersCount
    }
  }
}
# variables: {"id": merchantId, "version": "V2"}
```
`details` fragment (same shape on every metric): `goodValue` (the seller's
current value), `violationValue` (the threshold that triggers a penalty),
`zonePercentage` (0–100, how close to the violation threshold — this is the
number to alarm on), `percentage`, `from`/`to` (ISO period bounds),
`daysPerPeriod` (90 for rating, 30 for the other three), `formulaElements
{numerator denominator}`, `notEnoughData` (true when the seller hasn't hit
the minimum sample size yet — Kaspi shows "Сформируется после N" in this
case, not a real value).

Real captured example (merchant has almost no data yet, `notEnoughData:
true` everywhere): rating `goodValue: 4.6` vs `violationValue: 4.0` (rating
must NOT go below 4.0), lateKaspiDelivery `goodValue: 5.0` vs
`violationValue: 10.0` with `formulaElements: {numerator: 0, denominator:
7}` (0 delayed out of 7 transferred orders), cancelled and returned both
`goodValue: 1.0` vs `violationValue: 2.0`/`3.0`.

`bannerGroup.warning` was `null` for this merchant (nothing currently in a
warning zone) — the real shape of a populated warning (what `signals[]`
looks like when non-empty) was **not observed**; build the "everything's
fine" and empty-signals states from this capture, treat a populated
`warning.signals` array defensively (render `metric`/`level` generically)
until seen for real.

### 2.2 Per-category breakdown table — `getQCByCategories`
```graphql
query getQCByCategories($merchantUid: String!, $page: Int!, $size: Int!,
    $metricType: QcMetricType!, $isCancelled: Boolean!, $isReturned: Boolean!,
    $isLateKaspiDelivery: Boolean!, $isRating: Boolean!) {
  merchant(id: $merchantUid) {
    qualityControl(version: V2) {
      categories(page: $page, size: $size, metric: $metricType) {
        totalCount
        items {
          categoryCode categoryDisplayName effectiveDate images
          qualityMetrics {
            performanceStatus   # e.g. "TOP"
            cancels @include(if: $isCancelled) { ...DerivedMetricFields }
            returns @include(if: $isReturned) { ...DerivedMetricFields }
            delivery @include(if: $isLateKaspiDelivery) { ...DerivedMetricFields }
            rating @include(if: $isRating) { ...DerivedMetricFields }
          }
        }
      }
    }
  }
}
fragment DerivedMetricFields on DerivedMetric {
  percentage performanceStatus totalCount warningLevel violatedCount
  daysPerPeriod from to notEnoughData
}
```
`metricType` enum values seen: `RATING` (for the Рейтинг tab; the other 3
tabs presumably send `RETURNS`/`CANCELS`/`LATE_KASPI_DELIVERY` matching the
`is*` boolean names — not directly observed switching tabs, but the pattern
is unambiguous from the query's own `@include` directives). Only ONE of
`isCancelled`/`isReturned`/`isLateKaspiDelivery`/`isRating` is true per call,
matching whichever tab is active.

Real captured example: one category («Хозяйственные товары»),
`performanceStatus: "TOP"`, `rating.notEnoughData: true` (same
not-enough-data state as the top banner, consistent).

### 2.3 Sidebar navigation (for reference, no new endpoints)
Cabinet routes: `/mc/#/main-quality-control/rating`, `.../lateKd`,
`.../returns`, `.../cancels` — pure client-side routing over the same two
GraphQL calls above with different tab selection.
