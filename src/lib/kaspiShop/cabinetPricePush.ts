// Endpoint and payload shape captured live 2026-08-12 against a real Kaspi
// Магазин seller account (see docs/superpowers/specs/2026-08-12-kaspi-
// cabinet-api-findings.md) -- this is what the cabinet's own "Изменить цену
// и остатки" UI calls. Response is an async job id, not the updated
// resource; no polling of that id has been tested.
const PRICE_PUSH_URL = 'https://mc.shop.kaspi.kz/pricefeed/upload/merchant/process'

export type PricePushResult =
  | { success: true }
  | { success: false; reason: 'session_expired'; message: string }
  | { success: false; reason: 'other'; message: string }

export async function pushPriceChange(params: {
  sessionCookies: string
  merchantUid: string
  sku: string
  model: string
  storeId: string
  stockCount: number
  cityCode: string
  newPrice: number
}): Promise<PricePushResult> {
  let res: Response
  try {
    res = await fetch(PRICE_PUSH_URL, {
      method: 'POST',
      headers: {
        'x-auth-version': '3',
        'referer': 'https://kaspi.kz/',
        'origin': 'https://kaspi.kz',
        'content-type': 'application/json',
        'cookie': params.sessionCookies,
      },
      body: JSON.stringify({
        merchantUid: params.merchantUid,
        availabilities: [
          { available: 'yes', storeId: params.storeId, stockCount: params.stockCount },
        ],
        cityPrices: [
          { cityId: params.cityCode, value: params.newPrice },
        ],
        sku: params.sku,
        model: params.model,
      }),
    })
  } catch (err: any) {
    return { success: false, reason: 'other', message: `network error: ${err.message}` }
  }

  if (res.status === 401 || res.status === 403) {
    return { success: false, reason: 'session_expired', message: `HTTP ${res.status}` }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { success: false, reason: 'other', message: `HTTP ${res.status}: ${body.slice(0, 300)}` }
  }

  return { success: true }
}

// Returns a removed-from-sale (available=false) offer to sale. Captured live
// 2026-08-21 from the cabinet's own "Выставить на продажу" flow (founder's
// DevTools screenshots): the cabinet validates via
// offer-validation-api/.../validate/v2 (action ON_SALE__BATCH, returned
// valid:true) and then uploads MANUAL_CHANGES through the same
// pricefeed/upload pipeline as pushPriceChange above -- an offer row with
// availabilities available:"yes" (stockCount null in the captured state) and
// the offer's city prices. We reuse the single-item process endpoint whose
// payload shape has been confirmed since 2026-08-12, rather than the batch
// variant whose full item shape wasn't fully expanded in the capture.
export async function restoreOfferToSale(params: {
  sessionCookies: string
  merchantUid: string
  sku: string
  model: string
  storeId: string
  cityPrices: { cityId: string; value: number }[]
}): Promise<PricePushResult> {
  let res: Response
  try {
    res = await fetch(PRICE_PUSH_URL, {
      method: 'POST',
      headers: {
        'x-auth-version': '3',
        'referer': 'https://kaspi.kz/',
        'origin': 'https://kaspi.kz',
        'content-type': 'application/json',
        'cookie': params.sessionCookies,
      },
      body: JSON.stringify({
        merchantUid: params.merchantUid,
        availabilities: [
          { available: 'yes', storeId: params.storeId, stockCount: null },
        ],
        cityPrices: params.cityPrices,
        sku: params.sku,
        model: params.model,
      }),
    })
  } catch (err: any) {
    return { success: false, reason: 'other', message: `network error: ${err.message}` }
  }

  if (res.status === 401 || res.status === 403) {
    return { success: false, reason: 'session_expired', message: `HTTP ${res.status}` }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { success: false, reason: 'other', message: `HTTP ${res.status}: ${body.slice(0, 300)}` }
  }

  return { success: true }
}
