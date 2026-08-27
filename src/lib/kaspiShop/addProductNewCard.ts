// «Добавить товар → Создать новую карточку»: category tree -> brand -> photo
// -> dynamic attribute form -> create. Every endpoint here was captured live
// AND exercised for real 2026-08-27 (a genuine card, «Сортер Набор «Паста»»,
// was created on merchant 30067228 and sent to Kaspi moderation during the
// capture) -- see
// docs/superpowers/specs/2026-08-25-kaspi-add-product-api-findings.md §2.5
// and docs/superpowers/specs/2026-08-27-kaspi-add-product-phase2-design.md.

const COMMON_HEADERS = {
  'x-auth-version': '3',
  'referer': 'https://kaspi.kz/',
  'origin': 'https://kaspi.kz',
}

const NO_BRAND_NAME = 'Без бренда'

export type CategoryNode = {
  code: string
  name: string
  hasChildren: boolean
  closed: boolean
  imageUrl: string | null
}

export async function getCategoryChildren(
  sessionCookies: string,
  merchantId: string,
  parentCode: string | null,
  fetchFn: typeof fetch = fetch
): Promise<{ categories: CategoryNode[]; sessionExpired: boolean }> {
  const url = parentCode
    ? `https://mc.shop.kaspi.kz/product/classification/mc/category/all?c=${encodeURIComponent(parentCode)}&m=${encodeURIComponent(merchantId)}`
    : `https://mc.shop.kaspi.kz/product/classification/mc/category/all?m=${encodeURIComponent(merchantId)}`
  const res = await fetchFn(url, { headers: { ...COMMON_HEADERS, cookie: sessionCookies } })
  if (!res.ok) return { categories: [], sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  const items = Array.isArray(json) ? json : []
  return {
    categories: items.map((c: any) => ({
      code: c.code,
      name: c.name,
      hasChildren: !!c.hasContentChild,
      closed: !!c.closed,
      imageUrl: c.image?.formatToUrlMap?.ORIGINAL ?? null,
    })),
    sessionExpired: false,
  }
}

export type BrandOption = { code: string; name: string; restricted: boolean }

export async function searchBrands(
  sessionCookies: string,
  merchantId: string,
  categoryCode: string,
  prefix: string,
  fetchFn: typeof fetch = fetch
): Promise<{ brands: BrandOption[]; sessionExpired: boolean }> {
  const url = `https://mc.shop.kaspi.kz/product/brands/mc/brand/find?c=${encodeURIComponent(categoryCode)}&p=0&name=${encodeURIComponent(prefix)}&s=20&m=${encodeURIComponent(merchantId)}`
  const res = await fetchFn(url, { headers: { ...COMMON_HEADERS, cookie: sessionCookies } })
  if (!res.ok) return { brands: [], sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  const items = Array.isArray(json?.data) ? json.data : []
  return {
    brands: items.map((b: any) => ({ code: b.code, name: b.name, restricted: !!b.restricted })),
    sessionExpired: false,
  }
}

// «Без бренда»'s code is an unexplained legacy label ("china-toys" observed
// live for Educational toys) -- resolved by name, never hardcoded.
export function findNoBrandOption(brands: BrandOption[]): BrandOption | null {
  return brands.find(b => b.name === NO_BRAND_NAME) ?? null
}

export type AttributeOption = { code: string; name: string }

export type AttributeField = {
  name: string
  attributeCode: string
  mandatory: boolean
  manufacturerSku: boolean
  type: string
  multiValued: boolean
  options: AttributeOption[]
}

export type ClassificationGroup = { code: string; name: string; features: AttributeField[] }

export async function getCategoryAttributeSchema(
  sessionCookies: string,
  merchantCode: string,
  categoryCode: string,
  fetchFn: typeof fetch = fetch
): Promise<{ classifications: ClassificationGroup[]; sessionExpired: boolean }> {
  const url = `https://mc.shop.kaspi.kz/content/pending/mc/category/${encodeURIComponent(categoryCode)}/info?merchantCode=${encodeURIComponent(merchantCode)}`
  const res = await fetchFn(url, { headers: { ...COMMON_HEADERS, cookie: sessionCookies } })
  if (!res.ok) return { classifications: [], sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  const groups = Array.isArray(json?.classifications) ? json.classifications : []
  return {
    classifications: groups.map((g: any) => ({
      code: g.code,
      name: g.name,
      features: (Array.isArray(g.features) ? g.features : []).map((f: any) => ({
        name: f.name,
        attributeCode: f.attributeCode,
        mandatory: !!f.mandatory,
        manufacturerSku: !!f.manufacturerSku,
        type: f.attributeType?.code ?? 'string',
        multiValued: !!f.attributeType?.multiValued,
        options: Array.isArray(f.defaultValues) ? f.defaultValues.map((v: any) => ({ code: v.code, name: v.name })) : [],
      })),
    })),
    sessionExpired: false,
  }
}

export type PhotoUploadResult =
  | { success: true; imageId: string; urls: { large: string; medium: string; small: string } }
  | { success: false; sessionExpired: boolean; message: string }

function imageUrlsFor(id: string) {
  const base = `https://mc.shop.kaspi.kz/image/processor/merchant/img/cnt/mct/i/${id}`
  return { large: `${base}?format=gallery_large`, medium: `${base}?format=gallery_medium`, small: `${base}?format=thumbnail` }
}

export async function uploadProductPhoto(
  sessionCookies: string,
  file: Blob,
  filename: string,
  fetchFn: typeof fetch = fetch
): Promise<PhotoUploadResult> {
  const form = new FormData()
  form.append('file', file, filename)
  const res = await fetchFn('https://mc.shop.kaspi.kz/image/processor/merchant/upl/cnt/mct/i', {
    method: 'POST',
    // No content-type header here on purpose -- fetch derives the
    // multipart boundary from the FormData body itself; setting it manually
    // breaks the boundary.
    headers: { ...COMMON_HEADERS, cookie: sessionCookies },
    body: form,
  })
  if (res.status === 401 || res.status === 403) return { success: false, sessionExpired: true, message: `HTTP ${res.status}` }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { success: false, sessionExpired: false, message: `HTTP ${res.status}: ${body.slice(0, 300)}` }
  }
  const json = await res.json().catch(() => null)
  const img = json?.images?.[0]
  if (!img || img.status !== 'OK') {
    return { success: false, sessionExpired: false, message: img?.status ? `Kaspi отклонил фото: ${img.status}` : 'Неожиданный ответ Kaspi при загрузке фото' }
  }
  return { success: true, imageId: img.id, urls: imageUrlsFor(img.id) }
}

export type NewCardBrand = { code: string; name: string }

export async function generateProductName(
  sessionCookies: string,
  merchantId: string,
  brand: NewCardBrand,
  masterCategoryCode: string,
  productCode: string,
  features: { attributeCode: string; values: string[] }[],
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(`https://mc.shop.kaspi.kz/content/pending/mc/product/name/generate?merchantCode=${encodeURIComponent(merchantId)}`, {
      method: 'POST',
      headers: { ...COMMON_HEADERS, 'content-type': 'application/json', cookie: sessionCookies },
      body: JSON.stringify({
        brand: { code: brand.code, name: brand.name, restricted: false, closed: false, personal: false, blocked: false },
        masterCategoryCode,
        productCode,
        features,
      }),
    })
    if (!res.ok) return null
    const text = (await res.text()).trim().replace(/^"|"$/g, '')
    return text || null
  } catch {
    return null
  }
}

function buildClassificationsPayload(
  schema: ClassificationGroup[],
  selected: Record<string, string[]>
) {
  return schema.map(group => ({
    code: group.code,
    name: group.name,
    features: group.features.map(f => {
      const chosen = selected[f.attributeCode] ?? []
      const values = f.type === 'enum'
        ? chosen.map(code => {
            const opt = f.options.find(o => o.code === code)
            return { name: opt?.name ?? code, code }
          })
        : chosen
      return {
        name: f.name,
        attributeCode: f.attributeCode,
        mandatory: f.mandatory,
        manufacturerSku: f.manufacturerSku,
        attributeType: { code: f.type, multiValued: f.multiValued },
        values,
      }
    }),
  }))
}

export type CreateNewCardParams = {
  sessionCookies: string
  merchantId: string
  categoryCode: string
  categoryName: string
  brand: NewCardBrand
  sku: string
  name: string
  schema: ClassificationGroup[]
  selectedValues: Record<string, string[]>
  imageId: string
  imageUrls: { large: string; medium: string; small: string }
  youtubeLink?: string
  cityPrices?: { cityId: string; value: number }[]
  availabilities?: { storeCode: string; stockCount: number | null }[]
}

export type CreateNewCardResult =
  | { success: true }
  | { success: false; reason: 'session_expired' | 'other'; message: string }

// The cabinet's own submit sequence for a brand-new card, captured in full
// 2026-08-27: create -> pricefeed process (name/generate happens before
// this call, its own function above, so a name-generation hiccup doesn't
// block the create call from using a founder-typed fallback name).
export async function createNewProductCard(
  params: CreateNewCardParams,
  fetchFn: typeof fetch = fetch
): Promise<CreateNewCardResult> {
  const headers = { ...COMMON_HEADERS, 'content-type': 'application/json', cookie: params.sessionCookies }

  try {
    const classifications = buildClassificationsPayload(params.schema, params.selectedValues)
    const cRes = await fetchFn(`https://mc.shop.kaspi.kz/content/pending/mc/product/create?isMobileApp=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        classifications,
        requestInfoList: [],
        code: params.sku,
        merchantCode: params.merchantId,
        name: params.name,
        displayName: params.name,
        description: '',
        descriptionCreation: 'PARTNER_WRITTEN',
        category: {
          code: params.categoryCode,
          name: params.categoryName,
          restricted: false,
          closed: false,
          blocked: false,
          image: '',
          hasContentChild: false,
        },
        brand: { code: params.brand.code, name: params.brand.name, restricted: false, closed: false, personal: false, blocked: false },
        images: [{
          large: params.imageUrls.large,
          medium: params.imageUrls.medium,
          small: params.imageUrls.small,
          width: 0,
          height: 0,
          location: params.imageId,
          bucketName: 'temp-merchant-product-images',
          generatedByAI: false,
          visualType: '',
        }],
        videos: [],
        teasers: [],
        shopLink: '',
        videoId: params.youtubeLink ?? '',
        unitAmount: 0,
        moderationDeadline: '',
        modifications: [],
        createdFromMaster: false,
        requestCodes: [],
      }),
    })
    if (cRes.status === 401 || cRes.status === 403) {
      return { success: false, reason: 'session_expired', message: `HTTP ${cRes.status}` }
    }
    if (!cRes.ok) {
      const body = await cRes.text().catch(() => '')
      return { success: false, reason: 'other', message: `создание карточки: HTTP ${cRes.status}: ${body.slice(0, 300)}` }
    }
    const cJson = await cRes.json().catch(() => null)
    const entry = Array.isArray(cJson) ? cJson.find((r: any) => r.code === params.sku) ?? cJson[0] : null
    if (!entry || entry.status !== 'SUCCESS') {
      return { success: false, reason: 'other', message: `Kaspi отклонил карточку: ${entry?.errorReason ?? entry?.status ?? 'неизвестная ошибка'}` }
    }

    const pRes = await fetchFn('https://mc.shop.kaspi.kz/pricefeed/upload/merchant/process', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(params.cityPrices && params.cityPrices.length > 0 ? { cityPrices: params.cityPrices } : {}),
        ...(params.availabilities && params.availabilities.length > 0 ? {
          availabilities: params.availabilities.map(a => ({
            available: 'yes',
            storeId: `${params.merchantId}_${a.storeCode}`,
            ...(a.stockCount !== null && Number.isFinite(a.stockCount) && a.stockCount > 0 ? { stockCount: a.stockCount } : {}),
          })),
        } : {}),
        merchantUid: params.merchantId,
        sku: params.sku,
        model: params.name,
        brand: params.brand.code,
      }),
    })
    if (pRes.status === 401 || pRes.status === 403) {
      return { success: false, reason: 'session_expired', message: `HTTP ${pRes.status}` }
    }
    if (!pRes.ok) {
      const body = await pRes.text().catch(() => '')
      return { success: false, reason: 'other', message: `цена и остатки: HTTP ${pRes.status}: ${body.slice(0, 300)}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, reason: 'other', message: `network error: ${err.message}` }
  }
}
