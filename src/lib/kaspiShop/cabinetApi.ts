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

// Confirmed live 2026-08-13: this is the same call the real cabinet's own
// SPA makes right after landing on kaspi.kz/mc/ to figure out which
// merchant(s) the logged-in phone number can manage -- one login can have
// access to more than one seller account (observed live: a phone linked as
// a user on two separate shops returned both merchant uids here). Used at
// connect time so the seller picks from a real list instead of typing an
// ID off their own cabinet header.
export async function listMerchants(sessionCookies: string): Promise<{ uid: string }[]> {
  const res = await fetch('https://mc.shop.kaspi.kz/s/m', { headers: authHeaders(sessionCookies) })
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
export async function fetchCityNames(sessionCookies: string, _merchantId: string): Promise<Record<string, string>> {
  try {
    const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getCities', {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      body: JSON.stringify({
        operationName: 'getCities',
        variables: {},
        query: `query getCities { cities { id name } }`,
      }),
    })
    if (!res.ok) return {}
    const json = await res.json().catch(() => null)
    const cities = json?.data?.cities
    if (!Array.isArray(cities)) return {}
    const result: Record<string, string> = {}
    for (const c of cities) {
      if (c?.id && c?.name) result[String(c.id)] = String(c.name)
    }
    return result
  } catch {
    return {}
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
}

// Full raw offer object for one sku -- the same call the cabinet's own
// «Выставить на продажу» flow makes first (captured live 2026-08-21 from
// the founder's DevTools: POST offers/api/v1/offer/details?m={merchantId}
// with body {sku:["..."]}, response is a bare array of offer objects with
// cities[], availabilities, master fields). Returned UNTYPED on purpose:
// the restore/remove batch upload echoes this object back to Kaspi, and
// retyping it would silently drop fields we don't know about.
export async function fetchOfferDetails(sessionCookies: string, merchantId: string, sku: string): Promise<Record<string, any> | null> {
  const res = await fetch(`https://mc.shop.kaspi.kz/offers/api/v1/offer/details?m=${encodeURIComponent(merchantId)}`, {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({ sku: [sku] }),
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null)
  const item = Array.isArray(json) ? json[0] : (Array.isArray(json?.data) ? json.data[0] : null)
  return item && typeof item === 'object' ? item : null
}

// Reads the seller's own existing catalog -- the endpoint the official
// public Merchant API has no equivalent for. Paginates internally (100 per
// page, confirmed the real endpoint accepts an `l` limit param) until a
// page returns fewer than the limit. sessionExpired follows this module's
// established 401 pattern (see getOrderCounters) -- previously a dead
// session silently produced an EMPTY catalog, which read as "0 товаров"
// in the UI instead of "переподключитесь" (bitten live 2026-08-21).
export async function listCatalogWithStatus(sessionCookies: string, merchantId: string, available = true): Promise<{ offers: CatalogOffer[]; sessionExpired: boolean }> {
  const offers: CatalogOffer[] = []
  const pageSize = 100
  let page = 0
  while (true) {
    const url = `https://mc.shop.kaspi.kz/bff/offer-view/list?m=${encodeURIComponent(merchantId)}&p=${page}&l=${pageSize}&a=${available}`
    const res = await fetch(url, { headers: authHeaders(sessionCookies) })
    if (res.status === 401 || res.status === 403) {
      return { offers, sessionExpired: true }
    }
    if (!res.ok) break
    const json = await res.json().catch(() => null)
    const data = json?.data
    if (!Array.isArray(data) || data.length === 0) break
    for (const item of data) {
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
      })
    }
    if (data.length < pageSize) break
    page += 1
  }
  return { offers, sessionExpired: false }
}

export async function listCatalog(sessionCookies: string, merchantId: string, available = true): Promise<CatalogOffer[]> {
  const { offers } = await listCatalogWithStatus(sessionCookies, merchantId, available)
  return offers
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

export async function getOrderDetail(sessionCookies: string, merchantId: string, orderCode: string): Promise<OrderDetail | null> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrderDetails', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrderDetails',
      variables: { merchantUid: merchantId, orderCode, skipCustomerPhone: true },
      query: GET_ORDER_DETAILS_QUERY,
    }),
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null)
  const d = json?.data?.merchant?.orderDetail
  if (!d) return null
  return {
    code: d.code,
    status: d.status,
    creationTime: d.creationTime,
    totalPrice: Number(d.totalPrice) || 0,
    customerFirstName: d.customer?.firstName ?? '',
    customerLastName: d.customer?.lastName ?? '',
    cityName: d.destination?.city?.name ?? d.warehouse?.city?.name ?? null,
    plannedDeliveryDate: d.delivery?.plannedDeliveryDate ?? null,
    items: mapOrderItems(d.entries),
  }
}

// Real shape confirmed live 2026-08-13 -- the badge counts shown next to
// each status tab in the cabinet's own sidebar (e.g. "Упаковка 2"). Cheaper
// than fetching every status's full order list just to show counts.
export type OrderCounts = Record<string, number>

// sessionExpired is specifically res.status === 401 -- Kaspi's real
// signal that mc-session/mc-sid are no longer valid, distinct from any
// other upstream failure (network error, unexpected shape). Callers use
// this to write kaspi_shop_connections.session_status via
// connection.ts's markSessionExpired, so the reconnect banner (read from
// that column by /api/kaspi-shop/wallet) reflects reality promptly
// instead of only updating when the repricer's own price-push cron
// happens to hit the same 401 (which never runs for a paused connection).
export type OrderCountersResult = { counts: OrderCounts; sessionExpired: boolean }

const GET_ORDER_COUNTERS_QUERY = `query getOrderCounters($merchantUid: String!) {
  merchant(id: $merchantUid) {
    orders { counts { tab count } }
  }
}`

export async function getOrderCounters(sessionCookies: string, merchantId: string): Promise<OrderCountersResult> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrderCounters', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrderCounters',
      variables: { merchantUid: merchantId },
      query: GET_ORDER_COUNTERS_QUERY,
    }),
  })
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.error('kaspi-shop getOrderCounters: upstream not ok', res.status, bodyText.slice(0, 1000))
    return { counts: {}, sessionExpired: res.status === 401 }
  }
  const json = await res.json().catch(() => null)
  const counts = json?.data?.merchant?.orders?.counts
  if (!Array.isArray(counts)) return { counts: {}, sessionExpired: false }
  const result: OrderCounts = {}
  for (const c of counts) result[c.tab] = c.count
  return { counts: result, sessionExpired: false }
}

export type OrdersPage = { orders: Order[]; total: number; sessionExpired: boolean }

// size MUST stay at 10 -- confirmed live 2026-08-13: the real cabinet's own
// SPA always requests size:10, and requesting size:50 (an earlier,
// unconfirmed guess) got a GraphQL "Bad Request" error back from Kaspi's
// backend for at least one status (KASPI_DELIVERY_CARGO_ASSEMBLY), even
// though the same shape with size:10 succeeds. Pagination (page) exists
// because of this limit -- any status with more than 10 orders needs it.
export const PAGE_SIZE = 10

export async function listOrders(sessionCookies: string, merchantId: string, status: string, page = 0): Promise<OrdersPage> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrders',
      variables: {
        merchantUid: merchantId,
        size: PAGE_SIZE,
        page,
        input: { presetFilter: status, orderCode: '', cityId: '' },
        advancedInput: { orderCode: '', phoneNumber: '', productCode: '' },
        withAdvancedOrders: false,
      },
      query: GET_ORDERS_QUERY,
    }),
  })
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.error('kaspi-shop listOrders: upstream not ok', res.status, bodyText.slice(0, 1000))
    return { orders: [], total: 0, sessionExpired: res.status === 401 }
  }
  const json = await res.json().catch(() => null)
  const page_ = json?.data?.merchant?.orders?.orders
  const orders = page_?.orders
  if (!Array.isArray(orders)) {
    console.error('kaspi-shop listOrders: unexpected response shape for status', status, JSON.stringify(json)?.slice(0, 2000))
    return { orders: [], total: 0, sessionExpired: false }
  }
  return {
    total: Number(page_.total) || 0,
    sessionExpired: false,
    orders: orders.map((o: any) => ({
      code: o.code,
      status: o.status,
      customerFirstName: o.customer?.firstName ?? '',
      customerLastName: o.customer?.lastName ?? '',
      totalPrice: Number(o.totalPrice) || 0,
      creationTime: o.creationTime,
      items: mapOrderItems(o.entries),
    })),
  }
}
