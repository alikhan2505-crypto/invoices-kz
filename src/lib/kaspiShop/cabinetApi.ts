// Authenticated calls to the real Kaspi Магазин cabinet backend, confirmed
// live 2026-08-12 against a real seller account (merchant id 30067228,
// "ИП FIRST PROJECT"). See project memory / the 2026-08-12 findings doc for
// the original trace. Requires session cookies from a completed
// cabinetAuth.submitOtp() login.

export function authHeaders(sessionCookies: string): Record<string, string> {
  return {
    'x-auth-version': '3',
    'content-type': 'application/json',
    'origin': 'https://kaspi.kz',
    'referer': 'https://kaspi.kz/',
    'cookie': sessionCookies,
  }
}

// A single 401 from Kaspi isn't reliable proof a session is actually dead --
// observed live 2026-09-14: listOrders and getOrderCounters both 401'd for a
// connection that answered normally again seconds later with the exact same
// cookies (most likely a transient hiccup on Kaspi's side, not a real logout).
// The caller treats sessionExpired as gospel and writes it straight to
// kaspi_shop_connections.session_status, which forces a full phone+OTP
// reconnect -- expensive to be wrong about, cheap to double-check. One retry
// after a short pause is enough to filter that case out before committing.
//
// 403 is treated like 401 (аудит 2026-11-06): на этих кабинетных адресах Kaspi
// отвечает 403 так же, как 401, когда cookies больше не годятся, и остальной
// код модуля (listCatalogWithStatus, confirmPacking) уже читает их одинаково.
// Каждая попытка получает свой AbortSignal.timeout: зависший ответ Kaspi не
// держит функцию Vercel до её лимита.
const CABINET_TIMEOUT_MS = 20_000

export function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403
}

async function fetchWithRetryOn401(url: string, init: RequestInit, fetchFn: typeof fetch): Promise<Response> {
  const attempt = () => fetchFn(url, { ...init, signal: init.signal ?? AbortSignal.timeout(CABINET_TIMEOUT_MS) })
  const res = await attempt()
  if (!isAuthFailureStatus(res.status)) return res
  await new Promise(r => setTimeout(r, 500))
  return attempt()
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'TimeoutError' || err.name === 'AbortError' ? 'Kaspi не ответил вовремя' : err.message
  }
  return 'Неизвестная ошибка'
}

// Confirmed live 2026-08-13: this is the same call the real cabinet's own
// SPA makes right after landing on kaspi.kz/mc/ to figure out which
// merchant(s) the logged-in phone number can manage -- one login can have
// access to more than one seller account (observed live: a phone linked as
// a user on two separate shops returned both merchant uids here). Used at
// connect time so the seller picks from a real list instead of typing an
// ID off their own cabinet header.
export async function listMerchants(sessionCookies: string): Promise<{ uid: string }[]> {
  const res = await fetch('https://mc.shop.kaspi.kz/s/m', { headers: authHeaders(sessionCookies), signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return []
  const json = await res.json().catch(() => null)
  const merchants = json?.merchants
  if (!Array.isArray(merchants)) return []
  return merchants.map((m: any) => ({ uid: String(m.uid) }))
}

export type MerchantInfo = {
  id: string
  name: string
  logoUrl: string | null
}

export async function getMerchantInfo(sessionCookies: string, merchantId: string): Promise<MerchantInfo | null> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getMerchant', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getMerchant',
      variables: { id: merchantId },
      query: `query getMerchant($id: String!) {
        merchant(id: $id) { id name logo { url } }
      }`,
    }),
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null)
  const merchant = json?.data?.merchant
  if (!merchant) return null
  return { id: merchant.id, name: merchant.name, logoUrl: merchant.logo?.url ?? null }
}

// Confirmed live 2026-08-14 against the real connected ABIL-SISTERS session
// (see docs/superpowers/specs/2026-08-14-kaspi-cabinet-city-names-findings.md)
// -- same authenticated GraphQL facade as getMerchant/listCatalog above.
// `cities` takes no arguments and isn't merchant-scoped (confirmed: returns
// the full national city/point list, not filtered per seller) --
// merchantId is accepted only for signature consistency with this module's
// other functions. Backs a best-effort local cache
// (kaspi_shop_connections.city_lookup_cache) so the city picker can show
// real names instead of raw Kaspi city codes; never throws -- returns {} on
// any non-ok response or unexpected shape, since a cache refresh must never
// block saving the seller's city selection.
export async function fetchCityNames(sessionCookies: string, merchantId: string): Promise<Record<string, string>> {
  return (await fetchCityNamesChecked(sessionCookies, merchantId)).names
}

// Тот же запрос, но с признаком «ответ получен и в нём есть города»: кэш точек
// (merchantPoints.ts) не должен навсегда запоминать точки без названий городов
// только потому, что getCities один раз ответил ошибкой.
export async function fetchCityNamesChecked(sessionCookies: string, _merchantId: string, fetchFn: typeof fetch = fetch): Promise<{ names: Record<string, string>; ok: boolean }> {
  try {
    const res = await fetchFn('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getCities', {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      signal: AbortSignal.timeout(CABINET_TIMEOUT_MS),
      body: JSON.stringify({
        operationName: 'getCities',
        variables: {},
        query: `query getCities { cities { id name } }`,
      }),
    })
    if (!res.ok) return { names: {}, ok: false }
    const json = await res.json().catch(() => null)
    const cities = json?.data?.cities
    if (!Array.isArray(cities)) return { names: {}, ok: false }
    const result: Record<string, string> = {}
    for (const c of cities) {
      if (c?.id && c?.name) result[String(c.id)] = String(c.name)
    }
    return { names: result, ok: Object.keys(result).length > 0 }
  } catch {
    return { names: {}, ok: false }
  }
}

export type CatalogOffer = {
  sku: string
  masterSku: string | null
  title: string
  brandCode: string | null
  brandName: string | null
  masterCategory: string | null
  minPrice: number
  allCityPrices: Record<string, { price: number }>
  points: string[]
  // Per-point stock/availability straight from the list row -- the offer
  // DETAILS endpoint carries no остаток at all (confirmed via runtime-log
  // dump 2026-08-21), the list's availabilities is where it actually lives.
  availabilities: { storeId: string; stockCount: number | null; available: string | null }[]
}

// Full raw offer object for one sku -- the same call the cabinet's own
// «Выставить на продажу» flow makes first (captured live 2026-08-21 from
// the founder's DevTools: POST offers/api/v1/offer/details?m={merchantId}
// with body {sku:["..."]}, response is a bare array of offer objects with
// cities[], availabilities, master fields). Returned UNTYPED on purpose:
// the restore/remove batch upload echoes this object back to Kaspi, and
// retyping it would silently drop fields we don't know about.
export async function fetchOfferDetails(sessionCookies: string, merchantId: string, sku: string): Promise<Record<string, any> | null> {
  const items = await fetchOffersDetails(sessionCookies, merchantId, [sku])
  return items[0] ?? null
}

// Batch variant -- the endpoint's request body takes an sku ARRAY natively
// (the very first capture posted {sku:["..."]}), so a whole page of offers
// costs one request instead of one per product.
export async function fetchOffersDetails(sessionCookies: string, merchantId: string, skus: string[]): Promise<Record<string, any>[]> {
  return (await fetchOffersDetailsChecked(sessionCookies, merchantId, skus)).items
}

// Сколько sku уходит в один запрос details. Раньше весь каталог (до сотен
// товаров) шёл ОДНИМ POST: один сбой или слишком большое тело обнуляло данные
// по всем товарам сразу (аудит K23).
export const DETAILS_CHUNK_SIZE = 50

export type OffersDetailsResult = {
  items: Record<string, any>[]
  // sku, чей кусок запроса Kaspi принял (ответ 2xx и разобранный массив). Если sku
  // тут нет, мы НЕ знаем его точек: вызывающий не должен затирать то, что уже
  // записано, пустым значением.
  okSkus: Set<string>
  // true только если ответили все куски.
  ok: boolean
  sessionExpired: boolean
  error?: string
}

export async function fetchOffersDetailsChecked(
  sessionCookies: string,
  merchantId: string,
  skus: string[],
  fetchFn: typeof fetch = fetch,
): Promise<OffersDetailsResult> {
  const result: OffersDetailsResult = { items: [], okSkus: new Set(), ok: true, sessionExpired: false }
  if (skus.length === 0) return result
  for (let i = 0; i < skus.length; i += DETAILS_CHUNK_SIZE) {
    const chunk = skus.slice(i, i + DETAILS_CHUNK_SIZE)
    try {
      const res = await fetchFn(`https://mc.shop.kaspi.kz/offers/api/v1/offer/details?m=${encodeURIComponent(merchantId)}`, {
        method: 'POST',
        headers: authHeaders(sessionCookies),
        signal: AbortSignal.timeout(CABINET_TIMEOUT_MS),
        body: JSON.stringify({ sku: chunk }),
      })
      if (isAuthFailureStatus(res.status)) {
        // Мёртвая сессия не оживёт на следующем куске.
        result.ok = false
        result.sessionExpired = true
        result.error = 'Сессия кабинета Kaspi истекла'
        return result
      }
      if (!res.ok) { result.ok = false; result.error = `Kaspi ответил HTTP ${res.status}`; continue }
      const json = await res.json().catch(() => null)
      const arr = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : null)
      if (!arr) { result.ok = false; result.error = 'Kaspi вернул неожиданный ответ'; continue }
      result.items.push(...arr.filter((item: any) => item && typeof item === 'object'))
      for (const sku of chunk) result.okSkus.add(sku)
    } catch (err) {
      result.ok = false
      result.error = errorMessage(err)
    }
  }
  return result
}

export type OfferPointInfo = {
  storeCode: string
  cityId: string | null
  price: number | null
  stockCount: number | null
  available: string | null
}

// Per-point (склад) info extracted from an offer details object. Two real
// shapes handled (runtime-log dump 2026-08-21): objects carrying storeId/
// pointId directly (stock/available live there), and cities[] rows whose
// `points` array holds point OBJECTS ({pointId:"30067228_PP2", name:null,
// available:true} -- boolean available, city+price on the parent row).
// Unrecognized structures yield an empty list, never fabricated data.
export function extractOfferPointInfo(details: any, merchantId: string): OfferPointInfo[] {
  const out = new Map<string, OfferPointInfo>()
  const strip = (raw: string) => (raw.startsWith(`${merchantId}_`) ? raw.slice(merchantId.length + 1) : raw)
  const upsert = (code: string): OfferPointInfo => {
    const existing = out.get(code) || { storeCode: code, cityId: null, price: null, stockCount: null, available: null }
    out.set(code, existing)
    return existing
  }

  function walk(node: any) {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (!node || typeof node !== 'object') return

    const rawStoreId = node.storeId ?? node.pointId ?? null
    if (typeof rawStoreId === 'string' && rawStoreId.length > 0) {
      const entry = upsert(strip(rawStoreId))
      const cityId = node.cityId ?? node.city?.id ?? null
      if (cityId !== null && cityId !== undefined) entry.cityId = String(cityId)
      const stock = node.stockCount ?? node.stockLevel ?? null
      if (stock !== null && stock !== undefined && Number.isFinite(Number(stock))) entry.stockCount = Number(stock)
      const price = node.price ?? null
      if (price !== null && price !== undefined && Number.isFinite(Number(price))) entry.price = Number(price)
      if (typeof node.available === 'string') entry.available = node.available
      else if (typeof node.available === 'boolean') entry.available = node.available ? 'yes' : 'no'
    }

    const cityIdVal = node.cityId ?? null
    if (cityIdVal !== null && cityIdVal !== undefined && Array.isArray(node.points) && node.points.length > 0) {
      for (const p of node.points) {
        const rawCode = typeof p === 'string' ? p : (p && typeof p === 'object' ? (p.pointId ?? p.storeId ?? null) : null)
        if (typeof rawCode !== 'string' || !rawCode) continue
        const entry = upsert(strip(rawCode))
        entry.cityId = String(cityIdVal)
        const price = node.price ?? null
        if (price !== null && price !== undefined && Number.isFinite(Number(price))) entry.price = Number(price)
        if (p && typeof p === 'object') {
          if (typeof p.available === 'boolean') entry.available = p.available ? 'yes' : 'no'
          else if (typeof p.available === 'string') entry.available = p.available
          const stock = p.stockCount ?? p.stockLevel ?? null
          if (stock !== null && stock !== undefined && Number.isFinite(Number(stock))) entry.stockCount = Number(stock)
        }
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value)
    }
  }

  walk(details)
  return Array.from(out.values())
}

// Reads the seller's own existing catalog -- the endpoint the official
// public Merchant API has no equivalent for. Paginates internally (100 per
// page, confirmed the real endpoint accepts an `l` limit param) until a
// page returns fewer than the limit. sessionExpired follows this module's
// established 401 pattern (see getOrderCounters) -- previously a dead
// session silently produced an EMPTY catalog, which read as "0 товаров"
// in the UI instead of "переподключитесь" (bitten live 2026-08-21).
// Результат чтения каталога. complete=true означает «дошли до последней
// страницы и каждая ответила нормально». Любой сбой (не-2xx, неожиданная форма,
// таймаут, потолок страниц) даёт complete=false + failed=true: пустой или
// короткий список тогда НЕ значит «товаров нет» (аудит K22: «Каталог обновлён: 0»,
// «Все товары в продаже» при обрыве).
export type CatalogListResult = {
  offers: CatalogOffer[]
  sessionExpired: boolean
  complete: boolean
  failed: boolean
  error?: string
}

// Потолок страниц: если Kaspi вдруг перестанет учитывать p, цикл не бесконечен
// (500 страниц по 100 = 50 000 товаров, далеко за любым реальным каталогом).
export const CATALOG_MAX_PAGES = 500

export async function listCatalogWithStatus(
  sessionCookies: string,
  merchantId: string,
  available = true,
  fetchFn: typeof fetch = fetch,
): Promise<CatalogListResult> {
  const offers: CatalogOffer[] = []
  const pageSize = 100
  const seen = new Set<string>()
  const failedResult = (error: string, sessionExpired = false): CatalogListResult =>
    ({ offers, sessionExpired, complete: false, failed: true, error })

  for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
    const url = `https://mc.shop.kaspi.kz/bff/offer-view/list?m=${encodeURIComponent(merchantId)}&p=${page}&l=${pageSize}&a=${available}`
    let res: Response
    try {
      res = await fetchFn(url, { headers: authHeaders(sessionCookies), signal: AbortSignal.timeout(CABINET_TIMEOUT_MS) })
    } catch (err) {
      return failedResult(errorMessage(err))
    }
    if (isAuthFailureStatus(res.status)) {
      return failedResult('Сессия кабинета Kaspi истекла', true)
    }
    if (!res.ok) return failedResult(`Kaspi ответил HTTP ${res.status}`)
    const json = await res.json().catch(() => null)
    const data = json?.data
    if (!Array.isArray(data)) return failedResult('Kaspi вернул неожиданный ответ')
    if (data.length === 0) return { offers, sessionExpired: false, complete: true, failed: false }
    // Kaspi проигнорировал p и отдаёт ту же страницу снова: дальше листать нечего,
    // а полным такой список считать нельзя.
    if (page > 0 && data.every((item: any) => typeof item?.sku === 'string' && seen.has(item.sku))) {
      return failedResult('Kaspi не переключает страницы каталога')
    }
    for (const item of data) {
      if (typeof item?.sku === 'string') seen.add(item.sku)
      offers.push({
        sku: item.sku,
        masterSku: item.masterSku ?? null,
        title: item.title,
        brandCode: item.brandCode ?? null,
        brandName: item.brandName ?? null,
        masterCategory: item.masterCategory ?? null,
        minPrice: Number(item.minPrice),
        allCityPrices: item.allCityPrices || {},
        points: item.points || [],
        availabilities: Array.isArray(item.availabilities)
          ? item.availabilities
              .filter((a: any) => a && typeof a.storeId === 'string')
              .map((a: any) => ({
                storeId: a.storeId as string,
                stockCount: a.stockCount !== null && a.stockCount !== undefined && Number.isFinite(Number(a.stockCount)) ? Number(a.stockCount) : null,
                available: typeof a.available === 'string' ? a.available : (typeof a.available === 'boolean' ? (a.available ? 'yes' : 'no') : null),
              }))
          : [],
      })
    }
    if (data.length < pageSize) return { offers, sessionExpired: false, complete: true, failed: false }
  }
  return failedResult(`Каталог длиннее ${CATALOG_MAX_PAGES} страниц, остановились на потолке`)
}

export async function listCatalog(sessionCookies: string, merchantId: string, available = true): Promise<CatalogOffer[]> {
  const { offers } = await listCatalogWithStatus(sessionCookies, merchantId, available)
  return offers
}

export type MerchantPoint = { storeCode: string; cityId: string | null; cityName: string | null }

// Confirmed live 2026-08-23: neither the orders page's city filter nor the
// «Цена и остатки» modal has any way to show a pickup point with zero
// current orders/stock, because both previously derived "known points" from
// a single product's or a sampled page's own data. This scans the FULL
// catalog (active + removed) once -- offer.points is free on the list
// response, extractOfferPointInfo(details) adds any point only visible in
// the details batch -- to build the merchant's complete point set, then
// resolves each point's city via the confirmed-working getCities catalog
// (same KATO-style id space as the real cabinet's own city filter, see
// extractPointCity's comment). Callers should cache this (it scans the
// whole catalog) -- see merchantPoints.ts's getCachedMerchantPoints.
export async function getMerchantPoints(sessionCookies: string, merchantId: string): Promise<MerchantPoint[]> {
  return (await getMerchantPointsDetailed(sessionCookies, merchantId)).points
}

// То же, но с признаком полноты: complete=true только если оба каталога дочитаны
// до конца, details ответили на всё и справочник городов получен. Кэш точек
// (merchantPoints.ts) пишется только при complete (аудит, минор по Заказам:
// частичный результат запоминался навсегда, и список городов оставался пустым).
export async function getMerchantPointsDetailed(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ points: MerchantPoint[]; complete: boolean; sessionExpired: boolean }> {
  const [activeRes, removedRes] = await Promise.all([
    listCatalogWithStatus(sessionCookies, merchantId, true, fetchFn),
    listCatalogWithStatus(sessionCookies, merchantId, false, fetchFn),
  ])
  const allOffers = [...activeRes.offers, ...removedRes.offers]
  let complete = activeRes.complete && removedRes.complete
  const sessionExpired = activeRes.sessionExpired || removedRes.sessionExpired

  const codes = new Set<string>()
  for (const offer of allOffers) for (const code of offer.points) codes.add(code)

  const cityByCode = new Map<string, string>()
  try {
    const details = await fetchOffersDetailsChecked(sessionCookies, merchantId, allOffers.map(o => o.sku), fetchFn)
    if (!details.ok) complete = false
    for (const item of details.items) {
      for (const info of extractOfferPointInfo(item, merchantId)) {
        codes.add(info.storeCode)
        if (info.cityId) cityByCode.set(info.storeCode, info.cityId)
      }
    }
  } catch (err: any) {
    complete = false
    console.error('kaspi-shop getMerchantPoints: details batch failed (non-fatal, points show no city)', err.message)
  }

  const cityCatalog = await fetchCityNamesChecked(sessionCookies, merchantId, fetchFn)
  if (!cityCatalog.ok) complete = false
  const points = Array.from(codes).map(storeCode => {
    const cityId = cityByCode.get(storeCode) || null
    return { storeCode, cityId, cityName: cityId ? (cityCatalog.names[cityId] || null) : null }
  })
  // Нет ни одной точки: это не «у магазина нет точек», а пустой результат, который нельзя запоминать.
  if (points.length === 0) complete = false
  return { points, complete, sessionExpired }
}

// Real query/variables/response shape confirmed live 2026-08-13 (see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md) --
// presetFilter uses the SAME status codes as the cabinet's own sidebar nav
// links (e.g. "NEW", "KASPI_DELIVERY_WAIT_FOR_COURIER" for Передача), and
// orders are identified by `code`, not a separate `id` field.
// entries[].product.images (baseUrl + paths[]) confirmed live 2026-08-13 --
// the same field works whether requested from the list query (getOrders)
// or the single-order query (getOrderDetails), so the list can show real
// product photos without a second fetch per order. Real URL = baseUrl +
// paths[0] (paths is an array of angles/crops -- first one is the primary
// photo, confirmed against real captured data).
export type OrderItem = {
  code: string
  name: string
  imageUrl: string | null
  quantity: number
  totalPrice: number
}

export type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
  cityId: string | null
  cityName: string | null
  plannedDeliveryDate: string | null
  items: OrderItem[]
}

function mapOrderItems(entries: any[] | undefined): OrderItem[] {
  return (entries || []).map((e: any) => ({
    code: e.product?.code ?? '',
    name: e.product?.name ?? '',
    imageUrl: e.product?.images?.baseUrl && e.product?.images?.paths?.[0]
      ? e.product.images.baseUrl + e.product.images.paths[0]
      : null,
    quantity: Number(e.quantity) || 1,
    totalPrice: Number(e.totalPrice) || 0,
  }))
}

// Confirmed live 2026-08-23: the real cabinet's own "Выберите город" filter
// on the orders page lists the MERCHANT's own warehouse/point cities (this
// account has exactly 2: Астана, Шымкент), not the customer's delivery
// destination -- and it sends a KATO-style cityId (e.g. "511010000" for
// Шымкент) that does NOT match this field's own `city.id` (a much smaller
// Kaspi-internal id). Use this only to read the city NAME for display/
// options; resolve the real filterable id via fetchCityNames's catalog
// (see orders/cities/route.ts), never this function's `id`.
export function extractPointCity(point: any): { cityId: string | null; cityName: string | null } {
  const city = point?.city
  if (!city || city.id == null) return { cityId: null, cityName: null }
  return { cityId: String(city.id), cityName: city.name ?? null }
}

const GET_ORDERS_QUERY = `query getOrders($merchantUid: String!, $input: MerchantOrderInput!, $advancedInput: MerchantOrderAdvancedInput!, $withAdvancedOrders: Boolean!, $page: Int!, $size: Int, $sort: [String!]) {
  merchant(id: $merchantUid) {
    id
    orders {
      orders(input: $input, page: $page, size: $size, sort: $sort) @skip(if: $withAdvancedOrders) {
        total
        orders { ...OrdersPageFragment }
      }
      advancedOrders(input: $advancedInput, page: $page, size: $size, sort: $sort) @include(if: $withAdvancedOrders) {
        total
        orders { ...OrdersPageFragment }
      }
    }
  }
}

fragment OrdersPageFragment on Order {
  code
  customer { firstName lastName }
  totalPrice
  creationTime
  modificationTime
  status
  warehouse {
    ... on Point { city { id name } }
    ... on OrderAddress { city { id name } }
    ... on Postomat { city { id name } }
  }
  delivery { plannedDeliveryDate }
  entries {
    quantity
    totalPrice
    product { code name images { baseUrl paths } }
  }
}`

// Real query/response shape confirmed live 2026-08-13 -- a trimmed
// selection of the real getOrderDetails query (the full one carries many
// fields this feature doesn't use: cancelReason, courierDetails,
// consignments, markers, payments, returnRequests, orderSteps, etc).
// customer.phoneNumber comes back masked ("+0(000)-000-00-00") even when
// requested -- confirmed live, not a permissions gap in this session --
// so it's skipped entirely via skipCustomerPhone rather than requested
// and discarded.
export type OrderDetail = {
  code: string
  status: string
  creationTime: string
  totalPrice: number
  customerFirstName: string
  customerLastName: string
  cityName: string | null
  // Город покупателя (куда едет заказ); cityName выше это город точки продавца.
  destinationCityName?: string | null
  plannedDeliveryDate: string | null
  items: OrderItem[]
}

const GET_ORDER_DETAILS_QUERY = `query getOrderDetails($merchantUid: String!, $orderCode: String!, $skipCustomerPhone: Boolean! = false) {
  merchant(id: $merchantUid) {
    orderDetail(code: $orderCode) {
      code
      status
      creationTime
      totalPrice
      customer { phoneNumber @skip(if: $skipCustomerPhone) lastName firstName }
      destination {
        ... on Postomat { city { name } }
        ... on OrderAddress { city { name } }
        ... on Point { city { name } }
      }
      warehouse {
        ... on Postomat { city { name } }
        ... on OrderAddress { city { name } }
        ... on Point { city { name } }
      }
      delivery { plannedDeliveryDate }
      entries {
        quantity
        totalPrice
        product { code name images { baseUrl paths } }
      }
    }
  }
}`

// order=null здесь значит «Kaspi ответил, такого заказа нет». Сбой запроса
// (не-2xx, таймаут, неверная форма) и мёртвая сессия различаются флагами, чтобы
// маршрут не отвечал «Заказ не найден» на протухшую сессию (аудит, минор по Заказам).
export type OrderDetailResult = {
  order: OrderDetail | null
  sessionExpired: boolean
  failed: boolean
  error?: string
}

export async function getOrderDetail(
  sessionCookies: string,
  merchantId: string,
  orderCode: string,
  fetchFn: typeof fetch = fetch,
): Promise<OrderDetailResult> {
  try {
    const res = await fetchWithRetryOn401('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrderDetails', {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      body: JSON.stringify({
        operationName: 'getOrderDetails',
        variables: { merchantUid: merchantId, orderCode, skipCustomerPhone: true },
        query: GET_ORDER_DETAILS_QUERY,
      }),
    }, fetchFn)
    if (isAuthFailureStatus(res.status)) {
      return { order: null, sessionExpired: true, failed: true, error: 'Сессия кабинета Kaspi истекла' }
    }
    if (!res.ok) return { order: null, sessionExpired: false, failed: true, error: `Kaspi ответил HTTP ${res.status}` }
    const json = await res.json().catch(() => null)
    const merchant = json?.data?.merchant
    if (!merchant || typeof merchant !== 'object') {
      return { order: null, sessionExpired: false, failed: true, error: 'Kaspi вернул неожиданный ответ' }
    }
    const d = merchant.orderDetail
    if (!d) return { order: null, sessionExpired: false, failed: false }
    return {
      sessionExpired: false,
      failed: false,
      order: {
        code: d.code,
        status: d.status,
        creationTime: d.creationTime,
        totalPrice: Number(d.totalPrice) || 0,
        customerFirstName: d.customer?.firstName ?? '',
        customerLastName: d.customer?.lastName ?? '',
        // Один источник города на всех экранах: город ТОЧКИ продавца (warehouse), как в
        // списке заказов и в Excel (extractPointCity). Раньше здесь первым шёл город
        // покупателя (destination), и заказ на Астану со склада в Шымкенте на странице
        // заказа был «Астана», а в Excel «Шымкент». Город покупателя вынесен отдельно.
        cityName: d.warehouse?.city?.name ?? d.destination?.city?.name ?? null,
        destinationCityName: d.destination?.city?.name ?? null,
        plannedDeliveryDate: d.delivery?.plannedDeliveryDate ?? null,
        items: mapOrderItems(d.entries),
      },
    }
  } catch (err) {
    return { order: null, sessionExpired: false, failed: true, error: errorMessage(err) }
  }
}

// Real shape confirmed live 2026-08-13 -- the badge counts shown next to
// each status tab in the cabinet's own sidebar (e.g. "Упаковка 2"). Cheaper
// than fetching every status's full order list just to show counts.
export type OrderCounts = Record<string, number>

// sessionExpired is res.status 401/403 (after one retry) -- Kaspi's real
// signal that mc-session/mc-sid are no longer valid, distinct from any
// other upstream failure (network error, unexpected shape). Callers use
// this to write kaspi_shop_connections.session_status via
// connection.ts's markSessionExpired, so the reconnect banner (read from
// that column by /api/kaspi-shop/wallet) reflects reality promptly
// instead of only updating when the repricer's own price-push cron
// happens to hit the same 401 (which never runs for a paused connection).
// failed (аудит K36): любой сбой, включая мёртвую сессию -- пустой counts при
// failed это «не знаем», а не «заказов нет».
export type OrderCountersResult = { counts: OrderCounts; sessionExpired: boolean; failed?: boolean; error?: string }

const GET_ORDER_COUNTERS_QUERY = `query getOrderCounters($merchantUid: String!) {
  merchant(id: $merchantUid) {
    orders { counts { tab count } }
  }
}`

export async function getOrderCounters(sessionCookies: string, merchantId: string, fetchFn: typeof fetch = fetch): Promise<OrderCountersResult> {
  try {
    const res = await fetchWithRetryOn401('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrderCounters', {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      body: JSON.stringify({
        operationName: 'getOrderCounters',
        variables: { merchantUid: merchantId },
        query: GET_ORDER_COUNTERS_QUERY,
      }),
    }, fetchFn)
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.error('kaspi-shop getOrderCounters: upstream not ok', res.status, bodyText.slice(0, 1000))
      return { counts: {}, sessionExpired: isAuthFailureStatus(res.status), failed: true, error: `Kaspi ответил HTTP ${res.status}` }
    }
    const json = await res.json().catch(() => null)
    const counts = json?.data?.merchant?.orders?.counts
    if (!Array.isArray(counts)) return { counts: {}, sessionExpired: false, failed: true, error: 'Kaspi вернул неожиданный ответ' }
    const result: OrderCounts = {}
    for (const c of counts) result[c.tab] = c.count
    return { counts: result, sessionExpired: false, failed: false }
  } catch (err) {
    return { counts: {}, sessionExpired: false, failed: true, error: errorMessage(err) }
  }
}

// Sum of a catalog offer's real per-point stock. Kaspi reports stock per
// availability row (one per store point); a null count means "not tracked
// at this point", not zero, so it contributes nothing to the sum.
export function totalStock(offer: { availabilities: { stockCount: number | null }[] }): number {
  return offer.availabilities.reduce((sum, a) => sum + (a.stockCount ?? 0), 0)
}

// failed (аудит K3/K35): страница НЕ получена (не-2xx, таймаут, неверная форма,
// мёртвая сессия). Тогда orders=[] и total=0 -- это «не знаем», а не «заказов нет»;
// ни одна часть системы не должна показывать это как честный ноль или считать
// выручку по такому ответу.
export type OrdersPage = { orders: Order[]; total: number; sessionExpired: boolean; failed?: boolean; error?: string }

// size MUST stay at 10 -- confirmed live 2026-08-13: the real cabinet's own
// SPA always requests size:10, and requesting size:50 (an earlier,
// unconfirmed guess) got a GraphQL "Bad Request" error back from Kaspi's
// backend for at least one status (KASPI_DELIVERY_CARGO_ASSEMBLY), even
// though the same shape with size:10 succeeds. Pagination (page) exists
// because of this limit -- any status with more than 10 orders needs it.
export const PAGE_SIZE = 10

export async function listOrders(
  sessionCookies: string,
  merchantId: string,
  status: string,
  page = 0,
  cityId = '',
  orderCode = '',
  fetchFn: typeof fetch = fetch
): Promise<OrdersPage> {
  // Searching by order code switches to Kaspi's own "Расширенный поиск" --
  // the schema's advancedOrders field takes orderCode/phoneNumber/productCode
  // but no presetFilter, so a search runs across every status, not just the
  // active tab (matches the real cabinet's own advanced-search behavior,
  // confirmed shape captured live 2026-08-13, see
  // docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md).
  const searching = orderCode.trim().length > 0
  try {
    const res = await fetchWithRetryOn401('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders', {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      body: JSON.stringify({
        operationName: 'getOrders',
        variables: {
          merchantUid: merchantId,
          size: PAGE_SIZE,
          page,
          input: { presetFilter: status, orderCode: '', cityId },
          advancedInput: { orderCode: searching ? orderCode.trim() : '', phoneNumber: '', productCode: '' },
          withAdvancedOrders: searching,
        },
        query: GET_ORDERS_QUERY,
      }),
    }, fetchFn)
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.error('kaspi-shop listOrders: upstream not ok', res.status, bodyText.slice(0, 1000))
      return { orders: [], total: 0, sessionExpired: isAuthFailureStatus(res.status), failed: true, error: `Kaspi ответил HTTP ${res.status}` }
    }
    const json = await res.json().catch(() => null)
    // @skip/@include on the two branches means only one of orders/advancedOrders
    // is present in the response, depending on withAdvancedOrders above.
    const page_ = searching ? json?.data?.merchant?.orders?.advancedOrders : json?.data?.merchant?.orders?.orders
    const orders = page_?.orders
    if (!Array.isArray(orders)) {
      console.error('kaspi-shop listOrders: unexpected response shape for status', status, JSON.stringify(json)?.slice(0, 2000))
      return { orders: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi вернул неожиданный ответ' }
    }
    return {
      total: Number(page_.total) || 0,
      sessionExpired: false,
      failed: false,
      orders: orders.map((o: any) => ({
        code: o.code,
        status: o.status,
        customerFirstName: o.customer?.firstName ?? '',
        customerLastName: o.customer?.lastName ?? '',
        totalPrice: Number(o.totalPrice) || 0,
        creationTime: o.creationTime,
        ...extractPointCity(o.warehouse),
        plannedDeliveryDate: o.delivery?.plannedDeliveryDate ?? null,
        items: mapOrderItems(o.entries),
      })),
    }
  } catch (err) {
    console.error('kaspi-shop listOrders: request threw', err instanceof Error ? err.message : err)
    return { orders: [], total: 0, sessionExpired: false, failed: true, error: errorMessage(err) }
  }
}

// The cabinet's real «Я упаковал, сформировать накладные» action, captured
// live 2026-08-26 (see docs/superpowers/specs/2026-08-26-kaspi-packing-
// confirm-api-findings.md): накладные do NOT exist for an order sitting in
// Упаковка -- Kaspi only generates them once this action fires, which ALSO
// immediately moves the order from Упаковка to Передача (confirmed: the
// order disappeared from the Упаковка tab count the instant this call
// returned). Kaspi's own UI response is an async promise ("в течение 5
// минут"), not the накладная itself -- callers must wait and print from
// Передача afterwards, exactly like the real cabinet does.
export type ConfirmPackingResult = { success: boolean; sessionExpired: boolean; message?: string }

export async function confirmPacking(
  sessionCookies: string,
  merchantId: string,
  orders: { orderCode: string; quantity: number }[],
  fetchFn: typeof fetch = fetch
): Promise<ConfirmPackingResult> {
  let res: Response
  try {
    res = await fetchFn(`https://mc.shop.kaspi.kz/mc/api/order/cargo/assembled?_m=${encodeURIComponent(merchantId)}`, {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      signal: AbortSignal.timeout(CABINET_TIMEOUT_MS),
      body: JSON.stringify({
        cargos: orders.map(o => ({ orderCode: o.orderCode, newCargoSpace: 1, quantity: o.quantity })),
      }),
    })
  } catch (err) {
    // Таймаут не значит «не сработало»: Kaspi мог принять запрос. Просим проверить вкладку.
    return { success: false, sessionExpired: false, message: `${errorMessage(err)}. Проверьте вкладки «Упаковка» и «Передача», прежде чем повторять` }
  }
  if (res.status === 401 || res.status === 403) return { success: false, sessionExpired: true }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    return { success: false, sessionExpired: false, message: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` }
  }
  return { success: true, sessionExpired: false }
}
