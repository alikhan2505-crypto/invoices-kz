// Real endpoints confirmed live 2026-08-13 against merchant 425002
// ("ABIL-SISTERS") -- see docs/superpowers/specs/2026-08-13-kaspi-nkt-api-findings.md.
// Only the "Без привязки" (approvalStatus: CHECK) tab's shape was observed
// with real data; the other 3 tabs' approvalStatus keys are inferred, not
// confirmed, so v1 only ever requests CHECK.
import { authHeaders } from './cabinetApi'

export type PendingProduct = {
  code: string
  name: string
  brand: string | null
  categoryName: string | null
  imageUrl: string | null
}

const PAGE_SIZE = 5

// Real page numbering starts at 1, not 0 -- different from getOrders.
export async function listPendingProducts(
  sessionCookies: string,
  merchantId: string,
  page: number,
  fetchFn: typeof fetch = fetch
): Promise<{ products: PendingProduct[]; hasMore: boolean; sessionExpired: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/bff/pending-products/${merchantId}`, {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({ page, searchTerm: '', pageSize: PAGE_SIZE, approvalStatus: 'CHECK', isMobileApp: false }),
  })
  if (!res.ok) return { products: [], hasMore: false, sessionExpired: res.status === 401 }
  const json = await res.json().catch(() => null)
  const data = json?.data
  if (!Array.isArray(data)) return { products: [], hasMore: false, sessionExpired: false }
  return {
    products: data.map((p: any) => ({
      code: p.code,
      name: p.name,
      brand: p.brand ?? null,
      categoryName: p.category?.name ?? null,
      imageUrl: p.images?.[0]?.medium ?? null,
    })),
    hasMore: data.length === PAGE_SIZE,
    sessionExpired: false,
  }
}

// Real response carries all 4 tabs' counts -- v1 only surfaces CHECK
// (the only tab with a confirmed, functional list view).
export async function getPendingCount(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ count: number; sessionExpired: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/content/pending/mc/product/${merchantId}/count`, {
    headers: authHeaders(sessionCookies),
  })
  if (!res.ok) return { count: 0, sessionExpired: res.status === 401 }
  const json = await res.json().catch(() => null)
  return { count: Number(json?.CHECK) || 0, sessionExpired: false }
}
