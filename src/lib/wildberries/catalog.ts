export interface WbProduct {
  nmId: number
  name: string
  price: number
  discount: number
  discountedPrice: number
}

// Field names here follow discounts-prices-api's documented
// GET /api/v2/list/goods/filter response as described in community client
// libraries (Dakword/WBSeller, eslazarev/wildberries-sdk) -- NOT verified
// against a real live response in this build (no seller account exists
// yet). Every field read is defensive (falls back to 0/empty rather than
// throwing) so an unexpected real shape degrades to "couldn't read this
// product" instead of crashing the whole page.
export async function fetchWbProducts(token: string): Promise<WbProduct[]> {
  const res = await fetch('https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=1000', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Wildberries price list request failed (HTTP ${res.status})`)

  const data = await res.json().catch(() => null)
  const rows = Array.isArray(data?.data?.listGoods) ? data.data.listGoods : []

  return rows.map((row: any): WbProduct => ({
    nmId: Number(row?.nmID) || 0,
    name: typeof row?.vendorCode === 'string' ? row.vendorCode : `Товар ${row?.nmID ?? ''}`,
    price: Number(row?.sizes?.[0]?.price) || Number(row?.price) || 0,
    discount: Number(row?.discount) || 0,
    discountedPrice: Number(row?.sizes?.[0]?.discountedPrice) || Number(row?.discountedPrice) || 0,
  })).filter((p: WbProduct) => p.nmId > 0)
}
