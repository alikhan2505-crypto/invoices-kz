// Real endpoint confirmed live 2026-08-14 -- kaspi.kz's own public product
// search, fully unauthenticated. ALSO confirmed live 2026-08-14: Kaspi
// blocks this endpoint from Vercel's production IP range (403, nginx --
// same IP-block class already known from public product-page HTML). The
// actual fetch now happens on a GitHub Actions runner (see
// .github/scripts/kaspi-shop-niche-check.mjs), which delivers the raw
// response to POST /api/kaspi-shop/niches/deliver -- that route calls
// mapNicheResponse below on the raw JSON. See
// docs/superpowers/specs/2026-08-14-kaspi-shop-niches-design.md.
export type NicheSummary = {
  total: number
  priceRanges: { label: string; count: number }[]
  topBrands: { name: string; count: number }[]
  products: { name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null }[]
}

const EMPTY_SUMMARY: NicheSummary = { total: 0, priceRanges: [], topBrands: [], products: [] }

export function mapNicheResponse(json: any): NicheSummary {
  const data = json?.data
  if (!data) return EMPTY_SUMMARY

  const filters = Array.isArray(data.filters) ? data.filters : []
  const priceFilter = filters.find((f: any) => f.id === 'price')
  const brandFilter = filters.find((f: any) => f.id === 'manufacturerName')

  const priceRanges = (priceFilter?.rows || []).map((r: any) => ({ label: r.title, count: Number(r.count) || 0 }))
  const topBrands = (brandFilter?.rows || [])
    .map((r: any) => ({ name: r.title, count: Number(r.count) || 0 }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 5)

  const cards = Array.isArray(data.cards) ? data.cards.slice(0, 12) : []
  const products = cards.map((c: any) => ({
    name: c.title,
    price: Number(c.unitSalePrice) || 0,
    rating: Number(c.rating) || 0,
    reviewsCount: Number(c.reviewsQuantity) || 0,
    brand: c.brand ?? '',
    imageUrl: c.previewImages?.[0]?.medium ?? null,
  }))

  return { total: Number(data.total) || 0, priceRanges, topBrands, products }
}
