# Kaspi Orders/Waybills API — Live-Captured Request Shapes

Captured live 2026-08-13 against the real Kaspi Магазин test account (ИП FIRST PROJECT, merchant id 30067228), same session in which the v2 cabinet-bot connect flow was finally confirmed working end-to-end (see below).

## 1. v2 connect flow — CONFIRMED working end-to-end

This closes out the previous plan's one open question. The real, live-observed root cause and fix are documented in `docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md` ("Login step 3" section) and `src/lib/kaspiShop/cabinetAuth.ts`'s `MC_URL` comment: the session hop from `idmc.shop.kaspi.kz` to `mc.shop.kaspi.kz`'s `mc-session`/`mc-sid` cookies is a full OAuth2 Authorization Code + PKCE flow, not a direct navigation. Once `cabinetAuth.ts` was fixed to start the redirect-chain walk at the real OAuth kickoff URL (`https://mc.shop.kaspi.kz/oauth2/authorization/1?redirectUrl=...`), a real connect through `/kaspi-shop`'s UI succeeded: phone + SMS login → session established → `getMerchant` succeeded → connection saved, showing "ИП FIRST PROJECT" / "● Работает" in the UI.

One additional, unrelated bug surfaced and was fixed in the same session: `kaspi_shop_connections.api_token_enc` had a `NOT NULL` constraint left over from v1 (API-token-only) connections; v2 (session-cookie) connections never set it, causing a 500 on `saveConnection`. Fixed via a migration (`kaspi_shop_connections_api_token_nullable`, column now nullable) plus guarding the decrypt in `connection.ts` against a null column.

## 2. `getOrders` (CONFIRMED — full shape)

```
POST https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders
```

Headers: same pattern as every other authenticated cabinet call — `x-auth-version: 3`, `origin: https://kaspi.kz`, `referer: https://kaspi.kz/`, `cookie: mc-session=...; mc-sid=...`.

Request body:
```json
{
  "operationName": "getOrders",
  "variables": {
    "merchantUid": "30067228",
    "size": 10,
    "page": 0,
    "input": { "presetFilter": "NEW", "orderCode": "", "cityId": "" },
    "advancedInput": { "orderCode": "", "phoneNumber": "", "productCode": "" },
    "withAdvancedOrders": false
  },
  "query": "query getOrders($merchantUid: String!, $input: MerchantOrderInput!, $advancedInput: MerchantOrderAdvancedInput!, $withAdvancedOrders: Boolean!, $page: Int!, $size: Int, $sort: [String!]) { merchant(id: $merchantUid) { id orders { orders(input: $input, page: $page, size: $size, sort: $sort) @skip(if: $withAdvancedOrders) { total orders { ...OrdersPageFragment } } advancedOrders(input: $advancedInput, page: $page, size: $size, sort: $sort) @include(if: $withAdvancedOrders) { total orders { ...OrdersPageFragment } } } } } fragment OrdersPageFragment on Order { code customer { firstName lastName } totalPrice creationTime modificationTime status entries { isImeiRequired product { code name } merchantProduct { code name barcode } totalPrice quantity } destination { ... on Point { id name enabled type city { id name } schedule { weekDays { openingTime closingTime dayOfWeek } } pointAddress: address { streetName streetNumber building phone name } } ... on OrderAddress { streetName streetNumber building city { id name } } ... on Postomat { id postomatAddress: address city { id name } } } warehouse { ... on Point { id name enabled address { streetName streetNumber building phone name } city { id name } kaspiDelivery { dailyMaxPickupTimeEnabled pickupType } } ... on OrderAddress { city { id name } } ... on Postomat { id postomatAddress: address city { id name } } } markers { creationTime marker user { name } userName } steps { status timeoutTime step plannedTime additionalDays } payments { ... on OrderLoan { amount signRequired } ... on OrderAccount { amount signRequired } } cargoSpace kaspiDelivery deliveryMethod deliveryZone delivery { actualDeliveryDate isOrderArrived isExpress isReturnedToWarehouse kdReturnedToWarehouseDate kdTransmittedToCourier mode plannedDeliveryDate returnedToWareHouseTimeoutDate transmissionPlanningDate assembleDate } cancelReason cancelSubReason moderatedReason moderatedSubReason moderated consignments { superExpressStatus returnedWarehouse { id address } } }"
}
```
(`__typename` fields stripped above for brevity -- the real query includes them on every object, standard Apollo/GraphQL codegen output; harmless to omit when building our own query.)

Key points for `listOrders`'s implementation:
- **`presetFilter`** is the status value, using the SAME tab codes as the sidebar nav links (see section 4 below) -- e.g. `"NEW"`, `"KASPI_DELIVERY_WAIT_FOR_COURIER"` (Передача), `"ARCHIVED"`, etc. Not a separate enum from the nav.
- Orders identified by **`code`**, not `id` -- use `code` as the order identifier everywhere (route params, waybill fetch, etc.).
- `customer` only has `firstName`/`lastName`, no phone/email in this query (phone appears in `advancedInput` as a *search* field, not as response data -- if a phone number is needed on the order list, it's not in this response).
- Pagination via `page`/`size` (confirmed `size: 10` in the real UI's default page size).
- No separate `merchantId` variable outside `merchantUid` -- matches `getMerchant`'s shape from the previous session.

Response body (this test account, "Новые" tab, genuinely empty):
```json
{"data":{"merchant":{"id":"30067228","orders":{"orders":{"total":0,"orders":[],"__typename":"OrdersPage"},"__typename":"Orders"},"__typename":"Merchant"}}}
```
**UPDATE 2026-08-13 (second capture, real seller account with real orders, merchant 425002):** a populated response was observed. Confirms the field shape above, plus one important correction:

- **`status` (the field on each `Order`) uses a DIFFERENT vocabulary than `presetFilter` (the query's status filter/the tab codes)**. A real order fetched via `presetFilter: "KASPI_DELIVERY_TRANSMITTED"` (Переданы на доставку tab) came back with `"status": "TRANSMITTED"`, not `"KASPI_DELIVERY_TRANSMITTED"`. Do not assume `order.status === presetFilter` -- the tab/filter codes (section 4's table) are a request-side concept only; the response's `status` field is a separate, shorter enum (`TRANSMITTED` observed so far, others unconfirmed). Any UI that displays or branches on `order.status` must not compare it against the tab codes.
- `creationTime`/`modificationTime` are ISO 8601 UTC strings with milliseconds (e.g. `2026-08-12T14:24:27.379Z`).
- `customer.lastName` in real data is already truncated to an initial by Kaspi itself (e.g. a surname rendered as a single letter) -- this is Kaspi's own privacy behavior in this API, not something we need to redact ourselves.
- `entries[].product`/`merchantProduct` carry real product identifiers (`code`, `name`) matching the same catalog `code`/`sku` space as `listCatalog`.
- `markers[]` is a real order-history/audit-log array (`APPROVED_BY_BANK`, `ACCEPTED_BY_MERCHANT`, `CARGO_ASSEMBLED`, courier handoff, etc., each with a timestamp and acting user) -- a richer timeline than currently modeled in `listOrders`'s trimmed `Order` type; a future enhancement, not needed for v1's read-only list.

## 3. Order status counts (CONFIRMED, bonus capture)

```
POST https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrderCounters
```
Request: `{"operationName":"getOrderCounters","variables":{"merchantUid":"30067228"},"query":"query getOrderCounters($merchantUid: String!) { merchant(id: $merchantUid) { orders { counts { tab count } } } }"}`

Response (this account, all zero):
```json
{"data":{"merchant":{"orders":{"counts":[
  {"tab":"NEW","count":0},{"tab":"KASPI_DELIVERY_WAIT_FOR_COURIER","count":0},
  {"tab":"KASPI_DELIVERY_WAIT_FOR_POINT_DELIVERY","count":0},{"tab":"KASPI_DELIVERY_RETURN_REQUEST","count":0},
  {"tab":"KASPI_DELIVERY_TRANSMITTED","count":0},{"tab":"PICKUP","count":0},
  {"tab":"KASPI_DELIVERY_CARGO_ASSEMBLY","count":0},{"tab":"SIGN_REQUIRED","count":0},
  {"tab":"DELIVERY","count":0}
]}}}}
```
Useful as a cheap "badge counts" call if the orders page ever wants per-tab counts without fetching each tab's full order list.

## 4. Real status tab → query value mapping (CONFIRMED, from the live sidebar nav)

Read directly off the real cabinet's own nav link URLs (`kaspi.kz/mc/#/orders?status={value}`):

| Tab label (RU) | `status`/`presetFilter` value |
|---|---|
| Новые | `NEW` |
| На подписании | `SIGN_REQUIRED` |
| Самовывоз | `PICKUP` |
| Моя доставка | `DELIVERY` |
| Предзаказ | `KASPI_DELIVERY_WAIT_FOR_POINT_DELIVERY` |
| Упаковка | `KASPI_DELIVERY_CARGO_ASSEMBLY` |
| Передача | `KASPI_DELIVERY_WAIT_FOR_COURIER` |
| Переданы на доставку | `KASPI_DELIVERY_TRANSMITTED` |
| Отменены при доставке | `KASPI_DELIVERY_RETURN_REQUEST` |
| Архив | `ARCHIVED` |

Возвраты (refunds) is a **separate** query family (`refunds?status=...`), not part of `getOrders` at all -- out of scope for this plan (orders only), but noted for future reference: `REFUND_NEW`, `ON_DELIVERY`, `WAITING_DECISION`, `DISPUTE`, `CLOSED`.

## 5. Waybill fetch — NOT CAPTURED, known gap

The test account (merchant 30067228) has **zero orders in every status**, confirmed via section 3's counters (`KASPI_DELIVERY_WAIT_FOR_COURIER` / Передача included, count `0`). There is no real order to open and no накладная action to trigger, so the waybill request/response shape was **not observed** this session, despite driving a real, fresh phone+SMS login specifically to attempt this capture.

**Implication for Task 3 (`fetchWaybillPdf`)**: implement against the plan's placeholder shape (`GET .../orders/{orderId}/waybill`-style guess), explicitly flagged as unconfirmed in the module's own comment, exactly as the plan's Task 3 Step 4 already anticipates. Confirm for real the first time a real order reaches "Передача" status on a connected seller's account -- either this test account eventually gets a real order, or a different seller connects and reaches that state first. Do not treat the placeholder as load-bearing until then.
