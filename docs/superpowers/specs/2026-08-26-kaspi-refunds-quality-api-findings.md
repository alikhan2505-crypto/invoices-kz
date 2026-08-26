# Kaspi Возвраты + Показатели качества — Live-Captured Request Shapes

Captured live 2026-08-26 on merchant **30067228** via chrome-devtools MCP
(fresh SMS re-login — the 2026-08-25 session had expired). Common headers
same as every other `mc.shop.kaspi.kz` capture in this repo: `x-auth-version:
3`, session cookie, `origin`/`referer: https://kaspi.kz/`.

Section 1 was re-captured against a second merchant on the same login,
**425002 (ABIL-SISTERS)**, which has 322 historical refunds — the founder's
sister's real shop, switched to via the header's merchant dropdown
(`a.navbar-item` containing the target merchant id; the a11y-tree click
target was unreliable, use `document.querySelectorAll('a.navbar-item')` and
match by text). This gave full real item + detail schemas.

## 1. Возвраты (Refunds & Disputes) — FULLY confirmed on merchant 425002

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
заявки» — confirmed to search by `order`/`applicationNumber`.

### 1.1 List item — `load-refunds-by-tab`, real example (merchant 425002, CLOSED)
```json
{"refundId":"69f5e8cbeb0b53711e7af9ec","applicationNumber":"906725811-1",
 "tab":"CLOSED","reason":"SIZE_MISMATCH",
 "refundReason":{"reason":"SIZE_MISMATCH","reasonDescription":"Не подошел размер"},
 "plannedDate":"2026-05-15T20:00:00","order":"906725811","productSku":"162495789",
 "customer":"Акбота О.","sum":4100.0,"quantity":1,"unit":"PIECES","weight":1.0,
 "description":"Возврат оформляется"}
```
`description` here is confusingly named — it is NOT a text field, it IS the
human status string ("Возврат оформляется"/"Возврат оформлен"/"Возврат
отменён"), same vocabulary as `stepDescription` in the detail response below.
`reason` codes seen across 10 real rows: `SIZE_MISMATCH` ("Не подошел
размер"), `SHORT_DELIVERY` ("Не получил товар"), `UNSUITABLE` ("Не
понравился"), `WRONG` ("Не как на фото или в описании"). `customer` is
already privacy-trimmed by Kaspi itself (first name + last-initial, e.g.
"Акбота О.") — safe to display as-is.

### 1.2 Detail — `load-refund-details?merchantId={m}&refundId={id}&code={applicationNumber}`
Real example (same refund as above):
```json
{"refundId":"69f5e8cbeb0b53711e7af9ec","applicationNumber":"906725811-1",
 "responsible":"MERCHANT","order":"906725811","customerId":"17350556",
 "customerName":"Акбота О.","customerPhone":"+0(000)-000-00-00",
 "refundReason":{"reason":"SIZE_MISMATCH","reasonDescription":"Не подошел размер",
   "reasonChangeHistory":{"originReason":"SIZE_MISMATCH","originReasonDescription":"Не подошел размер","changeContext":null}},
 "deliveryType":"KASPI_DELIVERY","refundTab":"CLOSED","address":null,"orderAddress":null,
 "productSku":"162495789","quantity":1,"productPrice":4100.0,"total":4100.0,
 "totalWithdraw":3587.0,"weight":1.0,"unit":"PIECES","unitCode":"PIECES",
 "rejectDescription":"","comment":null,"stepDescription":"Возврат оформляется",
 "examinationProtocolExist":false,"actions":[],
 "stateSteps":[
   {"title":"Заявка принята","stepStatus":"SUCCESS","stage":"PASSED","result":"POSITIVE",
    "expirationTime":"2026-05-02T18:23:10.595","stepType":"MERCHANT_APPROVAL", "...":"delayed,comment,additionalText,inspectionResultUrl,stepAction,stepHint all null/false"},
   {"title":"Покупатель оставил товар в Kaspi Postomat","stepType":"BACKWARD_DELIVERY_BY_KASPI", "...":"..."},
   {"title":"Мы доставили товар на склад, по адресу Астана, ул. Шевченко, 6","stepType":"BACKWARD_DELIVERY_BY_KASPI_FINISHED"},
   {"title":"Вы не приняли решение, возврат оформлен автоматически","stepType":"MERCHANT_DECISION"},
   {"title":"Возврат оформляется","stepStatus":"IN_PROGRESS","stage":"CURRENT","result":null,"stepType":"WAITING_PAYMENT"}
 ],
 "klTrackUrl":"https://ksint.kaspi.kz/ksl/tracking/order/906725811-1-R",
 "imageUrls":["https://resources.cdn-kaspi.kz/yml/ks-refund/...","..."],
 "orderCompletionDate":"2026-05-02T16:53:39.563",
 "daysCountBetweenRefundCreationAndOrderCompletion":0,
 "merchantHint":null,"createdDate":"2026-05-02T17:06:35.489"}
```
Key fields for building: `totalWithdraw` is the seller's actual payout after
Kaspi's fee (3587 vs `total: 4100` here — a real commission delta, worth
surfacing since it explains "why did I get less than the item price back").
`stateSteps[]` is the full visual timeline (title + stepStatus + stage +
result + stepType), safe to render generically/defensively per-item since
`stepType` is clearly an enum. `actions: []` was empty on this CLOSED item —
**the shape of a populated `actions` array (what a pending "Новые заявки" or
"Ожидают решения" item offers — accept/reject/dispute buttons) was NOT
observed**, because merchant 425002 also has zero currently-active refund
requests (only historical CLOSED ones, `total: 322`). Render `actions`
defensively (generic button-per-entry) until a live pending item is seen;
do not hardcode an accept/reject button pair from guesswork.

`customerPhone` comes back already masked (`+0(000)-000-00-00`) — Kaspi
itself doesn't expose the real number to the merchant-cabinet API for
CLOSED refunds; unclear if it's real for an active NEW request (not tested).

### 1.3 Image preview list — `refund/{refundId}/images/preview?merchantId={m}`
Returns `[{"imageUrl": "..."}]`, redundant with `imageUrls` on the detail
call — no need to call both.

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
