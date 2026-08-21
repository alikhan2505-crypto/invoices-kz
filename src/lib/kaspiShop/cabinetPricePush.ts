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

export type OfferAvailabilityParams = {
  sessionCookies: string
  merchantUid: string
  sku: string
  model: string
  storeId: string
  cityPrices: { cityId: string; value: number }[]
  // Omitted/null = "not managing stock via this upload" (the captured
  // cabinet restore state); a positive number = the seller's real остаток.
  stockCount?: number | null
}

// Shared MANUAL_CHANGES upload for toggling an offer on/off sale. The
// available:"yes" (restore) direction was captured live 2026-08-21 from the
// cabinet's own "Выставить на продажу" flow (founder's DevTools screenshots):
// the cabinet validates via offer-validation-api/.../validate/v2 (action
// ON_SALE__BATCH, returned valid:true) and then uploads MANUAL_CHANGES
// through the same pricefeed/upload pipeline as pushPriceChange above -- an
// offer row with availabilities available:"yes" (stockCount null in the
// captured state) and the offer's city prices. We reuse the single-item
// process endpoint whose payload shape has been confirmed since 2026-08-12,
// rather than the batch variant whose full item shape wasn't fully expanded
// in the capture. The available:"no" (remove-from-sale) direction is the
// symmetric counterpart -- same field the cabinet's own state stores as
// yes/no -- but has NOT been captured live yet; first real use should be
// watched (a Kaspi rejection surfaces as the honest error message below).
async function pushOfferAvailability(params: OfferAvailabilityParams, available: 'yes' | 'no'): Promise<PricePushResult> {
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
          { available, storeId: params.storeId, stockCount: params.stockCount ?? null },
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

export async function restoreOfferToSale(params: OfferAvailabilityParams): Promise<PricePushResult> {
  return pushOfferAvailability(params, 'yes')
}

export async function removeOfferFromSale(params: OfferAvailabilityParams): Promise<PricePushResult> {
  return pushOfferAvailability(params, 'no')
}

// Stock-only update (2026-08-21, founder request): the same available:"yes"
// upload as a restore, carrying the seller's real остаток and the offer's
// current city prices unchanged -- so a changed остаток reaches Kaspi
// immediately on save instead of waiting for the next price change.
export async function updateOfferStock(params: OfferAvailabilityParams): Promise<PricePushResult> {
  return pushOfferAvailability(params, 'yes')
}
