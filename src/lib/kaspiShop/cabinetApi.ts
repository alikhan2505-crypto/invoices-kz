// Authenticated calls to the real Kaspi Магазин cabinet backend, confirmed
// live 2026-08-12 against a real seller account (merchant id 30067228,
// "ИП FIRST PROJECT"). See project memory / the 2026-08-12 findings doc for
// the original trace. Requires session cookies from a completed
// cabinetAuth.submitOtp() login -- merchantId is NOT auto-discovered here
// (no confirmed endpoint for "what merchants can this session access"),
// the seller provides it themselves at connect time (visible in their own
// cabinet header as "ID - {merchantId}").

function authHeaders(sessionCookies: string): Record<string, string> {
  return {
    'x-auth-version': '3',
    'content-type': 'application/json',
    'origin': 'https://kaspi.kz',
    'referer': 'https://kaspi.kz/',
    'cookie': sessionCookies,
  }
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
export type Order = {
  code: string
  status: string
  customerFirstName: string
  customerLastName: string
  totalPrice: number
  creationTime: string
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
}`

export async function listOrders(sessionCookies: string, merchantId: string, status: string): Promise<Order[]> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrders', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'getOrders',
      variables: {
        merchantUid: merchantId,
        size: 50,
        page: 0,
        input: { presetFilter: status, orderCode: '', cityId: '' },
        advancedInput: { orderCode: '', phoneNumber: '', productCode: '' },
        withAdvancedOrders: false,
      },
      query: GET_ORDERS_QUERY,
    }),
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => null)
  const orders = json?.data?.merchant?.orders?.orders?.orders
  if (!Array.isArray(orders)) return []
  return orders.map((o: any) => ({
    code: o.code,
    status: o.status,
    customerFirstName: o.customer?.firstName ?? '',
    customerLastName: o.customer?.lastName ?? '',
    totalPrice: Number(o.totalPrice) || 0,
    creationTime: o.creationTime,
  }))
}
