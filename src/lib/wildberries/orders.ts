export interface WbOrder {
  orderId: number
  article: string
  createdAt: string
  status: string
}

// Shape follows marketplace-api's documented GET /api/v3/orders/new and
// GET /api/v3/orders as described in official docs/community SDKs -- NOT
// verified live (no seller account exists yet, see Global Constraints).
// Defensive field access throughout: an unrecognized real shape degrades
// to an empty/placeholder value per row, never a thrown error.
export async function fetchWbOrders(token: string): Promise<WbOrder[]> {
  const res = await fetch('https://marketplace-api.wildberries.ru/api/v3/orders?limit=100', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Wildberries orders request failed (HTTP ${res.status})`)

  const data = await res.json().catch(() => null)
  const rows = Array.isArray(data?.orders) ? data.orders : []

  return rows.map((row: any): WbOrder => ({
    orderId: Number(row?.id) || 0,
    article: typeof row?.article === 'string' ? row.article : '—',
    createdAt: typeof row?.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    status: typeof row?.status === 'string' ? row.status : 'unknown',
  })).filter((o: WbOrder) => o.orderId > 0)
}

// POST /api/v3/orders/stickers, documented max 100 orders per request,
// only for orders in assembly ('confirm') or delivery ('complete') status.
// Requests PNG specifically (type=png) -- WB also offers svg/zplv/zplh, but
// PNG needs no further conversion to show/download, unlike Kaspi's own
// waybill flow which needed a PDF merge step this format sidesteps.
export async function fetchWbStickers(token: string, orderIds: number[]): Promise<string[]> {
  if (orderIds.length === 0 || orderIds.length > 100) {
    throw new Error('sticker request must contain 1-100 order ids')
  }
  const res = await fetch('https://marketplace-api.wildberries.ru/api/v3/orders/stickers?type=png&width=58&height=40', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders: orderIds }),
  })
  if (!res.ok) throw new Error(`Wildberries stickers request failed (HTTP ${res.status})`)

  const data = await res.json().catch(() => null)
  const stickers = Array.isArray(data?.stickers) ? data.stickers : []
  return stickers.map((s: any) => typeof s?.file === 'string' ? s.file : '').filter((f: string) => f.length > 0)
}
