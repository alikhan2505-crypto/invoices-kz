import { describe, it, expect } from 'vitest'
import { addDays, snapshotRowsFromSample, buildCollections, COLLECTION_DEFS, type NicheSnapshotRow } from './nicheCollections'

function row(overrides: Partial<NicheSnapshotRow> = {}): NicheSnapshotRow {
  return {
    sku: 'sku-1', name: 'Товар', brand: 'Brand', price: 5000, rating: 4.8,
    reviews_count: 200, sellers_count: 10, category_key: 'sport',
    category_label: 'Спорт и отдых', image_url: null, shop_url: 'https://kaspi.kz/p/x',
    snapshot_date: '2026-08-24', ...overrides,
  }
}

function get(collections: ReturnType<typeof buildCollections>, key: string) {
  const c = collections.find(c => c.key === key)
  if (!c) throw new Error(`collection ${key} missing`)
  return c
}

describe('addDays', () => {
  it('subtracts across month boundaries', () => {
    expect(addDays('2026-09-02', -7)).toBe('2026-08-26')
  })
})

describe('snapshotRowsFromSample', () => {
  const products = [
    { sku: 'a', name: 'A', price: 100, rating: 5, reviewsCount: 10, brand: 'B', imageUrl: null, shopUrl: null },
    { sku: '', name: 'no-sku', price: 1, rating: 1, reviewsCount: 1, brand: '', imageUrl: null, shopUrl: null },
    { sku: 'a', name: 'A-dup', price: 100, rating: 5, reviewsCount: 10, brand: 'B', imageUrl: null, shopUrl: null },
  ]
  it('maps to snake_case rows, drops empty skus, dedupes within the sample (first wins) and never includes sellers_count', () => {
    const rows = snapshotRowsFromSample('sport', 'Спорт и отдых', products, '2026-08-24')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      sku: 'a', name: 'A', brand: 'B', price: 100, rating: 5, reviews_count: 10,
      category_key: 'sport', category_label: 'Спорт и отдых',
      image_url: null, shop_url: null, snapshot_date: '2026-08-24',
    })
    expect('sellers_count' in rows[0]).toBe(false)
  })
})

describe('buildCollections', () => {
  it('returns all 5 collections in COLLECTION_DEFS order even on empty input', () => {
    const collections = buildCollections([], [], '2026-08-24', false)
    expect(collections.map(c => c.key)).toEqual(COLLECTION_DEFS.map(d => d.key))
  })

  it('high-demand sorts by demand score desc and caps at 30', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ sku: `s${i}`, reviews_count: 10 + i * 50 }))
    const c = get(buildCollections(rows, [], '2026-08-24', false), 'high-demand')
    expect(c.products).toHaveLength(30)
    expect(c.products[0].reviewsCount).toBe(10 + 39 * 50)
    expect(c.products[0].score).toBeGreaterThan(c.products[29].score)
  })

  it('cheap-entry keeps only price ≤ 7000 with ≥ 50 reviews', () => {
    const rows = [
      row({ sku: 'ok', price: 6999, reviews_count: 50 }),
      row({ sku: 'expensive', price: 7001, reviews_count: 500 }),
      row({ sku: 'no-reviews', price: 100, reviews_count: 49 }),
    ]
    const c = get(buildCollections(rows, [], '2026-08-24', false), 'cheap-entry')
    expect(c.products.map(p => p.sku)).toEqual(['ok'])
  })

  it('weak-competitors: reviews ≥ 100 AND rating ≤ 4.2, sorted by reviews desc', () => {
    const rows = [
      row({ sku: 'weak-big', rating: 3.9, reviews_count: 900 }),
      row({ sku: 'weak-small', rating: 4.2, reviews_count: 100 }),
      row({ sku: 'good-rating', rating: 4.3, reviews_count: 900 }),
      row({ sku: 'few-reviews', rating: 2.0, reviews_count: 99 }),
    ]
    const c = get(buildCollections(rows, [], '2026-08-24', false), 'weak-competitors')
    expect(c.products.map(p => p.sku)).toEqual(['weak-big', 'weak-small'])
  })

  it('few-sellers: sellers_count ≤ 3 non-null AND reviews ≥ 30; null sellers excluded', () => {
    const rows = [
      row({ sku: 'free-niche', sellers_count: 1, reviews_count: 30 }),
      row({ sku: 'crowded', sellers_count: 4, reviews_count: 500 }),
      row({ sku: 'unknown-sellers', sellers_count: null, reviews_count: 500 }),
      row({ sku: 'no-demand', sellers_count: 0, reviews_count: 29 }),
    ]
    const c = get(buildCollections(rows, [], '2026-08-24', false), 'few-sellers')
    expect(c.products.map(p => p.sku)).toEqual(['free-niche'])
    expect(c.products[0].sellersCount).toBe(1)
  })

  it('demand-spike is pending with no products when hasHistory=false', () => {
    const c = get(buildCollections([row()], [], '2026-08-24', false), 'demand-spike')
    expect(c.pending).toBe(true)
    expect(c.products).toEqual([])
  })

  it('demand-spike qualifies on Δ≥20 AND ≥1.5×baseline, sets reviewsDelta7d, sorts by delta desc', () => {
    const latest = [
      row({ sku: 'spike-big', reviews_count: 300 }),   // base 100: Δ200, ×3
      row({ sku: 'spike-small', reviews_count: 45 }),  // base 20: Δ25, ×2.25
      row({ sku: 'slow-growth', reviews_count: 1000 }), // base 990: Δ10 < 20
      row({ sku: 'big-but-flat', reviews_count: 900 }), // base 700: Δ200 but ×1.29 < 1.5
      row({ sku: 'no-baseline', reviews_count: 500 }),
    ]
    const baseline = [
      { sku: 'spike-big', reviews_count: 100, snapshot_date: '2026-08-17' },
      { sku: 'spike-small', reviews_count: 20, snapshot_date: '2026-08-17' },
      { sku: 'slow-growth', reviews_count: 990, snapshot_date: '2026-08-17' },
      { sku: 'big-but-flat', reviews_count: 700, snapshot_date: '2026-08-17' },
    ]
    const c = get(buildCollections(latest, baseline, '2026-08-24', true), 'demand-spike')
    expect(c.pending).toBeUndefined()
    expect(c.products.map(p => p.sku)).toEqual(['spike-big', 'spike-small'])
    expect(c.products[0].reviewsDelta7d).toBe(200)
  })

  it('demand-spike picks the baseline snapshot closest to latest−7d when several exist', () => {
    const latest = [row({ sku: 's', reviews_count: 300 })]
    const baseline = [
      { sku: 's', reviews_count: 10, snapshot_date: '2026-08-16' },  // 8d away from latest, 1d from target
      { sku: 's', reviews_count: 250, snapshot_date: '2026-08-17' }, // exactly 7d: closest -> Δ50, ×1.2 -> NOT qualified
    ]
    const c = get(buildCollections(latest, baseline, '2026-08-24', true), 'demand-spike')
    expect(c.products).toEqual([])
  })

  it('reviewsDelta7d is null outside demand-spike', () => {
    const c = get(buildCollections([row()], [], '2026-08-24', false), 'high-demand')
    expect(c.products[0].reviewsDelta7d).toBeNull()
  })
})
