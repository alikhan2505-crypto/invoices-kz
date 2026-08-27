# Kaspi Shop: «Добавить товар → Создать новую карточку» (Phase 2) — Design

2026-08-27. Full generic scope approved by founder in-session. API ground
truth: `2026-08-25-kaspi-add-product-api-findings.md` §2 (Flow B), extended
with a real capture on 2026-08-27 (§2.5) — a genuine card («Сортер Набор
«Паста»», Без бренда, Развивающие игрушки) was created and sent to Kaspi
moderation during the capture, not a dry run.

## Why a generic form, not per-category hardcoding

Every Kaspi category has its own attribute set (toys have Age/Gender/Color,
wipes have Antibacterial, etc). Live-checking
`GET /content/pending/mc/category/{code}/info?merchantCode=…` confirms its
`classifications[]` shape is **structurally identical** to what the create
endpoint expects back — same groups (including two always-present, always-
empty generic slots `24*Harakteristiki` / `54*Harakteristiki`), same
per-feature shape (`name`, `attributeCode`, `mandatory`, `manufacturerSku`,
`attributeType:{code,multiValued}`), the only difference being `defaultValues`
(the schema's enum options) vs `values` (what the seller picked). So the
implementation is: fetch the schema once, render a form from it, and submit
the *same* structure back with `values` filled in. No per-category code.

## Flow

On `/kaspi-shop/removed`, a second button «+ Новая карточка» next to the
existing «+ Добавить товар» (Phase 1, join-card) opens a 4-step modal:

1. **Категория** — breadcrumb + list, lazy-loaded:
   `GET /product/classification/mc/category/all?m=…` (root) or
   `?c={code}&m=…` (children). Each row shows name + image (`image.
   formatToUrlMap.ORIGINAL` when present); `hasContentChild:true` rows drill
   deeper (push onto the breadcrumb), `hasContentChild:false` rows are the
   selectable leaf (Kaspi's own naming convention: leaf codes are prefixed
   `Master - `, not enforced client-side — `hasContentChild` is the only
   signal that matters). Rows with `closed:true` show a "категория
   ограничена" note and are not selectable (seen live: `restrictionType:
   "CLOSED"` on e.g. subscriptions).
2. **Бренд** — search-as-you-type against
   `GET /product/brands/mc/brand/find?c={categoryCode}&p=0&name={prefix}&s=20&m=…`
   (`{data:[{code,name,restricted,closed,personal}], total, pageCount}`).
   «Без бренда» is resolved dynamically (find the entry whose `name` is
   exactly "Без бренда" in the no-prefix result, rather than hardcoding its
   `code` — live-observed as `"china-toys"` for Educational toys, but that
   string is an unexplained legacy label, not something to bake in as a
   constant) and shown pinned as the first, pre-selected option. Restricted
   brands (`restricted:true`) are shown but disabled with a note.
3. **Фото** — single required photo (matches the cabinet's own "минимум 1
   фото" rule). Browser picks a file → our own
   `POST /api/kaspi-shop/products/new-card/photo` (multipart, proxied
   through our server since only the server holds the Kaspi session cookie)
   → server re-uploads to
   `POST https://mc.shop.kaspi.kz/image/processor/merchant/upl/cnt/mct/i`
   (multipart, field name `file`) → `{images:[{id,status,format,...}]}`.
   Non-`"OK"` status or a thrown error surfaces verbatim ("Kaspi отклонил
   фото: …"). The returned `id` becomes `images[0].location` in the create
   payload; the three CDN URLs are built client-side from the same id
   (`.../img/cnt/mct/i/{id}?format=gallery_large|gallery_medium|thumbnail`).
   Optional YouTube link field, plain text, passed through if present
   (not otherwise validated).
4. **Характеристики** — the generic form, rendered from
   `GET /content/pending/mc/category/{code}/info?merchantCode=…`:
   - `attributeType.code === 'enum'`, `multiValued:false` → single-select
     dropdown built from `defaultValues[].{code,name}`.
   - `enum`, `multiValued:true` → checkbox list, same options.
   - `string` → text input.
   - `number` → number input.
   - `mandatory:true` fields block submit (client-side) until non-empty,
     mirroring Kaspi's own inline "Это поле должно быть заполнено" — this is
     real, not decorative (live-confirmed: the Kaspi wizard blocks its own
     "Заполнить цену и остатки" button on an empty mandatory field).
   - Auto-generated Артикул (same `/content/pending/mc/product/{merchantId}/
     new-code` suffix generator already in `addProduct.ts`, reused as-is —
     the SKU/Vendor-code-suggestion mechanism is shared across both flows)
     shown read-only, editable if the seller wants a custom one.
   - Below the attribute fields: the auto-generated name is fetched (POST
     `.../product/name/generate`, see below) and shown read-only as a
     preview — Kaspi does not let the seller type a name directly in this
     step, it derives one from category+brand+attributes.
   - Same per-city price/stock block as Phase 1's join-flow (reused
     component/logic where practical) — leaving it fully empty is valid,
     matching the wizard's own "Если не указать цену и остатки, товар
     попадёт в 'Сняты с продажи', вы сможете заполнить их позже."
   - Submit → orchestrator (below) → success shows Kaspi's own copy:
     «Товар отправлен на проверку. Мы проверим ваш товар в течение 3 дней.»

## Server design

New module `src/lib/kaspiShop/addProductNewCard.ts` (kept separate from
`addProduct.ts`'s join-card flow — different Kaspi service family, different
lifecycle, no shared state beyond the SKU-suffix generator):

- `getCategoryChildren(cookies, merchantId, parentCode | null)` →
  `{ categories: [{code, name, hasChildren, closed, imageUrl}], sessionExpired }`
- `searchBrands(cookies, merchantId, categoryCode, prefix)` →
  `{ brands: [{code, name, restricted}], sessionExpired }`
- `getCategoryAttributeSchema(cookies, merchantCode, categoryCode)` →
  `{ classifications: [{code, name, features: [{name, attributeCode,
  mandatory, manufacturerSku, type, multiValued, options:[{code,name}]}]}],
  sessionExpired }` — this return shape doubles as the create-payload
  skeleton; only `values` needs filling in per feature.
- `uploadProductPhoto(cookies, fileBlob, filename)` → multipart POST →
  `{success, imageId, urls:{large,medium,small}} | {success:false,
  sessionExpired, message}`.
- `generateProductName(cookies, merchantId, brand, masterCategoryCode,
  productCode, features)` → POST `.../name/generate` → `string | null`
  (falls back to a plain concatenation of category name + brand if Kaspi's
  endpoint fails, so a name-generation hiccup never blocks the whole flow).
- `createNewProductCard(params)` — the real orchestrator:
  1. Build `classifications[]` by mapping the fetched schema + the seller's
     `Record<attributeCode, string[]>` selections (enum values resolved back
     to `{code,name}` pairs via the schema's own `options`, string/number
     passed through as-is).
  2. `POST /content/pending/mc/product/create?isMobileApp=false` with the
     exact captured payload shape (category, brand, images[0] from the
     upload step, `description:""`, `descriptionCreation:"PARTNER_WRITTEN"`,
     empty `videos/teasers/modifications/requestCodes`, `unitAmount:0`).
     Response is an array; `status !== "SUCCESS"` on the matching `code`
     entry is surfaced as the error (`errorReason` when present).
  3. `POST /pricefeed/upload/merchant/process` — full shape
     (`cityPrices`/`availabilities`) when the seller filled price/stock,
     the bare `{merchantUid, sku, model, brand}` shape (both keys omitted
     entirely, not sent empty) when they left it blank — both shapes
     live-confirmed 2026-08-27.
  Returns `{success} | {reason:'session_expired'|'other', message}`, same
  contract as `addProductToExistingCard`.

API routes (auth + `loadConnection` + `markSessionExpired`, matching every
other kaspi-shop route):

- `GET /api/kaspi-shop/products/new-card/categories?parent=` → children
- `GET /api/kaspi-shop/products/new-card/brands?category=&prefix=` → brands
- `GET /api/kaspi-shop/products/new-card/attribute-schema?category=` → schema
- `POST /api/kaspi-shop/products/new-card/photo` (multipart passthrough)
  → `{imageId, urls}`
- `POST /api/kaspi-shop/products/new-card/create` → body `{categoryCode,
  categoryName, brand:{code,name}, sku, attributes: Record<string,string[]>,
  imageId, imageUrls, youtubeLink?, entries?: [{cityId, price, points:[…]}]}`
  → orchestrator (schema is re-fetched server-side from `categoryCode`
  rather than trusted from the client, so a stale/tampered schema on the
  client can't corrupt the submitted attribute structure) → `{ok:true}`.

## Testing

Vitest on `addProductNewCard.ts` with injected fake `fetchFn`, mirroring
`addProduct.test.ts`'s style:
- category children map `hasContentChild`→`hasChildren`, `closed` passed
  through, image URL extracted from the nested `formatToUrlMap.ORIGINAL`.
- brand search maps `data[]`, «Без бренда» resolution picks the entry by
  exact name match (not position, not a hardcoded code).
- attribute schema maps all 4 classification groups verbatim including the
  two empty generic slots, `defaultValues`→`options`.
- photo upload sends multipart with field name `file`; non-`"OK"` status
  surfaces as a failure with the Kaspi-reported status in the message.
- create orchestrator: classifications built correctly from schema +
  selections (enum code→{code,name} lookup, string/number passthrough);
  full captured create payload asserted byte-for-byte for one representative
  category (Educational toys, the one genuinely captured); pricefeed call
  sends the bare shape when `entries` is omitted and the full shape when
  present; 401 anywhere → `session_expired`; non-`SUCCESS` create response
  → `other` with `errorReason` surfaced.

Typecheck + full kaspiShop test run + `next build` before commit, same gate
as every prior change in this session. No live smoke test by Claude
(invoices.kz login is founder-only); founder owes a click-through once
deployed, same as Phase 1 and Возвраты.
