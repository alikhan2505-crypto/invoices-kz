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

## Login / OTP verification (NOT CAPTURED — still a gap)

Two live attempts this session both failed to capture the actual login POST to `idmc.shop.kaspi.kz`:

1. First attempt hit the wrong system entirely (`merchant.kaspi.kz`, a different Kaspi property — Kaspi Pay/acquiring, not the Kaspi Магазин seller cabinet) and triggered a real SMS to the account owner's phone before the mistake was caught.
2. Second attempt correctly loaded `idmc.shop.kaspi.kz/login`, but by the time network requests were checked, the login had already completed and the browser had cross-origin-navigated to `kaspi.kz/mc/#/...` — which appears to reset the captured network request log (login POST, any OTP step, and the resulting `Set-Cookie` response were all gone by the time they were inspected).

What IS confirmed: the resulting authenticated session uses cookies `mc-session` and `mc-sid` (both present on every subsequent `mc.shop.kaspi.kz` request, `mc-session` cookie value observed in the form `{timestamp}.{n}.{n}.{n}|{hex}`), plus a `x-auth-version: 3` request header on API calls. The login page itself (`idmc.shop.kaspi.kz/login`) has two tabs, "Телефон" and "Email", each a single-field form.

**For a future session**: capturing this needs tighter choreography than "ask the user to log in, then check requests afterward" — the cross-origin redirect happens too fast. Options to try next time: (a) ask the user to pause right after typing credentials but before submitting, so network capture can be armed first; (b) check if the browser tool's network log can be configured to persist across a cross-origin navigation within the same tab; (c) capture via a proxy/HAR export instead of the live request list if the tool supports it.

## Account state note (2026-08-12)

The test product used for the price-push capture (SKU `142489673_234696637`, "Дженга Настольная игра «Башня»", a real listing on the test account) was briefly, deliberately made active (price 50,000 ₸, stock 1) to observe the real save request, then immediately re-delisted via "Снять с продажи" (confirmed queued, "Будет снят с продажи до 23:09" — Kaspi's own delist action is not instant). Its price was left at 50,000 ₸ pending that delist completing; a follow-up correction back to its original 2,010 ₸ is a harmless cleanup task, not urgent, since the item is no longer purchasable once the delist takes effect.
