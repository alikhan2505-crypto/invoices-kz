// Endpoint and payload shape captured live 2026-08-12 against a real Kaspi
// Магазин seller account (see docs/superpowers/specs/2026-08-12-kaspi-
// cabinet-api-findings.md) -- this is what the cabinet's own "Изменить цену
// и остатки" UI calls. Response is an async job id, not the updated
// resource; no polling of that id has been tested.
//
// ⚠️ DEPRECATED AND DANGEROUS (2026-08-21): every upload through this
// single-item endpoint that carried a stockCount field was followed by
// Kaspi REMOVING the offer with «Не указано наличие в прайс листе»
// (confirmed live twice on the founder's real account). All live write
// paths now use pushOfferState below (the captured batch shape, no
// stockCount). Kept only as documentation of the captured shape -- do NOT
// wire this back into any code path without a fresh live capture proving
// it safe.
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
  // Kaspi's master product id -- used by the validate/v2 step (captured
  // 2026-08-21: its offers items are keyed by masterSku, not sku). null
  // skips validation rather than sending a wrong key.
  masterSku: string | null
  model: string
  // ALL of the offer's bare point codes (["PP1","PP2"]) -- confirmed live
  // 2026-08-21: an upload listing only ONE of a two-point offer's points
  // left the other point's наличие "unspecified", which Kaspi materialized
  // as остаток 0 on that point. Prefixing for the batch item happens here.
  storeCodes: string[]
  cityPrices: { cityId: string; value: number }[]
}

// THE canonical write path to Kaspi for an offer's state -- an EXACT copy
// of the cabinet's own «Выставить на продажу» batch item, captured in FULL
// (via «Посмотреть источник») from the founder's DevTools on 2026-08-21:
//
//   [{"merchantUid":"30067228","sku":"133206576_392235481",
//     "availabilities":[{"available":"yes","storeId":"30067228_PP2"}],
//     "model":"Влажные полотенца Sunlight 70шт XXL Universal 70 шт",
//     "cityPrices":[{"cityId":"511010000","value":1120}]}]
//
// Three hard-won rules encoded here, each confirmed by a live removal:
// 1. NO stockCount field AT ALL -- not even null. Every upload of ours that
//    carried stockCount (null or 1) was followed by Kaspi removing the
//    offer with «Не указано наличие в прайс листе»; the cabinet's own item
//    simply omits the field.
// 2. storeId is merchant-prefixed ("30067228_PP2").
// 3. The BATCH endpoint takes an array of these minimal items -- no full
//    offer echo, no master fields (an earlier details-echo attempt was also
//    answered with removals).
// Validation (validate/v2, action ON_SALE__BATCH) runs first for the
// restore direction, matching the cabinet's order; an explicit
// {valid:false} is surfaced verbatim, any other validation hiccup is
// non-fatal since the batch upload is the operation that matters.
export async function pushOfferState(params: OfferAvailabilityParams & { available: 'yes' | 'no' }): Promise<PricePushResult> {
  const headers = {
    'x-auth-version': '3',
    'referer': 'https://kaspi.kz/',
    'origin': 'https://kaspi.kz',
    'content-type': 'application/json',
    'cookie': params.sessionCookies,
  }

  const storeCodes = params.storeCodes.filter(Boolean)
  const item = {
    merchantUid: params.merchantUid,
    sku: params.sku,
    availabilities: storeCodes.map(code => ({ available: params.available, storeId: `${params.merchantUid}_${code}` })),
    model: params.model,
    cityPrices: params.cityPrices,
  }

  try {
    if (params.available === 'yes' && params.masterSku && storeCodes.length > 0) {
      // Validate item shape captured in full 2026-08-21 («Посмотреть
      // источник» on the cabinet's own v2 request): keyed by masterSku,
      // availabilities carry UNPREFIXED storeId + cityId + available +
      // price per city -- a different structure from the batch item.
      const validateOffer = {
        masterSku: params.masterSku,
        availabilities: params.cityPrices.map(cp => ({
          storeId: storeCodes[0],
          cityId: cp.cityId,
          available: params.available,
          price: cp.value,
        })),
      }
      const vRes = await fetch('https://mc.shop.kaspi.kz/offer-validation-api/merchant/offer/validate/v2', {
        method: 'POST',
        headers,
        body: JSON.stringify({ merchantUid: params.merchantUid, action: 'ON_SALE__BATCH', offers: [validateOffer] }),
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
    }

    const bRes = await fetch('https://mc.shop.kaspi.kz/pricefeed/upload/merchant/process/process/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify([item]),
    })
    if (bRes.status === 401 || bRes.status === 403) {
      return { success: false, reason: 'session_expired', message: `HTTP ${bRes.status}` }
    }
    if (!bRes.ok) {
      const body = await bRes.text().catch(() => '')
      return { success: false, reason: 'other', message: `HTTP ${bRes.status}: ${body.slice(0, 300)}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, reason: 'other', message: `network error: ${err.message}` }
  }
}

// The cabinet's «Цена и остатки» save for ONE point, captured in full
// 2026-08-21 («Посмотреть источник», founder's DevTools):
//   validate/v2: {action:"ON_SALE__PRICE_SAVE", merchantUid, offers:[{
//     masterSku, availabilities:[{available:"yes", storeId:"PP2" UNPREFIXED,
//     stockLevel:1, cityId:"511010000", price:1120}]}]}
//   then the SINGLE process endpoint: {merchantUid, availabilities:[
//     {available:"yes", storeId:"30067228_PP2" PREFIXED, stockCount:1}],
//     cityPrices:[{cityId:"511010000", value:1120}], model, sku}
// Note the asymmetry Kaspi itself uses: stockLevel + bare storeId in
// validation, stockCount + prefixed storeId in the upload, and cityPrices
// carrying ONLY the edited point's own city (never the national list --
// that's exactly what our earlier failing stock push got wrong).
export async function savePointStockPrice(params: {
  sessionCookies: string
  merchantUid: string
  sku: string
  masterSku: string | null
  model: string
  storeCode: string
  cityId: string
  price: number
  stockCount: number | null
}): Promise<PricePushResult> {
  const headers = {
    'x-auth-version': '3',
    'referer': 'https://kaspi.kz/',
    'origin': 'https://kaspi.kz',
    'content-type': 'application/json',
    'cookie': params.sessionCookies,
  }

  try {
    if (params.masterSku) {
      const vRes = await fetch('https://mc.shop.kaspi.kz/offer-validation-api/merchant/offer/validate/v2', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'ON_SALE__PRICE_SAVE',
          merchantUid: params.merchantUid,
          offers: [{
            masterSku: params.masterSku,
            availabilities: [{
              available: 'yes',
              storeId: params.storeCode,
              ...(params.stockCount !== null ? { stockLevel: params.stockCount } : {}),
              cityId: params.cityId,
              price: params.price,
            }],
          }],
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
    }

    const pRes = await fetch(PRICE_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        merchantUid: params.merchantUid,
        availabilities: [{
          available: 'yes',
          storeId: `${params.merchantUid}_${params.storeCode}`,
          ...(params.stockCount !== null ? { stockCount: params.stockCount } : {}),
        }],
        cityPrices: [{ cityId: params.cityId, value: params.price }],
        model: params.model,
        sku: params.sku,
      }),
    })
    if (pRes.status === 401 || pRes.status === 403) {
      return { success: false, reason: 'session_expired', message: `HTTP ${pRes.status}` }
    }
    if (!pRes.ok) {
      const body = await pRes.text().catch(() => '')
      return { success: false, reason: 'other', message: `HTTP ${pRes.status}: ${body.slice(0, 300)}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, reason: 'other', message: `network error: ${err.message}` }
  }
}

export async function restoreOfferToSale(params: OfferAvailabilityParams): Promise<PricePushResult> {
  return pushOfferState({ ...params, available: 'yes' })
}

export async function removeOfferFromSale(params: OfferAvailabilityParams): Promise<PricePushResult> {
  return pushOfferState({ ...params, available: 'no' })
}
