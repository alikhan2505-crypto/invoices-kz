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

// Reads the seller's own existing catalog -- the endpoint the official
// public Merchant API has no equivalent for. Paginates internally (100 per
// page, confirmed the real endpoint accepts an `l` limit param) until a
// page returns fewer than the limit.
export async function listCatalog(sessionCookies: string, merchantId: string, available = true): Promise<CatalogOffer[]> {
  const offers: CatalogOffer[] = []
  const pageSize = 100
  let page = 0
  while (true) {
    const url = `https://mc.shop.kaspi.kz/bff/offer-view/list?m=${encodeURIComponent(merchantId)}&p=${page}&l=${pageSize}&a=${available}`
    const res = await fetch(url, { headers: authHeaders(sessionCookies) })
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

const GET_ORDER_COUNTERS_QUERY = `query getOrderCounters($merchantUid: String!) {
  merchant(id: $merchantUid) {
    orders { counts { tab count } }
  }
}`

export async function getOrderCounters(sessionCookies: string, merchantId: string): Promise<OrderCounts> {
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
    return {}
  }
  const json = await res.json().catch(() => null)
  const counts = json?.data?.merchant?.orders?.counts
  if (!Array.isArray(counts)) return {}
  const result: OrderCounts = {}
  for (const c of counts) result[c.tab] = c.count
  return result
}

export type OrdersPage = { orders: Order[]; total: number }

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
    return { orders: [], total: 0 }
  }
  const json = await res.json().catch(() => null)
  const page_ = json?.data?.merchant?.orders?.orders
  const orders = page_?.orders
  if (!Array.isArray(orders)) {
    console.error('kaspi-shop listOrders: unexpected response shape for status', status, JSON.stringify(json)?.slice(0, 2000))
    return { orders: [], total: 0 }
  }
  return {
    total: Number(page_.total) || 0,
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
