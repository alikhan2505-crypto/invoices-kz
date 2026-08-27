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

### 2.5 Шаг 4 → submit — captured live 2026-08-27 (real card, real moderation)

Captured for real on merchant **30067228** while adding a genuine product:
«Сортер Набор «Паста»» (children's sorting toy, Без бренда, category
Детские товары → Игрушки → Развивающие игрушки). Photo was a placeholder
(swapped for the real photo by the founder afterward in the cabinet); all
other fields are real. Result: `status: "SUCCESS"`, card shown to the user as
«Товар отправлен на проверку. Мы проверим ваш товар в течение 3 дней.» — a
genuine pending-moderation card, not a dry run.

**Attribute schema for this category** (`Master - Educational toys`), same
shape as the Wipes schema in 2.4 — `attributeCode` values differ per
category but the wrapper (`code`/`name`/`features[]`, each feature carrying
`name`, `attributeCode`, `mandatory`, `attributeType: {code, multiValued}`,
`values`) is identical:

```
Educational toys*Type              (enum, single)   — mandatory  e.g. "сортер"
Educational toys*Educational function (enum, multi) — mandatory  e.g. "логика и мышление"
Educational toys*Size              (string)         — mandatory  e.g. "20x15x8"
Educational toys*Vendor code       (string)         — mandatory  "Артикул производителя (указан на коробке, пример: WT007)"
Educational toys*Model             (string)         — mandatory, manufacturerSku:true, "Тема\модель"
Educational toys*Number of elements(number)         — optional
Educational toys*Character         (enum, single)   — optional
Educational toys*Features          (string)         — optional
Toys*Age                           (enum, multi)    — mandatory  e.g. "с 18 месяцев"
Toys*Gender                        (enum, single)   — mandatory  "мальчик"/"девочка"/"универсальный"
Toys*Color                         (enum, multi)    — mandatory  e.g. ["желтый","зеленый"]
Toys*Material                      (enum, multi)    — mandatory  e.g. "пластик"
```
Note the two-namespace split: category-specific attrs live under
`Educational toys*...`, cross-category "Toys" attrs (age/gender/color/
material) live under `Toys*...` — both appear as separate `classifications[]`
entries in the create payload (see below). Expect an analogous split for
other categories (e.g. `Wipes*...` + some shared parent namespace).

**Client-side validation is real and blocking**: leaving `Vendor code`
(Артикул производителя) empty shows an inline error "Это поле должно быть
заполнено" and blocks progression — confirmed live, this field is not
optional despite having no natural placeholder value for a no-name-brand
product (real box code is required for a real submission; a stand-in value
can be corrected in the cabinet after creation, same as the photo).

**Auto-generate display name** (called right before create, uses the
already-filled attributes):
```
POST /content/pending/mc/product/name/generate?merchantCode={merchantId}
     {"brand":{"code":"china-toys","name":"Без бренда","restricted":false,
       "closed":false,"personal":false,"blocked":false},
      "masterCategoryCode":"Master - Educational toys",
      "productCode":"{sku}",
      "features":[{"attributeCode":"Educational toys*Type","values":["сортер"]},
        {"attributeCode":"Educational toys*Educational function","values":["логика и мышление"]},
        {"attributeCode":"Educational toys*Size","values":["20x15x8"]},
        {"attributeCode":"Educational toys*Vendor code","values":["{sku}"]},
        {"attributeCode":"Educational toys*Model","values":[""]},
        {"attributeCode":"Educational toys*Number of elements","values":[]},
        {"attributeCode":"Educational toys*Character","values":[]},
        {"attributeCode":"Educational toys*Features","values":[""]},
        {"attributeCode":"Toys*Age","values":["с 18 месяцев"]},
        {"attributeCode":"Toys*Gender","values":["универсальный"]},
        {"attributeCode":"Toys*Color","values":["желтый","зеленый"]},
        {"attributeCode":"Toys*Material","values":["пластик"]}]}
     → 200, response body is a plain string: "Сортер пластик"
```
Brand code for «Без бренда» is the literal string `"china-toys"` (not e.g.
`"no-brand"` — worth hardcoding a constant with a comment, it's not
guessable). `productCode` here is Kaspi's own auto-suggested SKU
(`/content/pending/mc/product/{merchantId}/new-code` from step 2.4), used
verbatim as the merchant's article number unless the seller overrides it.

**Final create call:**
```
POST /content/pending/mc/product/create?isMobileApp=false
     {"classifications":[
        {"code":"Educational toys*General","name":"Характеристики","features":[
           {"name":"Тип","attributeCode":"Educational toys*Type","mandatory":true,
            "manufacturerSku":false,"attributeType":{"code":"enum","multiValued":false},
            "values":[{"name":"сортер","code":"сортер"}]},
           ... one entry per feature, `values` as [{name,code}] for enums or
           plain scalars/[] for string/number types, `manufacturerSku:true`
           flag preserved on Model ...
        ]},
        {"code":"Toys*Dopolnitelno","name":"Дополнительно","features":[
           ... Age/Gender/Color/Material, same shape ...
        ]},
        {"code":"24*Harakteristiki","name":"Глобальные характеристики","features":[]},
        {"code":"54*Harakteristiki","name":"Характеристики","features":[]}
      ],
      "requestInfoList":[],
      "code":"{sku}","merchantCode":"{merchantId}",
      "name":"{generated name}","displayName":"{generated name}",
      "description":"","descriptionCreation":"PARTNER_WRITTEN",
      "category":{"code":"Master - Educational toys","name":"Развивающие игрушки",
        "restricted":false,"closed":false,"blocked":false,"image":"",
        "hasContentChild":false},
      "brand":{"code":"china-toys","name":"Без бренда","restricted":false,
        "closed":false,"personal":false,"blocked":false},
      "images":[{"large":".../format=gallery_large","medium":".../format=gallery_medium",
        "small":".../format=thumbnail","width":0,"height":0,
        "location":"{image uuid from upload}","bucketName":"temp-merchant-product-images",
        "generatedByAI":false,"visualType":""}],
      "videos":[],"teasers":[],"shopLink":"","videoId":"","unitAmount":0,
      "moderationDeadline":"","modifications":[],"createdFromMaster":false,
      "requestCodes":[]}
     → 200 [{"code":"{sku}","name":"{generated name}","status":"SUCCESS","errorReason":null}]
```
The two always-empty trailing `classifications[]` entries
(`24*Harakteristiki`, `54*Harakteristiki`) appeared with empty `features:[]`
even for this category — likely generic/global classification slots Kaspi
attaches to every product regardless of category; safe to always include
verbatim/empty unless a future capture shows them populated.

**Price/stock registration** (fires immediately after create, even when the
seller leaves price/stock blank in the wizard's last panel — "Если не
указать цену и остатки, товар попадёт в 'Сняты с продажи', вы сможете
заполнить их позже"):
```
POST /pricefeed/upload/merchant/process
     {"merchantUid":"{merchantId}","sku":"{sku}","model":"{generated name}",
      "brand":"china-toys"}
     → 200 {"id":"<async process id>"}
```
This is the SKU-registration-only shape (no `cityPrices`/`availabilities`)
— compare to Flow A §1.3 call 3, which includes those keys when price/stock
were actually filled in. Confirms `cityPrices`/`availabilities` are
optional keys on this same endpoint, omitted entirely rather than sent
empty when skipped.

**Photo upload → create is one continuous flow**: the uploaded image's
`location` (the upload response's `images[].id`) is threaded directly into
the create payload's `images[0].location` and into the three CDN URLs
(`gallery_large`/`gallery_medium`/`thumbnail`, same `mc.shop.kaspi.kz/image/
processor/merchant/img/cnt/mct/i/{id}` path, differing only in `?format=`).
No separate "attach photo to draft" call — the create POST is what actually
associates them.

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
