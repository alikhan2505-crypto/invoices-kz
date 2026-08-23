# Kaspi Shop: Ниши — витрина подборок (collections) — Design

## Context

Direct follow-through on the 2026-08-22 competitor research ("Разведка рынка" artifact, memory `competitor-research-kaspibot-aiagent`): its #1 priority across the whole report was zoomia's "Найдите прибыльный товар за минуту" module — 18.6M products split into 12 curated opportunity collections with per-product sales estimates — against which our «Ниши» page is "just keyword search". The report itself scoped the realistic v1: *"Не обязательно 18 млн товаров сразу — можно начать с 3–4 самых сильных подборок на данных, которые уже собираются для «Ниш»."*

Founder approved (2026-08-23, this session): **maximum v1 scope** (5 collections including the two that need new data), and **collections become the face of the page** (the keyword search and the existing «Тренды Kaspi» dashboard move below as secondary tools).

This also absorbs the report's Kaspi Bot rec #2 («Товары без продавцов» as its own screen): the «Мало продавцов» collection IS that screen in v1, no separate route.

## What already exists (and stays)

- `kaspi-shop-niche-trends` GitHub Actions cron (~24h): samples 18 hardcoded categories via Kaspi's public search endpoint (1 page each → 12 products each, ~216 products), delivers raw responses in one batched POST to `/api/kaspi-shop/niches/trends/deliver`, which computes demand scores (reviews×rating + day-over-day review velocity) and upserts one row per category into `kaspi_shop_niche_trends`. **Unchanged** — trends keep being computed from the page-0 sample only, so the velocity diff against the cached `total_reviews` stays continuous (feeding it the bigger merged sample would distort velocity for one cycle and change what the number means).
- On-demand keyword search («Проверить идею товара») via `workflow_dispatch` relay. **Unchanged.**
- Everything runs through GitHub Actions runners because Kaspi 403s its public endpoints from Vercel's IP range (confirmed live 2026-08-14).

## Data collection (extend the existing cron, two new steps)

**1. Deeper category sampling.** `kaspi-shop-niche-trends.mjs` fetches pages 0–2 per category (same endpoint, `page=` param) instead of page 0 only: 18 × 3 = 54 search calls, ~500–650 unique products after SKU dedup. The existing 500ms throttle stays.

**2. Sellers count per SKU.** After the search pass, the script calls `kaspi.kz/yml/offer-view/offers/{sku}` (the repricer's proven, unauthenticated per-SKU offers endpoint — headers copied from `kaspi-shop-price-check.mjs`) for every unique SKU collected, throttled at 400ms, hard cap 800 SKUs (safety). Sellers count = number of valid offers returned (`OFFERS_LIMIT: 50` covers every real product observed live). A failed offers fetch → `sellersCount: null` for that SKU — never fails the run.

**Risk, disclosed:** the offers endpoint is proven live for the seller's *own* product SKUs (repricer); catalog-wide SKUs from search cards are the same public SKU space so it should behave identically, but this is unverified until the first real run. If it turns out blocked/shaped differently, the «Мало продавцов» collection degrades to an honest empty state and nothing else breaks.

**Cron runtime:** ~30s search + ~4–5 min offers ≈ well within GitHub Actions limits.

**Delivery, chunked.** 54 raw response bodies in one POST could exceed Vercel's ~4.5MB request-body limit (the current 18 fit; 54 may not). The script therefore POSTs in chunks:
- Search results: chunks of ≤18 page-results per POST to the deliver route. Deliver processing is already per-item, so chunking is safe/idempotent.
- For EVERY delivered page-result (all pages), deliver parses the cards via the existing `mapNicheResponse` (it caps at 12 cards, which is a full Kaspi search page anyway — 3 pages ≈ up to 36 products/category) and upserts today's `kaspi_shop_niche_product_snapshots` rows.
- Page-0 results are marked (`page: 0`) — deliver runs the existing trends upsert **only** for page-0 results, preserving trends continuity.
- Offers counts: one final small POST (`{ offerCounts: [{ sku, sellersCount }] }`) after all search chunks; deliver updates today's snapshot rows with sellers counts.

The category list stays duplicated between the `.mjs` script and `nicheTrends.ts` (established precedent — GH Actions scripts can't import TS); this spec adds no new duplicated constants beyond thresholds living server-side only.

## New table: `kaspi_shop_niche_product_snapshots`

Daily history — the raw material for collections today and seasonality in a year.

```sql
create table kaspi_shop_niche_product_snapshots (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  brand text not null default '',
  price numeric not null default 0,
  rating numeric not null default 0,
  reviews_count integer not null default 0,
  sellers_count integer,           -- null = offers fetch failed/skipped
  category_key text not null,
  category_label text not null,
  image_url text,
  shop_url text,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  unique (sku, snapshot_date)
);
```

- Upsert on `(sku, snapshot_date)` — re-runs the same day overwrite, no dupes. A SKU appearing in several categories' samples keeps the first category seen (same product, same numbers).
- RLS enabled with **no policies** (service-role only) — global shared Kaspi catalog data, no owner column, exactly like `kaspi_shop_niche_trends`.
- **Retention 400 days**: deliver deletes rows older than 400 days once per run (keeps the future-seasonality option open at trivial cost: ~650 rows/day ≈ 260k rows/400 days).

## Collections: computed on read, not precomputed

Chosen over precomputing in deliver (approach A) because every threshold below WILL need tuning once real distributions are visible, and on-read compute makes tuning a plain deploy instead of a wait-for-next-cron cycle. Volume is trivial (one day's snapshot ≈ 650 rows).

New route `GET /api/kaspi-shop/niches/collections` (admin-gated, same `requireAdmin` pattern as the trends route):

1. Load the latest `snapshot_date`'s rows.
2. For the spike collection, also load the baseline: for each SKU, the snapshot closest to `latest − 7 days` (accept 6–8 days old; if none exists for a SKU, it's simply not spike-eligible).
3. Apply the rules below; each collection returns up to 30 products sorted as specified.

| key | Подборка | Rule (v1 constants, all server-side and tunable) | Sort |
|---|---|---|---|
| `high-demand` | 🔥 Высокий спрос | top by demand score (`productDemandScore`, existing formula) | score desc |
| `cheap-entry` | 💰 Дешёвый вход | `price ≤ 7000` AND `reviews ≥ 50` | score desc |
| `weak-competitors` | 🎯 Слабые конкуренты | `reviews ≥ 100` AND `rating ≤ 4.2` — «покупают много, недовольны» | reviews desc |
| `few-sellers` | 🏝 Мало продавцов | `sellers_count ≤ 3` (non-null) AND `reviews ≥ 30` | score desc |
| `demand-spike` | 📈 Всплеск спроса | `Δreviews(≈7d) ≥ 20` AND `latest ≥ 1.5 × baseline` | Δreviews desc |

Response shape:

```ts
type CollectionsResponse = {
  computedAt: string | null           // latest snapshot_date
  collections: {
    key: string
    label: string
    description: string               // the one-line "почему это шанс"
    pending?: boolean                 // demand-spike only, until history spans ≥6 days
    products: {
      sku: string; name: string; brand: string
      price: number; rating: number; reviewsCount: number
      sellersCount: number | null
      reviewsDelta7d: number | null   // spike collection only, null elsewhere
      score: number
      imageUrl: string | null; shopUrl: string | null
    }[]
  }[]
}
```

`demand-spike` returns `pending: true` (and the UI shows «копим данные — подборка оживёт через несколько дней») until at least one snapshot ≥6 days older than the latest exists. No snapshots at all → `computedAt: null`, every collection empty, page shows the same "первый расчёт после ближайшего запуска" state the trends block already uses.

**Honesty rule (carries the page's existing culture):** no fabricated «продажи/мес» or «выручка» numbers à la zoomia. We show what we actually measure: отзывы, рейтинг, число продавцов, рост отзывов за 7 дней, индекс спроса. The collection descriptions say why the metric is a proxy («отзывы — прокси продаж») rather than dressing it up as sales data.

## UI (`/kaspi-shop/niches` restructured)

New page order, everything admin-gated as today:

1. **Витрина подборок (new hero).** Header «Витрина ниш» + grid of 5 collection cards (icon, name, one-line description, product count; `nav-glass` + `CARD_HOVER`, existing visual language). Clicking a card expands ONE collection at a time below the grid: a product table reusing the `TrendingProductsTable` pattern (new `CollectionProductsTable` component) with columns Товар · Цена · Рейтинг · Отзывы · Спрос, plus «Продавцы» for `few-sellers` and «+Отзывы за 7 дн» for `demand-spike`. Every row links to the real Kaspi product page, same as trends rows. `demand-spike` in pending state renders the card with the «копим данные» note instead of a count.
2. **Поиск «Проверить идею товара»** — moves below the витрина, logic untouched.
3. **«Тренды Kaspi»** — stays last, untouched.

Own state/fetch/error/retry handling for the collections block (same isolation the trends block already practices — the three data flows on this page stay independent). Loading and error states copy the trends block's patterns verbatim (retry banner, empty state).

## Error handling summary

- One category/page fetch fails → that chunk item skipped, logged, rest proceeds (existing deliver philosophy).
- Offers fetch fails per-SKU → `sellers_count: null`, product excluded from «Мало продавцов» only.
- Offers step fails wholesale → all sellers null; «Мало продавцов» honestly empty; other 4 collections unaffected.
- Deliver chunk POST fails → script exits non-zero (workflow visibly red), already-delivered chunks stand (idempotent upserts self-heal next run).

## Testing

Unit tests for the pure collection-rule functions (new `src/lib/kaspiShop/nicheCollections.ts`: filter/sort/spike-baseline logic operating on plain snapshot arrays), following the existing `nicheTrends` test precedent. The spike baseline picker (6–8 day tolerance window) gets explicit cases: no history, exactly-7-days, multiple candidates, missing baseline for one SKU.

## Out of scope (deliberately)

- Сезонность / растущий-затухающий тренд по кварталам — needs months of history; the 400-day retention exists precisely so this becomes possible later without a schema change.
- Свежие 1–2★ отзывы конкурентов — needs a per-product review-feed API we don't have confirmed.
- Новые категории Kaspi — needs category-tree enumeration we don't have.
- Removing the admin gate / selling this — pricing discussion explicitly deferred by founder («пока не трогать»).
