# Kaspi Ниши: витрина подборок — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the «Ниши» page from keyword-search-only into a витрина of 5 curated opportunity collections (высокий спрос, дешёвый вход, слабые конкуренты, мало продавцов, всплеск спроса), computed from a new daily product-snapshot history fed by the existing niche-trends GitHub Actions cron.

**Architecture:** The existing `kaspi-shop-niche-trends` cron deepens its sampling (3 pages/category ≈ 650 products) and adds a per-SKU sellers-count pass via the repricer's proven `offer-view/offers/{sku}` endpoint. The deliver route writes daily rows into a new `kaspi_shop_niche_product_snapshots` table (400-day retention). Collections are computed **on read** in a new GET route from the latest snapshot + a ~7-day-old baseline (approach B from the spec: thresholds tune via deploy, no cron wait). Trends math stays fed by page-0 samples only — its velocity continuity must not change.

**Tech Stack:** Next.js App Router API routes, Supabase (service-role, RLS no-policies), GitHub Actions `.mjs` relay scripts, vitest, existing `nav-glass`/`--nav-*` visual system.

**Spec:** `docs/superpowers/specs/2026-08-23-kaspi-niches-collections-design.md`

## Global Constraints

- Kaspi 403s its public endpoints from Vercel IPs — ALL Kaspi fetches happen in the GH Actions script, never in a Vercel route.
- Trends (`kaspi_shop_niche_trends` upsert + velocity diff) run **only for page-0 results**. Feeding them merged pages would distort velocity for one cycle. Missing `page` field = page 0 (backward compat).
- Honesty rule: no fabricated «продажи/выручка» anywhere in UI copy — only real metrics (отзывы, рейтинг, продавцы, рост отзывов, индекс спроса).
- The category list is deliberately duplicated between `nicheTrends.ts` and the `.mjs` script (GH scripts can't import TS). This plan does NOT touch the list; don't "fix" the duplication.
- v1 thresholds (constants in `nicheCollections.ts`, server-side only): COLLECTION_LIMIT=30, CHEAP_ENTRY_MAX_PRICE=7000, CHEAP_ENTRY_MIN_REVIEWS=50, WEAK_COMPETITORS_MIN_REVIEWS=100, WEAK_COMPETITORS_MAX_RATING=4.2, FEW_SELLERS_MAX_SELLERS=3, FEW_SELLERS_MIN_REVIEWS=30, SPIKE_MIN_DELTA=20, SPIKE_MIN_RATIO=1.5, baseline window = 6–8 days before latest snapshot.
- Migration SQL (applied in Task 1, name `kaspi_shop_niche_product_snapshots`):

```sql
create table kaspi_shop_niche_product_snapshots (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  brand text not null default '',
  price numeric not null default 0,
  rating numeric not null default 0,
  reviews_count integer not null default 0,
  sellers_count integer,
  category_key text not null,
  category_label text not null,
  image_url text,
  shop_url text,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  unique (sku, snapshot_date)
);
create index kaspi_shop_niche_product_snapshots_date_idx
  on kaspi_shop_niche_product_snapshots (snapshot_date);
alter table kaspi_shop_niche_product_snapshots enable row level security;
-- RLS with NO policies: service-role only, same as kaspi_shop_niche_trends
```

- Deviation from spec, deliberate: within one run a SKU seen in two categories keeps the LAST category seen (plain upsert semantics), not the first — same product, same numbers, category label is cosmetic. Re-runs the same day refresh numbers. `sellers_count` is intentionally NOT in the upsert payload so a re-run never nulls out an already-delivered sellers count.

---

### Task 1: Migration

**Files:** none in repo (DB-only; SQL recorded above and in the spec).

**Interfaces:**
- Produces: table `kaspi_shop_niche_product_snapshots` exactly as in Global Constraints.

- [ ] **Step 1: Apply the migration** via Supabase MCP `apply_migration` on the invoices.kz project (find project id via `list_projects` if unknown), migration name `kaspi_shop_niche_product_snapshots`, SQL from Global Constraints verbatim.

- [ ] **Step 2: Verify** via `execute_sql`:

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_name = 'kaspi_shop_niche_product_snapshots' order by ordinal_position;
```

Expected: 14 columns; `sellers_count` nullable integer; `snapshot_date` date not-null. Also verify RLS:

```sql
select relrowsecurity from pg_class where relname = 'kaspi_shop_niche_product_snapshots';
```

Expected: `true`.

No commit (no repo files changed).

---

### Task 2: Pure collections lib (`nicheCollections.ts`) — TDD

**Files:**
- Create: `src/lib/kaspiShop/nicheCollections.ts`
- Test: `src/lib/kaspiShop/nicheCollections.test.ts`

**Interfaces:**
- Consumes: `productDemandScore` from `./nicheTrends`, `NicheSummary` type from `./niches`.
- Produces (used by Tasks 3, 4, 6):

```ts
export type CollectionKey = 'high-demand' | 'cheap-entry' | 'weak-competitors' | 'few-sellers' | 'demand-spike'
export type NicheSnapshotRow = { sku: string; name: string; brand: string; price: number; rating: number; reviews_count: number; sellers_count: number | null; category_key: string; category_label: string; image_url: string | null; shop_url: string | null; snapshot_date: string }
export type NicheSnapshotInsert = Omit<NicheSnapshotRow, 'sellers_count'>
export type CollectionProduct = { sku: string; name: string; brand: string; price: number; rating: number; reviewsCount: number; sellersCount: number | null; reviewsDelta7d: number | null; score: number; imageUrl: string | null; shopUrl: string | null }
export type Collection = { key: CollectionKey; label: string; description: string; pending?: boolean; products: CollectionProduct[] }
export const COLLECTION_DEFS: { key: CollectionKey; label: string; description: string }[]
export function addDays(dateStr: string, days: number): string
export function snapshotRowsFromSample(categoryKey: string, categoryLabel: string, products: NicheSummary['products'], snapshotDate: string): NicheSnapshotInsert[]
export function buildCollections(latestRows: NicheSnapshotRow[], baselineRows: Pick<NicheSnapshotRow, 'sku' | 'reviews_count' | 'snapshot_date'>[], latestDate: string, hasHistory: boolean): Collection[]
```

- [ ] **Step 1: Write the failing tests** — `src/lib/kaspiShop/nicheCollections.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/kaspiShop/nicheCollections.test.ts`
Expected: FAIL — module `./nicheCollections` not found.

- [ ] **Step 3: Implement** `src/lib/kaspiShop/nicheCollections.ts`:

```ts
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
  // window the caller queried (6–8 days by the collections route).
  const target = addDays(latestDate, -7)
  const baseline = new Map<string, { reviews: number; dist: number }>()
  for (const b of baselineRows) {
    const dist = Math.abs(dayDiff(b.snapshot_date, target))
    const cur = baseline.get(b.sku)
    if (!cur || dist < cur.dist) baseline.set(b.sku, { reviews: b.reviews_count, dist })
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/lib/kaspiShop/nicheCollections.test.ts`
Expected: all tests PASS. Also run `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaspiShop/nicheCollections.ts src/lib/kaspiShop/nicheCollections.test.ts
git commit -m "feat(kaspi-shop): pure collection rules for the Ниши витрина"
```

---

### Task 3: Deliver route — write snapshots, accept pages and offer counts

**Files:**
- Modify: `src/app/api/kaspi-shop/niches/trends/deliver/route.ts`

**Interfaces:**
- Consumes: `snapshotRowsFromSample`, `NicheSnapshotInsert` from `@/lib/kaspiShop/nicheCollections` (Task 2); existing `mapCategorySample`/`productDemandScore`/`categoryDemandScore`.
- Produces: POST contract used by Task 5's script:
  - `{ results: { categoryKey, categoryLabel, page?: number, upstreamStatus, upstreamBodyText }[] }` — every OK result upserts snapshot rows for today; trends upsert runs only when `(page ?? 0) === 0`. Response `{ ok, upserted, failed }` (upserted counts processed results, as before).
  - `{ offerCounts: { sku: string, sellersCount: number }[] }` (may be empty array) — updates today's rows' `sellers_count`, then runs the 400-day retention delete. Response `{ ok, updated, updateFailed }`.

- [ ] **Step 1: Rewrite the route.** Full new file content:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapCategorySample, productDemandScore, categoryDemandScore } from '@/lib/kaspiShop/nicheTrends'
import { snapshotRowsFromSample } from '@/lib/kaspiShop/nicheCollections'

// The offerCounts branch loops up to 150 per-SKU updates in one request
// (the script chunks them) -- default serverless timeout is too tight
// for that plus the retention delete.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CategoryResult = {
  categoryKey: string
  categoryLabel: string
  // Which search page this result is (0-based). Older script versions
  // never sent it -- missing means page 0, keeping the rollout window
  // backward compatible.
  page?: number
  upstreamStatus: number
  upstreamBodyText: string
}

type OfferCount = { sku: string; sellersCount: number }

const SNAPSHOT_RETENTION_DAYS = 400

// Delivery target for the kaspi-shop-niche-trends GitHub Actions
// workflow -- same relay shape as /api/kaspi-shop/niches/deliver (a
// cron-secret-authenticated POST from the GH Actions runner, since Kaspi
// blocks its public search endpoint from Vercel's IPs). One workflow run
// now makes SEVERAL posts here instead of one: search results chunked
// (54 raw page bodies would blow Vercel's ~4.5MB request-body limit),
// then the per-SKU sellers counts as a final small POST. Each result is
// processed independently, so chunking is idempotent-safe.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  // ---- Offers branch: sellers counts for today's snapshot rows. ----
  // An empty array is legal -- the script always sends at least one
  // offerCounts POST so the retention delete below runs daily even when
  // the whole offers pass failed.
  if (Array.isArray(body?.offerCounts)) {
    const today = new Date().toISOString().slice(0, 10)
    let updated = 0
    let updateFailed = 0
    for (const oc of body.offerCounts as OfferCount[]) {
      if (!oc?.sku || typeof oc.sellersCount !== 'number' || oc.sellersCount < 0) { updateFailed++; continue }
      const { error } = await supabase
        .from('kaspi_shop_niche_product_snapshots')
        .update({ sellers_count: Math.floor(oc.sellersCount) })
        .eq('sku', String(oc.sku))
        .eq('snapshot_date', today)
      if (error) {
        console.error(`kaspi-shop niche-trends deliver: sellers update failed for sku=${oc.sku}:`, error.message)
        updateFailed++
      } else {
        updated++
      }
    }

    const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86400000).toISOString().slice(0, 10)
    const { error: retentionError } = await supabase
      .from('kaspi_shop_niche_product_snapshots')
      .delete()
      .lt('snapshot_date', cutoff)
    if (retentionError) {
      console.error('kaspi-shop niche-trends deliver: retention delete failed:', retentionError.message)
    }

    return NextResponse.json({ ok: true, updated, updateFailed })
  }

  // ---- Search-results branch (chunked). ----
  const results = Array.isArray(body?.results) ? (body.results as CategoryResult[]) : []
  if (results.length === 0) return NextResponse.json({ error: 'results обязателен' }, { status: 400 })

  const snapshotDate = new Date().toISOString().slice(0, 10)
  let upserted = 0
  let failed = 0

  for (const r of results) {
    const categoryKey = r?.categoryKey
    const categoryLabel = r?.categoryLabel
    if (!categoryKey || !categoryLabel) { failed++; continue }

    // A failed/blocked fetch for ONE page must not wipe out anything
    // previously cached -- leave it, retry next run (same philosophy as
    // the other Kaspi Shop crons).
    if (r.upstreamStatus < 200 || r.upstreamStatus >= 300) {
      console.error(`kaspi-shop niche-trends deliver: category=${categoryKey} page=${r.page ?? 0} upstream HTTP ${r.upstreamStatus}, body: ${String(r.upstreamBodyText).slice(0, 300)}`)
      failed++
      continue
    }

    const parsed = (() => { try { return JSON.parse(r.upstreamBodyText) } catch { return null } })()
    if (!parsed) {
      console.error(`kaspi-shop niche-trends deliver: category=${categoryKey} page=${r.page ?? 0} non-JSON response, body: ${String(r.upstreamBodyText).slice(0, 300)}`)
      failed++
      continue
    }

    const sample = mapCategorySample(parsed)

    // Every delivered page feeds the snapshot history (the витрина's raw
    // material). A snapshot failure is logged but doesn't fail the
    // result -- the trends upsert below is independent of it.
    const snapshotRows = snapshotRowsFromSample(categoryKey, categoryLabel, sample.products, snapshotDate)
    if (snapshotRows.length > 0) {
      const { error: snapshotError } = await supabase
        .from('kaspi_shop_niche_product_snapshots')
        .upsert(snapshotRows, { onConflict: 'sku,snapshot_date' })
      if (snapshotError) {
        console.error(`kaspi-shop niche-trends deliver: snapshot upsert failed for category=${categoryKey} page=${r.page ?? 0}:`, snapshotError.message)
      }
    }

    // Trends: page-0 only. The velocity diff below compares against the
    // cached total_reviews of the SAME page-0 sample size -- feeding it
    // deeper pages would distort velocity for one cycle and silently
    // change what the number means.
    if ((r.page ?? 0) !== 0) { upserted++; continue }

    const totalReviews = sample.products.reduce((sum, p) => sum + Math.max(0, p.reviewsCount), 0)

    const { data: existing } = await supabase
      .from('kaspi_shop_niche_trends')
      .select('total_reviews')
      .eq('category_key', categoryKey)
      .maybeSingle()

    // No prior snapshot -> 0 growth (see categoryDemandScore's own
    // comment for why this must never default to totalReviews itself).
    const reviewGrowth = existing ? Math.max(0, totalReviews - existing.total_reviews) : 0
    const demandScore = categoryDemandScore(sample.products, reviewGrowth)
    const products = sample.products.map(p => ({ ...p, score: productDemandScore(p) }))

    const { error } = await supabase.from('kaspi_shop_niche_trends').upsert({
      category_key: categoryKey,
      category_label: categoryLabel,
      demand_score: demandScore,
      total_reviews: totalReviews,
      prev_total_reviews: existing?.total_reviews ?? 0,
      product_count: products.length,
      products,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'category_key' })

    if (error) {
      console.error(`kaspi-shop niche-trends deliver: upsert failed for category=${categoryKey}:`, error.message)
      failed++
    } else {
      upserted++
    }
  }

  return NextResponse.json({ ok: true, upserted, failed })
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — clean. Run: `npx vitest run` — all existing tests still pass (this route has no unit tests; its pure parts are covered by Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/niches/trends/deliver/route.ts
git commit -m "feat(kaspi-shop): deliver route writes niche product snapshots, accepts pages + offer counts"
```

---

### Task 4: Collections API route

**Files:**
- Create: `src/app/api/kaspi-shop/niches/collections/route.ts`

**Interfaces:**
- Consumes: `buildCollections`, `addDays`, `NicheSnapshotRow` from `@/lib/kaspiShop/nicheCollections` (Task 2).
- Produces (consumed by Task 6's UI): `GET /api/kaspi-shop/niches/collections` (Bearer auth, admin only) → `{ computedAt: string | null, collections: Collection[] }`. `computedAt: null` + `collections: []` when no snapshots exist yet.

- [ ] **Step 1: Create the route.** Full file content:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCollections, addDays, type NicheSnapshotRow } from '@/lib/kaspiShop/nicheCollections'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Same admin gate as the sibling trends route: snapshots are global
// shared Kaspi catalog data (no owner column, RLS with no policies,
// service-role only) and the whole «Ниши» page is admin-only today.
async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// Collections are computed here at read time from the raw snapshot
// history (see nicheCollections.ts's header for why not precomputed in
// deliver). Volume is trivial: one day's snapshot is ~650 rows.
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: latestRow, error: latestError } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    console.error('kaspi-shop niches collections: latest-date fetch failed:', latestError.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  // No snapshots at all yet (before the first post-deploy cron run) --
  // an empty-but-valid state, same convention as the trends route.
  if (!latestRow) return NextResponse.json({ computedAt: null, collections: [] })

  const latestDate = latestRow.snapshot_date as string

  const { data: latest, error: rowsError } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('*')
    .eq('snapshot_date', latestDate)
    .limit(2000)

  if (rowsError) {
    console.error('kaspi-shop niches collections: rows fetch failed:', rowsError.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  // Spike baseline: snapshots 6-8 days older than the latest one; the
  // lib picks, per SKU, whichever is closest to exactly 7 days back.
  const { data: baseline, error: baselineError } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('sku, reviews_count, snapshot_date')
    .gte('snapshot_date', addDays(latestDate, -8))
    .lte('snapshot_date', addDays(latestDate, -6))
    .limit(5000)

  if (baselineError) {
    console.error('kaspi-shop niches collections: baseline fetch failed:', baselineError.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  // «Всплеск спроса» stays in its honest "копим данные" pending state
  // until history reaches at least 6 days back from the latest snapshot.
  const { data: historyProbe } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('id')
    .lte('snapshot_date', addDays(latestDate, -6))
    .limit(1)

  const collections = buildCollections(
    (latest || []) as NicheSnapshotRow[],
    (baseline || []) as Pick<NicheSnapshotRow, 'sku' | 'reviews_count' | 'snapshot_date'>[],
    latestDate,
    (historyProbe || []).length > 0,
  )

  return NextResponse.json({ computedAt: latestDate, collections })
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — clean. Run: `npm run build` — compiles, new route listed in output.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kaspi-shop/niches/collections/route.ts
git commit -m "feat(kaspi-shop): collections API computing the Ниши витрина from snapshots"
```

---

### Task 5: Cron script — pagination, sellers pass, chunked delivery

**Files:**
- Modify: `.github/scripts/kaspi-shop-niche-trends.mjs` (full rewrite below)
- Modify: `.github/workflows/kaspi-shop-niche-trends.yml` (timeout only)

**Interfaces:**
- Consumes: Task 3's deliver contract (`results` with `page`, `offerCounts`, empty-array-legal).
- Produces: the daily data both routes read.

- [ ] **Step 1: Rewrite the script.** Full new content of `.github/scripts/kaspi-shop-niche-trends.mjs`:

```js
#!/usr/bin/env node
// Runs from the GitHub Actions runner, not Vercel -- same reason as
// kaspi-shop-niche-check.mjs: Kaspi returns a persistent HTTP 403 (nginx)
// to /yml/product-view/pl/filters from both Vercel's and a bare GitHub
// Actions fetch's IP ranges. The header sets below are copied verbatim
// from the proven-working niche-check (search) and price-check (offers)
// scripts -- reused as-is rather than re-derived.
//
// One run now does THREE passes:
//   1. Search: every category in KASPI_TRENDING_CATEGORIES x 3 pages
//      (deeper sampling for the «Витрина ниш» collections; page 0 alone
//      keeps feeding the trends math server-side).
//   2. Deliver search results in chunks of 18 page-results per POST --
//      54 raw bodies in one POST would blow Vercel's ~4.5MB body limit.
//   3. Sellers: for every unique SKU seen, one offer-view call (the
//      repricer's proven per-SKU offers endpoint) -> sellers count,
//      delivered as final offerCounts POSTs. Always sends at least one
//      offerCounts POST (even empty) so the server-side retention
//      delete runs daily.
//
// KASPI_TRENDING_CATEGORIES here is a duplicate of the list in
// src/lib/kaspiShop/nicheTrends.ts -- GitHub Actions scripts are plain
// .mjs and not part of the Next.js/TS build, so they can't import that
// file directly (same precedent as CITY_ID being duplicated across the
// niche-check/price-check scripts). Keep both lists in sync.

const baseUrl = process.env.BASE_URL || 'https://www.invoices.kz'
const secret = process.env.KASPI_SHOP_CRON_SECRET

const CITY_ID = '750000000' // Almaty -- same as the other Kaspi Shop scripts, no city picker
const REQUEST_DELAY_MS = 500 // throttle between search fetches
const OFFERS_DELAY_MS = 300 // throttle between offer-view fetches (~650 SKUs -> ~8 min pass)
const OFFERS_LIMIT = 50 // covers every real product observed live (max seen: 30 offers)
const PAGES_PER_CATEGORY = 3
const DELIVER_CHUNK_SIZE = 18 // page-results per deliver POST, keeps bodies well under Vercel's limit
const OFFER_COUNTS_CHUNK_SIZE = 150 // sellers counts per POST, matches the route's maxDuration budget
const MAX_OFFER_SKUS = 800 // hard safety cap on the sellers pass

const KASPI_TRENDING_CATEGORIES = [
  { key: 'beauty-health', label: 'Красота и здоровье' },
  { key: 'pharmacy', label: 'Аптека' },
  { key: 'home-garden', label: 'Товары для дома и дачи' },
  { key: 'appliances', label: 'Бытовая техника' },
  { key: 'clothing', label: 'Одежда' },
  { key: 'shoes', label: 'Обувь' },
  { key: 'phones-gadgets', label: 'Телефоны и гаджеты' },
  { key: 'computers', label: 'Ноутбуки и компьютеры' },
  { key: 'kids', label: 'Детские товары' },
  { key: 'accessories', label: 'Аксессуары' },
  { key: 'furniture', label: 'Мебель' },
  { key: 'sport', label: 'Спорт и отдых' },
  { key: 'auto', label: 'Автотовары' },
  { key: 'construction', label: 'Строительство и ремонт' },
  { key: 'pets', label: 'Зоотовары' },
  { key: 'books-hobby', label: 'Книги и хобби' },
  { key: 'jewelry-watches', label: 'Часы и украшения' },
  { key: 'office', label: 'Канцтовары и офис' },
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchCategoryPage(label, page) {
  const url = `https://kaspi.kz/yml/product-view/pl/filters?text=${encodeURIComponent(label)}&page=${page}&all=false&fl=true&ui=d&c=${CITY_ID}`
  const searchPageUrl = `https://kaspi.kz/shop/search/?text=${encodeURIComponent(label)}`
  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json, text/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: searchPageUrl,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    })
    return { upstreamStatus: res.status, upstreamBodyText: await res.text() }
  } catch (err) {
    return { upstreamStatus: 0, upstreamBodyText: String(err) }
  }
}

// Card ids from a raw search body -- same fields the server-side parser
// (mapNicheResponse) keys products on, extracted here only to know which
// SKUs the sellers pass should visit.
function extractSkus(bodyText) {
  try {
    const json = JSON.parse(bodyText)
    const cards = Array.isArray(json?.data?.cards) ? json.data.cards : []
    return cards.map(c => String(c.id ?? c.configSku ?? '')).filter(Boolean)
  } catch {
    return []
  }
}

// Sellers count for one SKU via kaspi.kz/yml/offer-view/offers/{sku} --
// endpoint, headers and offer-validity filter copied verbatim from
// kaspi-shop-price-check.mjs (the proven-working repricer path). Returns
// null on any failure: the SKU then simply carries no sellers count
// today and drops out of the «Мало продавцов» collection only.
async function fetchSellersCount(sku) {
  const productPageUrl = `https://kaspi.kz/shop/p/-${encodeURIComponent(sku)}/?c=${CITY_ID}`
  try {
    const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${encodeURIComponent(sku)}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/*',
        'content-type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: productPageUrl,
        Origin: 'https://kaspi.kz',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ cityId: CITY_ID, id: sku, merchantUID: [], limit: OFFERS_LIMIT, page: 0, sortOption: 'PRICE' }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const offers = Array.isArray(json.offers) ? json.offers : []
    return offers.filter(o => o && o.merchantId != null && Number(o.price) > 0).length
  } catch {
    return null
  }
}

async function deliver(payload) {
  const res = await fetch(`${baseUrl}/api/kaspi-shop/niches/trends/deliver`, {
    method: 'POST',
    headers: { 'x-kaspi-shop-cron-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`deliver failed: HTTP ${res.status}`)
  return res.json().catch(() => ({}))
}

async function main() {
  if (!secret) {
    console.error('KASPI_SHOP_CRON_SECRET is not set')
    process.exit(1)
  }

  // Pass 1: search, 3 pages per category.
  const results = []
  const skuSet = new Set()
  for (const category of KASPI_TRENDING_CATEGORIES) {
    for (let page = 0; page < PAGES_PER_CATEGORY; page++) {
      const { upstreamStatus, upstreamBodyText } = await fetchCategoryPage(category.label, page)
      results.push({ categoryKey: category.key, categoryLabel: category.label, page, upstreamStatus, upstreamBodyText })
      if (upstreamStatus >= 200 && upstreamStatus < 300) {
        for (const sku of extractSkus(upstreamBodyText)) skuSet.add(sku)
      }
      console.log(`${category.key} p${page}: upstreamStatus=${upstreamStatus}`)
      await sleep(REQUEST_DELAY_MS)
    }
  }

  // Pass 2: deliver search results in chunks.
  let upserted = 0
  let failed = 0
  for (let i = 0; i < results.length; i += DELIVER_CHUNK_SIZE) {
    const summary = await deliver({ results: results.slice(i, i + DELIVER_CHUNK_SIZE) })
    upserted += summary.upserted || 0
    failed += summary.failed || 0
  }
  console.log(`search delivered: pages=${results.length} upserted=${upserted} failed=${failed}`)

  // Pass 3: sellers counts.
  const skus = [...skuSet].slice(0, MAX_OFFER_SKUS)
  const offerCounts = []
  let offersFailed = 0
  for (const sku of skus) {
    const sellersCount = await fetchSellersCount(sku)
    if (sellersCount === null) offersFailed++
    else offerCounts.push({ sku, sellersCount })
    await sleep(OFFERS_DELAY_MS)
  }
  console.log(`offers: skus=${skus.length} ok=${offerCounts.length} failed=${offersFailed}`)

  // Always at least one offerCounts POST -- it also triggers the
  // server-side retention delete.
  if (offerCounts.length === 0) {
    await deliver({ offerCounts: [] })
    console.log('offerCounts delivered: empty (offers pass produced nothing)')
  } else {
    for (let i = 0; i < offerCounts.length; i += OFFER_COUNTS_CHUNK_SIZE) {
      const summary = await deliver({ offerCounts: offerCounts.slice(i, i + OFFER_COUNTS_CHUNK_SIZE) })
      console.log(`offerCounts chunk delivered: updated=${summary.updated} updateFailed=${summary.updateFailed}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Bump the workflow timeout.** In `.github/workflows/kaspi-shop-niche-trends.yml` change:

```yaml
    timeout-minutes: 9
```

to:

```yaml
    # Search pass (~54 throttled fetches) + sellers pass (~650 throttled
    # offer-view fetches) -- ~10-11 min worst case observed math, 20 for
    # slack.
    timeout-minutes: 20
```

Also update the comment above `concurrency:` that says "samples ~18 categories" to "samples ~18 categories x 3 pages plus a per-SKU sellers pass".

- [ ] **Step 3: Sanity check** — `node --check .github/scripts/kaspi-shop-niche-trends.mjs` exits 0.

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/kaspi-shop-niche-trends.mjs .github/workflows/kaspi-shop-niche-trends.yml
git commit -m "feat(kaspi-shop): niche-trends cron samples 3 pages + sellers counts, chunked delivery"
```

---

### Task 6: UI — витрина on the Ниши page

**Files:**
- Create: `src/components/kaspiShop/NicheCollections.tsx`
- Modify: `src/app/kaspi-shop/niches/page.tsx` (two small edits)

**Interfaces:**
- Consumes: Task 4's `GET /api/kaspi-shop/niches/collections` response shape (camelCase `CollectionProduct` fields; `pending` on demand-spike; `computedAt: null` = no data yet).
- Produces: default-export React client component `NicheCollections` (no props).

- [ ] **Step 1: Create the component.** Full content of `src/components/kaspiShop/NicheCollections.tsx`:

```tsx
'use client'
// «Витрина ниш» -- the face of /kaspi-shop/niches (founder decision
// 2026-08-23, from the competitor-research follow-up: zoomia's curated
// collections were the #1 gap). Self-contained: own fetch, own
// loading/error state, mirrors the page's other two independent data
// flows (keyword search, trends). Honesty rule: only metrics we really
// measure -- отзывы, рейтинг, продавцы, рост отзывов, индекс спроса; no
// invented sales/revenue numbers.
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

const EASE = [0.16, 1, 0.3, 1] as const

type CollectionProduct = {
  sku: string; name: string; brand: string
  price: number; rating: number; reviewsCount: number
  sellersCount: number | null; reviewsDelta7d: number | null
  score: number; imageUrl: string | null; shopUrl: string | null
}
type Collection = { key: string; label: string; description: string; pending?: boolean; products: CollectionProduct[] }
type CollectionsResponse = { computedAt: string | null; collections: Collection[] }

const ICONS: Record<string, string> = {
  'high-demand': '🔥',
  'cheap-entry': '💰',
  'weak-competitors': '🎯',
  'few-sellers': '🏝️',
  'demand-spike': '📈',
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

// Same row-as-external-link table pattern as the page's own
// TrendingProductsTable -- extra columns appear only where the metric
// exists: «Продавцы» for few-sellers, «+7 дн» for demand-spike.
function CollectionTable({ collection }: { collection: Collection }) {
  const showSellers = collection.key === 'few-sellers'
  const showDelta = collection.key === 'demand-spike'
  if (collection.products.length === 0) {
    return (
      <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
        Пока нет товаров, проходящих пороги этой подборки.
      </div>
    )
  }
  const gridCols = showSellers || showDelta
    ? 'lg:grid-cols-[2.2fr_0.8fr_0.7fr_0.7fr_0.7fr_0.6fr]'
    : 'lg:grid-cols-[2.6fr_0.8fr_0.7fr_0.7fr_0.6fr]'
  return (
    <div className="nav-glass rounded-2xl overflow-hidden">
      <div className={`hidden lg:grid ${gridCols} gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider`}
        style={{ color: 'var(--nav-text-muted)', borderBottom: '1px solid var(--nav-border-soft)' }}>
        <span>Товар</span>
        <span>Цена</span>
        <span>Рейтинг</span>
        <span>Отзывы</span>
        {showSellers && <span>Продавцы</span>}
        {showDelta && <span>+7 дн</span>}
        <span>Спрос</span>
      </div>
      {collection.products.map((p, i) => (
        <a key={`${p.sku}-${i}`} href={p.shopUrl || undefined} target={p.shopUrl ? '_blank' : undefined} rel={p.shopUrl ? 'noopener noreferrer' : undefined}
          onClick={e => { if (!p.shopUrl) e.preventDefault() }}
          className={`grid grid-cols-2 ${gridCols} gap-x-2 gap-y-1 items-center px-4 py-3 text-sm transition-colors ${p.shopUrl ? 'hover:bg-[color:var(--nav-bg)]' : 'cursor-default'}`}
          style={{ borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
          <span className="col-span-2 lg:col-span-1 font-medium line-clamp-1 flex items-center gap-1.5" style={{ color: 'var(--nav-text-primary)' }}>
            {p.name}{p.shopUrl && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--nav-accent)' }}>↗</span>}
          </span>
          <span className="font-mono tabular-nums text-xs lg:text-sm" style={{ color: 'var(--nav-text-primary)' }}>{p.price.toLocaleString('ru-KZ')} ₸</span>
          <span className="text-xs lg:text-sm flex items-center gap-1" style={{ color: 'var(--nav-text-muted)' }}><StarIcon />{p.rating.toFixed(1)}</span>
          <span className="text-xs lg:text-sm tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{p.reviewsCount.toLocaleString('ru-KZ')}</span>
          {showSellers && (
            <span className="text-xs lg:text-sm tabular-nums font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{p.sellersCount ?? '—'}</span>
          )}
          {showDelta && (
            <span className="text-xs lg:text-sm tabular-nums font-semibold" style={{ color: 'var(--nav-accent)' }}>+{(p.reviewsDelta7d ?? 0).toLocaleString('ru-KZ')}</span>
          )}
          <span className="text-xs lg:text-sm font-mono tabular-nums font-semibold" style={{ color: 'var(--nav-accent)' }}>{p.score.toFixed(2)}</span>
        </a>
      ))}
    </div>
  )
}

export default function NicheCollections() {
  const [data, setData] = useState<CollectionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kaspi-shop/niches/collections', {
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Не удалось загрузить подборки'); setLoading(false); return }
      setData(json)
      setLoading(false)
    } catch {
      setError('Не удалось загрузить подборки. Проверьте соединение и попробуйте ещё раз.')
      setLoading(false)
    }
  }

  const open = data?.collections.find(c => c.key === openKey) || null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="mb-8">
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Ниши</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Витрина ниш</h1>
        </div>
        <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
          Готовые подборки по реальным метрикам Kaspi · обновляются каждые 24 часа{data?.computedAt ? ` · данные за ${new Date(`${data.computedAt}T00:00:00`).toLocaleDateString('ru-KZ', { day: '2-digit', month: '2-digit' })}` : ''}
        </div>
      </div>

      {error && (
        <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
          <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</span>
          <button onClick={load} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
        </div>
      )}

      {loading && !data ? (
        <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем подборки...</div>
      ) : data && data.computedAt === null ? (
        <div className="nav-glass rounded-2xl p-8 text-center">
          <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Данные ещё не рассчитаны. Первый расчёт появится после ближайшего запуска фонового обновления.</div>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-4 items-stretch">
            {data.collections.map(c => {
              const active = openKey === c.key
              return (
                <button key={c.key} onClick={() => setOpenKey(k => k === c.key ? null : c.key)}
                  className="nav-glass rounded-2xl p-4 text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]"
                  style={{ outline: active ? '2px solid var(--nav-accent)' : 'none', outlineOffset: -2 }}>
                  <div className="text-xl mb-1.5">{ICONS[c.key] || '📦'}</div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{c.label}</div>
                  <div className="text-[11px] leading-snug mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{c.description}</div>
                  <div className="text-[11px] font-semibold tabular-nums" style={{ color: c.pending ? 'var(--nav-text-muted)' : 'var(--nav-accent)' }}>
                    {c.pending ? 'копим данные' : `${c.products.length} позиций`}
                  </div>
                </button>
              )
            })}
          </div>

          {open && (open.pending ? (
            <div className="nav-glass rounded-2xl p-8 text-center">
              <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                Копим историю отзывов — подборка «Всплеск спроса» оживёт, когда накопится неделя наблюдений.
              </div>
            </div>
          ) : (
            <CollectionTable collection={open} />
          ))}
        </>
      ) : null}
    </motion.div>
  )
}
```

- [ ] **Step 2: Wire it into the page.** Two edits in `src/app/kaspi-shop/niches/page.tsx`:

Edit A — add the import after the existing `import DesktopShell from '@/components/DesktopShell'`:

```tsx
import NicheCollections from '@/components/kaspiShop/NicheCollections'
```

Edit B — mount the витрина first and demote the search card's kicker. Replace:

```tsx
      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Ниши</div>
```

with:

```tsx
      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {/* Витрина подборок -- the page's face (2026-08-23 founder
            decision); the keyword search below stays as the secondary
            "проверить свою идею" tool. */}
        <NicheCollections />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Проверка идеи</div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — clean. Run: `npm run build` — clean. Run: `npx vitest run` — all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/kaspiShop/NicheCollections.tsx src/app/kaspi-shop/niches/page.tsx
git commit -m "feat(kaspi-shop): Витрина ниш -- collections showcase leads the Ниши page"
```

---

### Task 7: Ship + live verification

**Files:** none (verification only).

- [ ] **Step 1: Full local gate** — `npx vitest run`, `npx tsc --noEmit`, `npm run build` all clean.

- [ ] **Step 2: Push** `git push origin main`; confirm the Vercel production deployment for the pushed commit reaches READY (targeted `get_deployment`-style check, not a broad listing).

- [ ] **Step 3: Trigger the cron manually** (deliver route must be live first — hence after Step 2):

```bash
gh workflow run kaspi-shop-niche-trends.yml
gh run watch $(gh run list --workflow=kaspi-shop-niche-trends.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: green run in ~10–12 min; log shows 54 `p0/p1/p2` lines, `search delivered`, `offers: skus=... ok=...`, `offerCounts chunk delivered` lines.

- [ ] **Step 4: Verify data** via Supabase `execute_sql`:

```sql
select count(*) as rows_today,
       count(sellers_count) as with_sellers,
       count(distinct category_key) as categories
from kaspi_shop_niche_product_snapshots
where snapshot_date = current_date;
```

Expected: rows_today ≈ 400–650; with_sellers > 0 (the offers-endpoint-on-catalog-SKUs risk from the spec resolves here — if with_sellers = 0, inspect the workflow log's `offers:` line and report honestly); categories = 18 (or close, minus any transiently failed pages).

- [ ] **Step 5: Live page check** — open https://www.invoices.kz/kaspi-shop/niches as the admin: витрина renders 5 cards, «Всплеск спроса» shows «копим данные», other collections open product tables with real Kaspi links; search and trends below unchanged. (Founder eyeballs this — the admin session isn't available to the executor.)

- [ ] **Step 6: Verify trends continuity** — `kaspi_shop_niche_trends.total_reviews` values should stay in the same order of magnitude as before the change (page-0-only rule held):

```sql
select category_key, total_reviews, prev_total_reviews from kaspi_shop_niche_trends order by demand_score desc limit 5;
```

Expected: total_reviews within ~2x of prev_total_reviews (organic drift), NOT a ~3x jump (which would mean deeper pages leaked into trends).

---

## Self-Review (done at write time)

- **Spec coverage:** deeper sampling (T5), sellers pass (T5), chunked delivery + body-limit (T3/T5), snapshots table + retention + RLS (T1/T3), page-0-only trends (T3), on-read collections with all 5 rules + pending state (T2/T4), витрина-first UI with extra columns and honest copy (T6), error philosophy (T3/T5), unit tests incl. baseline-window cases (T2), live verification incl. the offers-endpoint risk (T7). Out-of-scope items from the spec have no tasks — correct.
- **Type consistency:** `NicheSnapshotRow`/`NicheSnapshotInsert`/`CollectionProduct`/`Collection` defined once in T2, consumed by name in T3/T4/T6; deliver contract field names (`page`, `offerCounts`, `sellersCount`) match between T3 route code and T5 script code.
- **Known deviation** from spec noted in Global Constraints (last-category-wins on same-day dupes; sellers_count excluded from upsert payload).
