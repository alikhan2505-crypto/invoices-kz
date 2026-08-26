// «Добавить товар → Присоединиться к существующей карточке»: every endpoint
// and body here was captured live 2026-08-25 AND exercised for real (a
// product was added to merchant 30067228 during the capture session) -- see
// docs/superpowers/specs/2026-08-25-kaspi-add-product-api-findings.md.

const COMMON_HEADERS = {
  'x-auth-version': '3',
  'referer': 'https://kaspi.kz/',
  'origin': 'https://kaspi.kz',
}

export type CatalogSearchProduct = {
  id: string
  title: string
  categoryName: string | null
  imageUrl: string | null
  shopLink: string | null
}

// The only mc.shop.kaspi.kz endpoint observed passing the merchant via an
// x-merchant HEADER instead of a query param.
export async function searchCatalogProducts(
  sessionCookies: string,
  merchantId: string,
  text: string,
  fetchFn: typeof fetch = fetch
): Promise<{ products: CatalogSearchProduct[]; total: number; sessionExpired: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/product/view/mc/products?text=${encodeURIComponent(text)}`, {
    headers: { ...COMMON_HEADERS, 'x-merchant': merchantId, 'cookie': sessionCookies },
  })
  if (!res.ok) return { products: [], total: 0, sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  const items = Array.isArray(json?.products) ? json.products : []
  return {
    products: items.map((p: any) => ({
      id: String(p.id),
      title: p.title ?? '',
      categoryName: Array.isArray(p.categoryRu) && p.categoryRu.length > 0 ? p.categoryRu[p.categoryRu.length - 1] : null,
      imageUrl: p.previewImages?.[0]?.medium ?? null,
      shopLink: p.shopLink ?? null,
    })),
    total: Number(json?.total) || 0,
    sessionExpired: false,
  }
}

// Response body is the bare suffix ("465140475"), content-type json. The
// cabinet builds Артикул as `${masterProductCode}_${suffix}`. SKU is
// merchant-chosen, so a local fallback only has to be unique-ish.
export async function generateSkuSuffix(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  try {
    const res = await fetchFn(`https://mc.shop.kaspi.kz/content/pending/mc/product/${merchantId}/new-code`, {
      headers: { ...COMMON_HEADERS, 'cookie': sessionCookies },
    })
    if (res.ok) {
      const body = (await res.text()).trim().replace(/^"|"$/g, '')
      if (/^\d+$/.test(body)) return body
    }
  } catch {
    // fall through to the local fallback
  }
  return String(Date.now()).slice(-9)
}

export async function getLowestPrice(
  sessionCookies: string,
  productCode: string,
  fetchFn: typeof fetch = fetch
): Promise<number | null> {
  try {
    const res = await fetchFn(`https://mc.shop.kaspi.kz/offers/api/v1/price/lowest?s=${encodeURIComponent(productCode)}`, {
      headers: { ...COMMON_HEADERS, 'cookie': sessionCookies },
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    return typeof json?.price === 'number' ? json.price : null
  } catch {
    return null
  }
}

export type MerchantCityPoints = {
  cityId: string
  cityName: string
  points: { storeCode: string; displayName: string }[]
}

// bff/offer-view/points returns cities with merchant-prefixed point names
// ("30067228_PP2"); the bare store code is what every other pricefeed call
// takes, so it is stripped here once.
export async function getMerchantPoints(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ cities: MerchantCityPoints[]; sessionExpired: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/bff/offer-view/points?merchantUid=${encodeURIComponent(merchantId)}`, {
    headers: { ...COMMON_HEADERS, 'cookie': sessionCookies },
  })
  if (!res.ok) return { cities: [], sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  if (!Array.isArray(json)) return { cities: [], sessionExpired: false }
  return {
    cities: json.map((city: any) => ({
      cityId: String(city.id),
      cityName: city.name ?? '',
      points: (Array.isArray(city.pickupPoints) ? city.pickupPoints : [])
        .filter((p: any) => p.active !== false)
        .map((p: any) => {
          const raw = String(p.name ?? '')
          return {
            storeCode: raw.startsWith(`${merchantId}_`) ? raw.slice(merchantId.length + 1) : raw,
            displayName: p.displayName ?? raw,
          }
        }),
    })).filter(c => c.points.length > 0),
    sessionExpired: false,
  }
}

export type AddProductResult =
  | { success: true }
  | { success: false; reason: 'session_expired' | 'other'; message: string }

export type AddProductParams = {
  sessionCookies: string
  merchantId: string
  masterProductCode: string
  sku: string
  model: string
  cityPrices: { cityId: string; value: number }[]
  // Bare store codes; stockCount null = the cabinet's «Не указан» (field
  // omitted entirely from the payload -- never null, never 0).
  availabilities: { storeCode: string; stockCount: number | null }[]
}

// The cabinet's own «Сохранить изменения» sequence for a link-catalog add,
// captured in full: validate (LINK__TO_MASTER_CHOOSE) -> link-to-master ->
// single pricefeed process. The 2026-08-21 "stockCount removes offers"
// incident (see cabinetPricePush.ts) hit pushes to EXISTING offers; this add
// shape with stockCount is the cabinet's own and was exercised live twice
// (initial add with 5, standalone stock edit to 4) without a removal.
export async function addProductToExistingCard(
  params: AddProductParams,
  fetchFn: typeof fetch = fetch
): Promise<AddProductResult> {
  const headers = { ...COMMON_HEADERS, 'content-type': 'application/json', 'cookie': params.sessionCookies }

  try {
    const vRes = await fetchFn('https://mc.shop.kaspi.kz/offer-validation-api/merchant/offer/validate/v2', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'LINK__TO_MASTER_CHOOSE',
        merchantUid: params.merchantId,
        offers: [{ masterSku: params.masterProductCode }],
      }),
    })
    if (vRes.status === 401 || vRes.status === 403) {
      return { success: false, reason: 'session_expired', message: `HTTP ${vRes.status}` }
    }
    if (vRes.ok) {
      const vJson = await vRes.json().catch(() => null)
      if (vJson && vJson.valid === false) {
        return { success: false, reason: 'other', message: `валидация Kaspi: ${JSON.stringify(vJson.errorOffers ?? vJson).slice(0, 400)}` }
      }
    }

    const lRes = await fetchFn('https://mc.shop.kaspi.kz/content/pending/mc/product/link-to-master', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        merchantCode: params.merchantId,
        merchantProductCode: params.sku,
        masterProductCode: params.masterProductCode,
      }),
    })
    if (lRes.status === 401 || lRes.status === 403) {
      return { success: false, reason: 'session_expired', message: `HTTP ${lRes.status}` }
    }
    if (!lRes.ok) {
      const body = await lRes.text().catch(() => '')
      return { success: false, reason: 'other', message: `привязка к карточке: HTTP ${lRes.status}: ${body.slice(0, 300)}` }
    }

    const pRes = await fetchFn('https://mc.shop.kaspi.kz/pricefeed/upload/merchant/process', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cityPrices: params.cityPrices,
        availabilities: params.availabilities.map(a => ({
          available: 'yes',
          storeId: `${params.merchantId}_${a.storeCode}`,
          ...(a.stockCount !== null && Number.isFinite(a.stockCount) && a.stockCount > 0 ? { stockCount: a.stockCount } : {}),
        })),
        merchantUid: params.merchantId,
        sku: params.sku,
        model: params.model,
        brand: '',
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
