# Kaspi Cabinet API — Live-Captured Request Shapes

Captured live 2026-08-12 against a real Kaspi Магазин seller account (ИП FIRST PROJECT, merchant id 30067228) with the account owner's active participation and explicit consent for the one real, reversible price-change test below.

## Price push (CONFIRMED — full detail)

This is the real endpoint the cabinet's own "Изменить цену и остатки" UI uses. It works from an already-authenticated session (cookies below) and is almost certainly the mechanism Northline/PriceFeed use for instant repricing, since it is a single-item, synchronous-feeling call (not the hourly XML feed).

```
POST https://mc.shop.kaspi.kz/pricefeed/upload/merchant/process
```

Headers:
```
x-auth-version: 3
referer: https://kaspi.kz/
origin: https://kaspi.kz
content-type: application/json
cookie: mc-session={session}; mc-sid={sid}; ... (analytics cookies, not required)
```

Request body:
```json
{
  "merchantUid": "{merchantId}",
  "availabilities": [
    { "available": "yes", "storeId": "{merchantId}_{pointCode}", "stockCount": {stockCount} }
  ],
  "cityPrices": [
    { "cityId": "{cityCode}", "value": {newPrice} }
  ],
  "sku": "{sku}",
  "model": "{productTitle}"
}
```

- `storeId` is `{merchantId}_{pointCode}` (observed: `30067228_PP1` — `PP1` is the seller's own pickup-point code, visible elsewhere in the cabinet as "Наличие в магазинах").
- `cityId` is a numeric Kaspi city/region code (observed: `710000000` for Astana) — matches the `allCityPrices` keys seen in the earlier `bff/offer-view/list` read (2026-08-11/12 trace, see project memory), confirming reads and writes use the same city-code space.
- `available: "yes"` with `stockCount > 0` lists the item for real sale. Setting `stockCount: 0` did NOT successfully delist via this same endpoint/flow in testing — the client blocked the save with a confirmation dialog ("Вы не указали остатки") that never actually fired the network request. Delisting instead requires the separate `available: "no"`-style action from the cabinet's "Снять с продажи" button (its own request shape not captured this session — the UI showed an async confirmation, "Будет снят с продажи до {time}", suggesting Kaspi's own delist action is queued/eventually-consistent, not instant).

Response (success):
```json
{ "id": "{jobId}" }
```
A job/tracking ID, not the updated resource — matches the `pricefeed/upload/...` path family (the same internal pipeline as bulk price-list processing, even for a single-item UI edit). No further polling of this ID was observed/tested this session.

**Rate limit interaction not directly observed**: only one real call was made (deliberately, to minimize real-account risk), so the 250-changes/30-min limit's exact response shape when exceeded (status code, body, headers) was NOT captured. Budget defensively (client-side tracking per Task 4) rather than relying on detecting the block reactively until this is confirmed.

## Login step 1: phone submission (CONFIRMED)

Captured live 2026-08-13, driven directly (not just observed) with the account owner supplying the phone number and, out of band, the SMS code:

```
POST https://idmc.shop.kaspi.kz/api/p/login
```

Headers: `content-type: application/json`, `origin`/`referer: https://idmc.shop.kaspi.kz...`, a pre-existing `MS_AUTH_SSO` cookie sent along (present from page load, before any submission).

Request body:
```json
{ "_ph": "+7 (776) 355-51-77" }
```
(the phone number, in the same human-formatted shape the input mask displays it in — not digits-only).

Response body:
```json
{ "phone": "+7 (776) 355-51-77" }
```
Response also sets a **new** `MS_AUTH_SSO` cookie (`Set-Cookie`, `HttpOnly; SameSite=Lax`) — this appears to be the flow-correlation token carried into the OTP step. After this call, the page swaps to an OTP-entry form ("Мы отправили сообщение с кодом на номер телефона ..., введите код из SMS") and a real SMS is sent.

## Login step 2: OTP verification (STILL NOT CAPTURED — same root cause, twice)

Two separate live attempts (each consuming a real SMS code on the account owner's phone) both failed to capture this request, for the identical reason: submitting the code makes the app immediately cross-origin-navigate from `idmc.shop.kaspi.kz` to `kaspi.kz/mc/#/...`, and the browser tool's network request log is reset by that navigation — by the time it's checked afterward (even on the very next tool call), the OTP-verify request is already gone. This isn't a timing mistake that can be fixed by checking faster; the log appears to be tied to the page/target lifecycle and the navigation happens synchronously with (or immediately after) the verify call resolving.

What IS re-confirmed both times: the flow genuinely only needs phone + SMS code (no separate password/PIN step for phone-based login), and successful verification lands on `kaspi.kz/mc` fully authenticated with `mc-session`/`mc-sid` cookies (matching the very first read-only trace from 2026-08-12).

**Untried for next attempt**: monkey-patch `window.fetch` via the browser tool's script-evaluation capability *before* submitting the code, so the wrapper captures the request/response into `localStorage` (same-origin, `idmc.shop.kaspi.kz`) synchronously as part of resolving the app's own fetch promise -- before the app's `.then()` handler gets control back to trigger navigation. Since `kaspi.kz` and `idmc.shop.kaspi.kz` are different origins, the captured data can't be read from `kaspi.kz/mc` after the redirect, but navigating back to any `idmc.shop.kaspi.kz` page afterward and reading `localStorage` there should recover it. Not yet tried because it needs a fresh SMS code to test, and two real codes were already spent this session on the approach that turned out not to work.

## Account state note (2026-08-12)

The test product used for the price-push capture (SKU `142489673_234696637`, "Дженга Настольная игра «Башня»", a real listing on the test account) was briefly, deliberately made active (price 50,000 ₸, stock 1) to observe the real save request, then immediately re-delisted via "Снять с продажи" (confirmed queued, "Будет снят с продажи до 23:09" — Kaspi's own delist action is not instant). Its price was left at 50,000 ₸ pending that delist completing; a follow-up correction back to its original 2,010 ₸ is a harmless cleanup task, not urgent, since the item is no longer purchasable once the delist takes effect.
