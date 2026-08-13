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

## Login step 2: OTP verification (CONFIRMED)

Two live attempts to catch this via `list_network_requests` after the fact both failed -- the cross-origin navigation from `idmc.shop.kaspi.kz` to `kaspi.kz/mc/#/...` on success resets the browser tool's network log before it can be read, and this isn't fixable by checking faster (the log is tied to the page/target lifecycle).

**What worked**: this app uses `XMLHttpRequest`, not `fetch` (confirmed by first trying a `window.fetch` monkey-patch, which caught nothing at all -- the app's HTTP calls never touched the overridden `fetch`). Patching `XMLHttpRequest.prototype.open`/`.send` instead, installed via the browser tool's script-evaluation capability *before* submitting the phone number, captured both steps by writing each request/response into `localStorage` (same-origin on `idmc.shop.kaspi.kz`) as soon as each XHR's `loadend` event fires -- synchronously ahead of the app's own success handler getting a chance to navigate away. Since `kaspi.kz` and `idmc.shop.kaspi.kz` are different origins, the captured data isn't readable from `kaspi.kz/mc` after the redirect, but navigating back to any `idmc.shop.kaspi.kz` page afterward and reading `localStorage` there recovers it intact.

Both steps turned out to be the **same endpoint**, correlated via the `MS_AUTH_SSO` cookie (rotated after step 1, sent automatically on step 2 since it's `HttpOnly` and same-origin):

```
POST https://idmc.shop.kaspi.kz/api/p/login
```

Step 1 (phone) request body: `{"_ph": "+7 (776) 355-51-77"}` → response `{"phone": "+7 (776) 355-51-77"}` (as already documented above).

Step 2 (OTP code) request body:
```json
{ "_c": "458801" }
```
Response body:
```json
{ "redirectUrl": "/" }
```
No separate password/PIN step exists for phone-based login -- phone + SMS code is the complete flow.

Three real SMS codes were spent across this session getting to this confirmed result (two lost to the navigation/log-reset problem, one spent proving the `fetch` patch didn't work before the `XMLHttpRequest` version succeeded on the fourth attempt) -- the account owner's active, repeated participation is the only reason this is fully documented now.

## Login step 3: `redirectUrl` to authenticated session (CONFIRMED, 2026-08-13, second live session)

The `2026-08-12` capture stopped at `{ "redirectUrl": "/" }` and assumed the frontend then just navigates to `https://kaspi.kz/mc/` directly. **That assumption was wrong** -- a reconstruction built on it (a single GET of `kaspi.kz/mc/` carrying all collected cookies) failed live twice (real SMS codes spent both times), always with the same result: Kaspi accepted the login, but `mc-session`/`mc-sid` never appeared.

The real mechanism, captured via `list_network_requests` right after landing on `kaspi.kz/mc/` in a real browser (its "Redirect chain" view on the final `GET kaspi.kz/mc/` request shows every hop): a full **OAuth2 Authorization Code + PKCE** flow between `mc.shop.kaspi.kz` (the relying party) and `idmc.shop.kaspi.kz` (the authorization server), using idmc's already-authenticated session for silent SSO (no re-prompt):

```
GET https://mc.shop.kaspi.kz/oauth2/authorization/1?redirectUrl=https%3A%2F%2Fkaspi.kz%2Fmc%2F        [302]
 -> GET https://idmc.shop.kaspi.kz/oauth2/authorize?response_type=code&client_id={clientId}
        &scope=openid&state={state}&redirect_uri=https://mc.shop.kaspi.kz/login/oauth2/code/1
        &nonce={nonce}&code_challenge={challenge}&code_challenge_method=S256                          [302]
    (idmc recognizes the caller as already logged in from step 1/2 above and
    silently issues an authorization code -- no login page shown)
 -> GET https://mc.shop.kaspi.kz/login/oauth2/code/1?code={code}&state={state}                        [302]
    (mc's backend exchanges the code for a token against idmc server-to-server
    -- invisible to the browser -- and THIS is the hop that sets mc-session/
    mc-sid via Set-Cookie; matches Spring Security's default OAuth2 login
    callback path shape, /login/oauth2/code/{registrationId})
 -> GET https://kaspi.kz/mc/                                                                          [now authenticated]
```

`client_id` observed live: `da68118c-9671-4cb5-8c9e-c08785ad204b` (may or may not be stable/reusable -- treat as informational, not hardcode-worthy, since the flow discovers it fresh via the redirect chain each time regardless).

Implication for `cabinetAuth.ts`: the redirect-chain walk must start at `https://mc.shop.kaspi.kz/oauth2/authorization/1?redirectUrl=https%3A%2F%2Fkaspi.kz%2Fmc%2F`, not at `kaspi.kz/mc/` directly -- starting at `kaspi.kz/mc/` never triggers this chain at all (it's a static SPA shell, not what redirects). Fixed 2026-08-13.

## Account state note (2026-08-12)

The test product used for the price-push capture (SKU `142489673_234696637`, "Дженга Настольная игра «Башня»", a real listing on the test account) was briefly, deliberately made active (price 50,000 ₸, stock 1) to observe the real save request, then immediately re-delisted via "Снять с продажи" (confirmed queued, "Будет снят с продажи до 23:09" — Kaspi's own delist action is not instant). Its price was left at 50,000 ₸ pending that delist completing; a follow-up correction back to its original 2,010 ₸ is a harmless cleanup task, not urgent, since the item is no longer purchasable once the delist takes effect.
