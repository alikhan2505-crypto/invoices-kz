// "Trending on Kaspi" passive dashboard -- the always-on counterpart to
// niches.ts's on-demand single-keyword search tool (see that file's
// header comment for the shared unauthenticated-fetch / IP-block
// context: Kaspi blocks its public search endpoint from Vercel's IP
// range, so the actual fetch happens on a GitHub Actions runner with
// browser-like headers, which then delivers the raw response back to a
// Vercel API route). This module is the pure, testable core shared by
// that relay: the fixed category sample list and the demand-score
// formulas, plus a thin wrapper that reuses niches.ts's own
// mapNicheResponse so category sampling goes through the exact same
// fetch/parse path as the keyword search instead of a second one.
//
// Refreshed roughly every 24h by the kaspi-shop-niche-trends GitHub
// Actions workflow and cached in the kaspi_shop_niche_trends table (see
// that migration's comment). Nothing in this file talks to the network
// or the database -- see
// src/app/api/kaspi-shop/niches/trends/deliver/route.ts for where the
// score gets computed against the cache and upserted, and
// .github/scripts/kaspi-shop-niche-trends.mjs for the actual fetch loop.
import { mapNicheResponse, type NicheSummary } from './niches'

export type TrendProduct = {
  sku: string
  name: string
  price: number
  rating: number
  reviewsCount: number
  brand: string
  imageUrl: string | null
  shopUrl: string | null
  score: number
}

export type CategoryTrend = {
  key: string
  label: string
  demandScore: number
  totalReviews: number
  productCount: number
  products: TrendProduct[]
  computedAt: string
}

// Kaspi's own top-level category nav has 4+ pages of entries (per live
// research on competitor Northline.kz, which paginates through all of
// them). This codebase has no existing category-list source -- checked
// niches.ts, cabinetApi.ts, pendingProducts.ts, suggestPricingRule.ts --
// none enumerate Kaspi's category tree, so v1 hardcodes a fixed sample of
// well-known top-level categories instead.
//
// Each is queried through the SAME public search endpoint niches.ts
// already uses (/yml/product-view/pl/filters), using the category's own
// Russian display name as the free-text search query. There is no
// confirmed separate "browse by category id" endpoint in this codebase to
// use instead, and reusing the already-proven-working keyword-search path
// was the safer call than inventing and shipping an unverified one
// un-live-tested. This is an approximation of true category browsing
// (a full-text match on the category name), not a real category-id filter
// -- documented here so a future pass can swap in a real category
// endpoint if one gets confirmed live.
//
// Keep .github/scripts/kaspi-shop-niche-trends.mjs's own copy of this
// list in sync -- GitHub Actions scripts are plain .mjs, not part of the
// TS build, so they can't import this file directly. Same duplication
// precedent as CITY_ID in the sibling niche-check/price-check scripts.
export const KASPI_TRENDING_CATEGORIES: { key: string; label: string }[] = [
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

// Per-product demand score -- log-compressed review count weighted by
// rating quality.
//
// reviewsCount is a long-established proxy for real sales volume on
// marketplaces that don't publish unit-sales figures (Kaspi included --
// and it's already visible on the same public, unauthenticated search
// response niches.ts parses today, no seller session needed). log10
// keeps one viral SKU with tens of thousands of reviews from swamping a
// category otherwise full of products with a few hundred -- without it a
// single blockbuster product would make its whole category look
// artificially dominant.
//
// The rating factor (0..1, rating/5) is a quality gate: a heavily
// reviewed but poorly rated product (lots of purchases, lots of
// complaints) shouldn't rank as "in demand" as high as an equally
// reviewed, well rated one.
export function productDemandScore(p: { rating: number; reviewsCount: number }): number {
  const reviews = Math.max(0, p.reviewsCount)
  const rating = Math.max(0, Math.min(5, p.rating))
  return Math.log10(1 + reviews) * (rating / 5)
}

// Per-category demand score -- mean product score across the sampled
// cards for that category's search, boosted by review-count VELOCITY:
// how much the sample's total review count grew since the PREVIOUS 24h
// snapshot (the caller -- the deliver route -- computes this by diffing
// against whatever total_reviews the last cached row for this category
// had). This is what actually captures "trending" -- a category getting
// MORE engagement lately -- rather than just "big" (a category that has
// always had a lot of reviews but is flat or declining).
//
// VELOCITY_WEIGHT controls how much a category's day-over-day growth can
// lift it above a bigger-but-stagnant one; tune only this constant if the
// ranking ever needs rebalancing -- nothing else in the formula should
// need to change for that.
//
// On a category's first-ever run there is no prior snapshot to diff
// against, so the caller passes reviewGrowth=0 (never the full
// totalReviews) -- otherwise every category would get an artificial,
// meaningless "growth" boost on day one just for existing, which would
// distort the very first computed ranking.
const VELOCITY_WEIGHT = 2
export function categoryDemandScore(products: { rating: number; reviewsCount: number }[], reviewGrowth: number): number {
  if (products.length === 0) return 0
  const avgProductScore = products.reduce((sum, p) => sum + productDemandScore(p), 0) / products.length
  const velocityBonus = VELOCITY_WEIGHT * Math.log10(1 + Math.max(0, reviewGrowth))
  return avgProductScore + velocityBonus
}

// Reuses niches.ts's mapNicheResponse verbatim -- same raw Kaspi JSON
// shape, since this queries the identical /yml/product-view/pl/filters
// endpoint, just with a category display name instead of a free-text
// product query -- rather than writing a second parser for what is
// structurally the same response. mapNicheResponse already caps products
// at 12, which is plenty for a "top products in this category" cache
// sample.
export function mapCategorySample(json: any): { total: number; products: Omit<TrendProduct, 'score'>[] } {
  const summary: NicheSummary = mapNicheResponse(json)
  return { total: summary.total, products: summary.products }
}
