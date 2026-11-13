// Поиск и фильтр списка товаров на странице «Демпинг» (P9 из прогона воронки 07.11.2026: у
// магазина на 300 товаров не найти нужный, а все карточки рисуются сразу).

export type FilterableProduct = {
  product_name: string
  brand?: string | null
  kaspi_sku?: string | null
  kaspi_master_sku?: string | null
  enabled: boolean
  available_for_sale?: boolean | null
  held_at_floor?: boolean | null
}

export type ProductFilterKey = 'all' | 'active' | 'paused' | 'floor' | 'offsale'

export const PRODUCT_FILTER_KEYS: ProductFilterKey[] = ['all', 'active', 'paused', 'floor', 'offsale']

// Сколько карточек рисуем сразу и на сколько добавляет «Показать ещё».
export const PRODUCTS_PAGE_SIZE = 48

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/ё/g, 'е')

// null у старых строк available_for_sale = «в продаже» (как везде в боте).
const onSale = (p: FilterableProduct) => p.available_for_sale !== false

export function matchesFilter(p: FilterableProduct, filter: ProductFilterKey): boolean {
  switch (filter) {
    case 'all': return true
    case 'active': return p.enabled && onSale(p)
    case 'paused': return !p.enabled
    case 'floor': return p.enabled && onSale(p) && !!p.held_at_floor
    case 'offsale': return !onSale(p)
  }
}

/** Все слова запроса должны встретиться в названии, бренде или артикуле (порядок не важен). */
export function matchesQuery(p: FilterableProduct, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [p.product_name, p.brand, p.kaspi_sku, p.kaspi_master_sku].map(norm).join(' ')
  return words.every(w => hay.includes(w))
}

export function filterProducts<T extends FilterableProduct>(products: T[], query: string, filter: ProductFilterKey): T[] {
  return products.filter(p => matchesFilter(p, filter) && matchesQuery(p, query))
}

export function filterCounts(products: FilterableProduct[]): Record<ProductFilterKey, number> {
  const out: Record<ProductFilterKey, number> = { all: 0, active: 0, paused: 0, floor: 0, offsale: 0 }
  for (const p of products) for (const k of PRODUCT_FILTER_KEYS) if (matchesFilter(p, k)) out[k]++
  return out
}
