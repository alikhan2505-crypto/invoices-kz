# Kaspi Shop: «Добавить товар» — Design

2026-08-25. Approved by founder in-session (scope question + design summary).
API ground truth: `2026-08-25-kaspi-add-product-api-findings.md` — every
Phase-1 endpoint below was captured live AND exercised for real (a product was
added to merchant 30067228 during the capture and is live).

## Problem

The app's «Управление товарами» page (/kaspi-shop/removed) can remove/restore
offers and edit price/stock, but there is no way to ADD a product — neither by
joining an existing Kaspi catalog card nor by creating a new card. Sellers
must go back to the Kaspi cabinet for the most routine operation of all.

## Scope

- **Phase 1 (this spec, build now): join an existing catalog card** — the
  cabinet's «Присоединиться к существующей карточке товара» flow.
- **Phase 2 (separate pass): create a new card** — category tree → brand →
  photos → attributes → moderation. All schema endpoints are captured; the
  final create POST is NOT (deliberately — a junk submission would hit real
  moderation). Capture it the first time a real card is created, then build.
- **Out of scope:** template/XLSX bulk upload; «Объединить варианты товара».

## Phase 1 UX

On /kaspi-shop/removed, next to the tab pills: a «Добавить товар» button
(accent pill, same look as «Вернуть в продажу»). Opens a modal wizard in the
page's existing modal style (like «Цена и остатки»):

1. **Поиск**: input + debounced search against the Kaspi catalog. Result rows:
   image, title, product code, category, «Выбрать». First page (12 items) is
   enough; a «Показать ещё» is NOT built (search refinement beats paging here).
2. **Цена и остатки**: selected card summary (image, title, auto-generated
   артикул shown read-only), then per-city blocks exactly like the cabinet:
   for each city with points — price input (with «Самая низкая цена N ₸» hint
   when available) and stock input per point (optional, placeholder
   «Не указан»). Cities left fully empty are simply not submitted.
   «Добавить товар» submit button.
3. Success state: «Товар отправлен — Kaspi выставит его на продажу в течение
   часа» (mirrors the cabinet's own async behavior), auto-close + reload list.

Errors surface verbatim in the modal (session expired → the standard
«переподключите магазин» message used elsewhere on the page).

## Server design

New module `src/lib/kaspiShop/addProduct.ts` (all functions take an optional
`fetchFn` for tests, same pattern as `pendingProducts.ts`):

- `searchCatalogProducts(cookies, merchantId, text)` →
  `GET /product/view/mc/products?text=…` with `x-merchant` header. Maps to
  `{ id, title, categoryName (last of categoryRu), imageUrl
  (previewImages[0].medium), shopLink }` + `total`.
- `generateSkuSuffix(cookies, merchantId)` →
  `GET /content/pending/mc/product/{m}/new-code` (bare numeric body).
  Fallback on failure: `Date.now()`-based 9 digits — SKU is merchant-chosen,
  uniqueness is what matters.
- `getLowestPrice(cookies, productCode)` → `{"price":1200.0}` → number|null.
- `getMerchantPoints(cookies, merchantId)` → `GET /bff/offer-view/points` →
  `[{ cityId, cityName, points: [{ storeCode (bare, e.g. "PP2"),
  displayName }] }]` (active points only).
- `addProductToExistingCard({ cookies, merchantId, masterProductCode, sku,
  model, cityPrices, availabilities })` — the captured 3-call sequence:
  1. `POST validate/v2` `{action:"LINK__TO_MASTER_CHOOSE", merchantUid,
     offers:[{masterSku}]}` — explicit `valid:false` is fatal (surfaced
     verbatim), any other validation hiccup is non-fatal (same policy as
     `pushOfferState`).
  2. `POST /content/pending/mc/product/link-to-master`
     `{merchantCode, merchantProductCode, masterProductCode}` — must be 2xx.
  3. `POST /pricefeed/upload/merchant/process` with the EXACT captured add
     shape: `{cityPrices:[{cityId,value}…], availabilities:[{available:"yes",
     storeId:"{merchantId}_{storeCode}", stockCount?}…], merchantUid, sku,
     model, brand:""}` — `stockCount` present only when the user entered a
     positive number (the cabinet's own add sent it; the 2026-08-21
     stockCount danger note in `cabinetPricePush.ts` was about pushes to
     EXISTING offers via a different shape — the add flow shape here is the
     cabinet's own, exercised live today).
  Returns the usual `{success} | {reason:'session_expired'|'other'}` shape.

API routes (auth + `loadConnection` + `markSessionExpired` per the
removed-products route pattern):

- `GET /api/kaspi-shop/products/search?text=…` → `{ products, total }`
- `GET /api/kaspi-shop/products/add-info?code=…` → `{ suggestedSku
  ("{code}_{suffix}"), lowestPrice, cities }` (one round trip for step 2)
- `POST /api/kaspi-shop/products/add` → body `{ masterProductCode, sku,
  model, entries: [{ cityId, price, points: [{ storeCode, stockCount|null
  }] }] }` → orchestrator → `{ ok: true }`

No DB writes in Phase 1: the offer lands in Kaspi and shows up through the
existing catalog listing; connecting it to the repricer stays the existing
«Вернуть в продажу»-style import path / demping page flow.

## Testing

Vitest on `addProduct.ts` with injected fake `fetchFn`:
- search maps fields and sends the `x-merchant` header;
- orchestrator calls validate → link → process in order with the exact
  captured bodies (prefixed storeId, `stockCount` omitted when null,
  `brand:""`);
- explicit `valid:false` aborts before link-to-master;
- 401 anywhere → `session_expired`; link-to-master non-2xx → error.

Typecheck + full waybills/addProduct test run before commit; live smoke test
by the founder on invoices.kz after deploy.
