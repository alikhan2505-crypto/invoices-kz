// Pure rules for the «Витрина ниш» collections on /kaspi-shop/niches --
// operates on plain rows from kaspi_shop_niche_product_snapshots (written
// by the trends deliver route from the same GH Actions samples that feed
// kaspi_shop_niche_trends, plus a sellers-count pass through the
// repricer's offer-view endpoint). Collections are computed at READ time
// (GET /api/kaspi-shop/niches/collections), not precomputed in deliver:
// every threshold below will need tuning once real distributions are
// visible, and on-read compute makes tuning a deploy instead of a
// wait-for-next-cron cycle. Honesty rule: we only surface metrics we
// actually measure (отзывы/рейтинг/продавцы/рост отзывов) -- no invented
// sales or revenue estimates a la zoomia.
import { productDemandScore } from './nicheTrends'
import type { NicheSummary } from './niches'

export type CollectionKey = 'high-demand' | 'cheap-entry' | 'weak-competitors' | 'few-sellers' | 'demand-spike'

export type NicheSnapshotRow = {
  sku: string
  name: string
  brand: string
  price: number
  rating: number
  reviews_count: number
  sellers_count: number | null
  category_key: string
  category_label: string
  image_url: string | null
  shop_url: string | null
  snapshot_date: string // 'YYYY-MM-DD'
}

// sellers_count deliberately omitted: the deliver route upserts search
// samples FIRST and sellers counts arrive in a later POST of the same
// run -- if the upsert payload carried sellers_count: null, a same-day
// re-run would wipe counts already delivered.
export type NicheSnapshotInsert = Omit<NicheSnapshotRow, 'sellers_count'>

export type CollectionProduct = {
  sku: string
  name: string
  brand: string
  price: number
  rating: number
  reviewsCount: number
  sellersCount: number | null
  reviewsDelta7d: number | null
  score: number
  imageUrl: string | null
  shopUrl: string | null
}

export type Collection = {
  key: CollectionKey
  label: string
  description: string
  pending?: boolean
  products: CollectionProduct[]
}

export const COLLECTION_DEFS: { key: CollectionKey; label: string; description: string }[] = [
  { key: 'high-demand', label: 'Высокий спрос', description: 'Самый высокий индекс спроса: отзывы как прокси продаж, взвешенные рейтингом.' },
  { key: 'cheap-entry', label: 'Дешёвый вход', description: 'Ходовые товары до 7 000 ₸ — минимальный капитал для старта.' },
  { key: 'weak-competitors', label: 'Слабые конкуренты', description: 'Покупают много, но рейтинг низкий — шанс забрать спрос качеством.' },
  { key: 'few-sellers', label: 'Мало продавцов', description: 'Спрос есть, а продавцов три или меньше — почти свободная ниша.' },
  { key: 'demand-spike', label: 'Всплеск спроса', description: 'Отзывы выросли минимум в полтора раза за неделю — спрос разгоняется сейчас.' },
]

export const COLLECTION_LIMIT = 30
export const CHEAP_ENTRY_MAX_PRICE = 7000
export const CHEAP_ENTRY_MIN_REVIEWS = 50
export const WEAK_COMPETITORS_MIN_REVIEWS = 100
export const WEAK_COMPETITORS_MAX_RATING = 4.2
export const FEW_SELLERS_MAX_SELLERS = 3
export const FEW_SELLERS_MIN_REVIEWS = 30
export const SPIKE_MIN_DELTA = 20
export const SPIKE_MIN_RATIO = 1.5

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)
}

export function snapshotRowsFromSample(
  categoryKey: string,
  categoryLabel: string,
  products: NicheSummary['products'],
  snapshotDate: string,
): NicheSnapshotInsert[] {
  const seen = new Set<string>()
  const rows: NicheSnapshotInsert[] = []
  for (const p of products) {
    // Empty skus can't key a snapshot; in-sample dupes would make the
    // batched upsert hit the same (sku, date) twice in one statement,
    // which Postgres rejects ("cannot affect row a second time").
    if (!p.sku || seen.has(p.sku)) continue
    seen.add(p.sku)
    rows.push({
      sku: p.sku, name: p.name, brand: p.brand || '',
      price: p.price, rating: p.rating, reviews_count: p.reviewsCount,
      category_key: categoryKey, category_label: categoryLabel,
      image_url: p.imageUrl, shop_url: p.shopUrl,
      snapshot_date: snapshotDate,
    })
  }
  return rows
}

type Scored = { row: NicheSnapshotRow; score: number }

function toProduct(s: Scored, reviewsDelta7d: number | null = null): CollectionProduct {
  return {
    sku: s.row.sku, name: s.row.name, brand: s.row.brand,
    price: s.row.price, rating: s.row.rating, reviewsCount: s.row.reviews_count,
    sellersCount: s.row.sellers_count, reviewsDelta7d, score: s.score,
    imageUrl: s.row.image_url, shopUrl: s.row.shop_url,
  }
}

export function buildCollections(
  latestRows: NicheSnapshotRow[],
  baselineRows: Pick<NicheSnapshotRow, 'sku' | 'reviews_count' | 'snapshot_date'>[],
  latestDate: string,
  hasHistory: boolean,
): Collection[] {
  const scored: Scored[] = latestRows.map(r => ({
    row: r,
    score: productDemandScore({ rating: r.rating, reviewsCount: r.reviews_count }),
  }))
  const byScore = [...scored].sort((a, b) => b.score - a.score)

  // Per-SKU baseline: the snapshot closest to latest−7d within whatever
  // window the caller queried (6–8 days by the collections route). Equal
  // distance (e.g. −6 vs −8 with no −7) breaks toward the OLDER date --
  // without a deterministic tie-break the displayed delta would depend
  // on unspecified DB row order and could differ between requests.
  const target = addDays(latestDate, -7)
  const baseline = new Map<string, { reviews: number; dist: number; date: string }>()
  for (const b of baselineRows) {
    const dist = Math.abs(dayDiff(b.snapshot_date, target))
    const cur = baseline.get(b.sku)
    if (!cur || dist < cur.dist || (dist === cur.dist && b.snapshot_date < cur.date)) {
      baseline.set(b.sku, { reviews: b.reviews_count, dist, date: b.snapshot_date })
    }
  }

  function spike(): Collection {
    const def = COLLECTION_DEFS.find(d => d.key === 'demand-spike')!
    if (!hasHistory) return { ...def, pending: true, products: [] }
    const products = scored
      .flatMap(s => {
        const base = baseline.get(s.row.sku)
        if (!base) return []
        const delta = s.row.reviews_count - base.reviews
        if (delta < SPIKE_MIN_DELTA) return []
        if (s.row.reviews_count < SPIKE_MIN_RATIO * base.reviews) return []
        return [toProduct(s, delta)]
      })
      .sort((a, b) => (b.reviewsDelta7d ?? 0) - (a.reviewsDelta7d ?? 0))
      .slice(0, COLLECTION_LIMIT)
    return { ...def, products }
  }

  return COLLECTION_DEFS.map(def => {
    switch (def.key) {
      case 'high-demand':
        return { ...def, products: byScore.slice(0, COLLECTION_LIMIT).map(s => toProduct(s)) }
      case 'cheap-entry':
        return {
          ...def,
          products: byScore
            .filter(s => s.row.price <= CHEAP_ENTRY_MAX_PRICE && s.row.reviews_count >= CHEAP_ENTRY_MIN_REVIEWS)
            .slice(0, COLLECTION_LIMIT).map(s => toProduct(s)),
        }
      case 'weak-competitors':
        return {
          ...def,
          products: scored
            .filter(s => s.row.reviews_count >= WEAK_COMPETITORS_MIN_REVIEWS && s.row.rating <= WEAK_COMPETITORS_MAX_RATING)
            .sort((a, b) => b.row.reviews_count - a.row.reviews_count)
            .slice(0, COLLECTION_LIMIT).map(s => toProduct(s)),
        }
      case 'few-sellers':
        return {
          ...def,
          products: byScore
            .filter(s => s.row.sellers_count !== null && s.row.sellers_count <= FEW_SELLERS_MAX_SELLERS && s.row.reviews_count >= FEW_SELLERS_MIN_REVIEWS)
            .slice(0, COLLECTION_LIMIT).map(s => toProduct(s)),
        }
      case 'demand-spike':
        return spike()
    }
  })
}
