// Real endpoint confirmed live 2026-08-14 -- kaspi.kz's own public product
// search, fully unauthenticated (unlike every other kaspiShop lib module,
// this one needs no session cookies or merchantId at all). See
// docs/superpowers/specs/2026-08-14-kaspi-shop-niches-design.md.
export type NicheSummary = {
  total: number
  priceRanges: { label: string; count: number }[]
  topBrands: { name: string; count: number }[]
  products: { name: string; price: number; rating: number; reviewsCount: number; brand: string; imageUrl: string | null }[]
}

const CITY_ID = '750000000' // Almaty -- hardcoded in v1, no city picker

export async function checkNiche(query: string, fetchFn: typeof fetch = fetch): Promise<NicheSummary> {
  const url = `https://kaspi.kz/yml/product-view/pl/filters?text=${encodeURIComponent(query)}&page=0&all=false&fl=true&ui=d&c=${CITY_ID}`
  const res = await fetchFn(url, { headers: { accept: 'application/json, text/*' } })
  if (!res.ok) return { total: 0, priceRanges: [], topBrands: [], products: [] }
  const json = await res.json().catch(() => null)
  const data = json?.data
  if (!data) return { total: 0, priceRanges: [], topBrands: [], products: [] }

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
