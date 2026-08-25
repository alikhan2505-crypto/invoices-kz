# Kaspi Add-Product API — Live-Captured Request Shapes

Captured live 2026-08-25 on merchant **30067228** (ИП FIRST PROJECT) via a real
phone+SMS login in a Chrome DevTools MCP session. Every endpoint below was
observed for real (request AND response), except where explicitly marked
unconfirmed. During the capture a real product was added and is now live:
«Влажные полотенца Sunlight Baby Fish 70 шт», SKU `165601653_465140475`,
1 200 ₸, 4 шт on PP2 (Шымкент).

Common headers for every `mc.shop.kaspi.kz` call (same as the rest of
`src/lib/kaspiShop/*`): `x-auth-version: 3`, session `cookie`
(`mc-session` + `mc-sid`), `origin: https://kaspi.kz`, `referer: https://kaspi.kz/`.
The catalog search also sends `x-merchant: <merchantId>` — the only endpoint
seen using a header instead of a query param for merchant scoping.

## 1. Flow A — «Присоединиться к существующей карточке» (join existing card)

Cabinet route: `/mc/#/add-product/v2` → search → «Выбрать» →
`/mc/#/add-product/v2/link-catalog?code={productCode}` → «Продолжить» →
«Цена и остатки» → «Сохранить изменения».

### 1.1 Catalog search
```
GET https://mc.shop.kaspi.kz/product/view/mc/products?text=baby%20fish
Headers: x-merchant: 30067228 (+ common)
→ 200 {"products":[{ "id":"133163990", "title":"...", "categoryId":"03215",
      "previewImages":[{small,medium,large}], "shopLink":"/p/...-133163990/?c=750000000",
      "hasVariants":false, "category":[...ru path...], "categoryRu":[...],
      "categoryCodes":["Wipes","Home paper products",...] }...],
   "pageSize":12, "total":260468}
```
Pagination param not directly observed (page 1 only); the UI shows
`total/pageSize` pages. Probe `&p=1`-style params when implementing — or slice
client-side, first page is enough for a search-and-pick UX.

### 1.2 On «Выбрать» (link-catalog screen load)
```
GET  /content/item/api/v1/item/{productCode}                      → card info
GET  /content/item/api/v1/configurator/{productCode}              → 404 when no variants (hasVariants:false)
POST /offer-validation-api/merchant/offer/validate/v2
     {"action":"LINK__TO_MASTER_CHOOSE","merchantUid":"30067228",
      "offers":[{"masterSku":"165601653"}]}
     → {"merchantUid":"30067228","valid":true,"errorOffers":null}
GET  /content/pending/mc/product/{merchantId}/new-code            → SKU suffix generator
     (UI builds Артикул as "{productCode}_{new-code}")
GET  /offers/api/v1/price/lowest?s={productCode}                  → «Самая низкая цена» hint
GET  /bff/offer-view/points?merchantUid={merchantId}              → pickup points w/ cities
GET  /product/stock/mc/obligated-merchant/check?m={merchantId}
```

### 1.3 Final submit («Сохранить изменения») — 3 calls in order
```
1) POST /offer-validation-api/merchant/offer/validate/v2          (again, full offer)
2) POST /content/pending/mc/product/link-to-master
      {"merchantCode":"30067228",
       "merchantProductCode":"165601653_465140475",
       "masterProductCode":"165601653"}
      → 200, empty body
3) POST /pricefeed/upload/merchant/process
      {"cityPrices":[{"cityId":"511010000","value":1200}],
       "availabilities":[{"available":"yes","storeId":"30067228_PP2","stockCount":5}],
       "merchantUid":"30067228","sku":"165601653_465140475",
       "model":"Влажные полотенца Sunlight Baby Fish 70 шт","brand":""}
      → 200 {"id":"6a8dc59b8a65bb037355fa6c"}   (async process id)
```
Then the UI polls `POST /pricefeed/protocol/merchant/offer/list/s` and shows
«Ваш товар успешно добавлен. Он будет выставлен на продажу до 21:55». The
offer appears in Управление товарами within ~минуты.

**Confirmed edit path:** re-POSTing `/pricefeed/upload/merchant/process` with
the same sku and new `stockCount` (5→4) worked standalone (bare cookies +
x-auth-version, no prior validate/link calls) — same endpoint the repricer's
`cabinetPricePush.ts` already uses for price pushes. cityId 511010000 =
Шымкент; storeId = `{merchantId}_{pointCode}`.

## 2. Flow B — «Добавить новую карточку товара» (new card, 4 steps)

Cabinet route: `/mc/#/add-product/v2/new`. Steps: 1 категория → 2 бренд →
3 фото → 4 характеристики → «Заполнить цену и остатки» → submit to moderation.

### 2.1 Шаг 1 — category tree (lazy)
```
GET /product/classification/mc/category/all?m={merchantId}           → root
GET /product/classification/mc/category/all?c={categoryCode}&m=...   → children (e.g. c=Home, c=Household goods)
GET /product/classification/mc/category/path?categoryCode=Master%20-%20Wipes&m=...
```

### 2.2 Шаг 2 — brand
```
GET /content/pending/mc/category/formula?categoryCode=Master - Wipes&merchantCode=...
    (название-formula: «Серия/название, Тип, Бренд, Количество в упаковке»)
GET /product/request/mc/brand/list?_m=...&categoryCode=Master+-+Wipes&prefix=
GET /product/brands/mc/brand/find?c=Master - Wipes&p=0&name=&s=20&m=...
```
Brand dropdown supports «Без бренда», «Добавить бренд», flags «Персональный
бренд» / «Бренд ограничен».

### 2.3 Шаг 3 — photo upload
```
POST /image/processor/merchant/upl/cnt/mct/i
     multipart/form-data, part name "file", accept image/*, multiple
     → {"images":[{"id":"<uuid>","url":"/cnt/mct/i/<uuid>","partName":"file",
        "submittedFileName":"...","status":"OK","format":"JPEG",
        "documentValidationResult":null}]}
GET  /image/processor/merchant/api/status/cnt/mct/i/{uuid}            → processing poll
```
Optional YouTube link field (plain text).

### 2.4 Шаг 4 — attributes schema
```
GET /content/pending/mc/category/{categoryCode}/info?merchantCode=...
    → {"code","name","nameLp",{...},"classifications":[
        {"code":"Wipes*Harakteristiki","name":"Характеристики","features":[
          {"name":"Тип","attributeCode":"Wipes*Type","mandatory":true,
           "important":true,"attributeType":{"code":"enum","multiValued":false},
           "defaultValues":[{code,name,nameLp}...] } ... ]}]}
GET /product/request/mc/attribute-value/list?m={merchantId}
GET /content/pending/mc/product/{merchantId}/new-code                 → auto-Артикул
```
Form fields seen for Wipes: Тип (enum, mandatory), Количество в упаковке,
Назначение (enum), Антибактериальные (boolean radio); optional: Особенности,
Состав, Дополнительно, Вес для логистики, Описание (≤7000 chars).

### 2.5 NOT captured (deliberately)
The **final create-card POST** (after «Заполнить цену и остатки») was not
fired — submitting would have sent a junk «Без бренда» card to Kaspi's human
moderation on the real account. Wizard was exited via its «Выйти без
сохранения?» dialog. Likely a `POST` under `/content/pending/mc/product/...`
(same service as link-to-master and new-code). Capture it the first time a
real new card is genuinely needed.

## 3. Управление товарами page (`/mc/#/products`) — full function survey

- List: `GET /bff/offer-view/list?m={merchantId}&p=0&l=10&a=true`
  (`a=true` = В продаже; the app's removed-products route already uses this
  family for Сняты с продажи). Counts: `GET /offers/api/v1/offer/count?m=...`
- Search box «Артикул/Товар», Фильтр «В продаже (n)» / «Сняты с продажи (n)»,
  category filter: `GET /offers/api/v1/offer/merchant-categories/search?m=...&q=&p=0&l=ru&s=10`
- Tabs: Все товары / Мало остатков / Без остатков (list param variants unprobed)
- «Действия с файлами»: `GET /offers/api/v1/offer/export/types?m=...&available=ACTIVE`
  + `/offer/export/status?...` (async XLSX export)
- Per-product ⋮ menu: «Изменить цену и остатки», «Снять с продажи»,
  «Редактировать карточку товара», «Объединить варианты товара (NEW)»
- «Добавить товар» → flows above. Bulk «Снять с продажи» via row checkboxes.

## 4. Misc observed

- Price-list upload config: `POST /pricefeed/upload/merchant/upload/configuration?merchantUid=...`
  (fires on cabinet load; the «Загрузить прайс-лист»/«История загрузок» pages
  reuse the pricefeed upload/protocol service seen above).
- Upload history/protocol: `POST /pricefeed/protocol/merchant/offer/list/s`.
- Merchant switching is session-side (the ID dropdown in the header);
  after switching, all endpoints take the new merchantId explicitly.
