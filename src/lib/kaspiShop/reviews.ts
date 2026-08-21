// Public per-product Kaspi review data -- reviews shown on a product's
// public page are visible to anyone without a seller login, same public-data
// category as niches.ts's search results and the offer-view competitor
// offers fetched in .github/scripts/kaspi-shop-price-check.mjs (both
// confirmed live elsewhere in this codebase). This module follows those two
// modules' conventions: a pure parser (mapReviewsResponse) kept separate and
// independently testable from the network call (fetchProductReviews), and
// the SAME browser-header-set (Referer + sec-fetch-* + a real Chrome UA)
// that offer-view's confirmed-live fetch needs to get past Kaspi's anti-bot
// check on its yml/* JSON APIs -- a bare fetch with no headers gets a
// persistent 403 (confirmed live for the sibling endpoints, same nginx-level
// block class).
//
// IMPORTANT / UNCONFIRMED (unlike product-view and offer-view, which this
// codebase's other kaspiShop modules explicitly mark "confirmed live"):
// this dev sandbox had no network path to kaspi.kz to capture a real browser
// request for the reviews endpoint -- a direct curl to kaspi.kz timed out
// from here (TLS connects, then the connection just hangs -- same block
// class the niches.ts comments describe), and a WebFetch probe reached the
// product page's static HTML fine (confirmed real page, "Код товара:
// 114958921") but reviews are loaded client-side via JS after page load, so
// they're invisible to a non-JS fetch, and a raw guess at the JSON endpoint
// below 403'd without the custom headers WebFetch has no way to set. The
// product-page URL shape IS confirmed live (copied verbatim from
// kaspi-shop-price-check.mjs's `https://kaspi.kz/shop/p/-${sku}/?c=${cityId}`,
// which Kaspi accepts with no slug before the id). The reviews endpoint URL
// below is a best-effort guess following the SAME yml/<x>-view/... family as
// product-view (search) and offer-view (competitor offers), NOT a
// captured-live shape. mapReviewsResponse is written defensively (returns an
// empty page for any unrecognized response shape) so a wrong guess fails
// safe -- reviews stay empty with a visible fetch_error surfaced to the
// caller, never a crash or fabricated data. Verify against a real captured
// browser request (same method used to confirm product-view/offer-view --
// see docs/superpowers/specs/2026-08-14-kaspi-shop-niches-design.md) and
// adjust the URL/field names here before trusting this in production. If
// Kaspi blocks it the same way it blocked product-view from Vercel, the fix
// is the same GitHub Actions relay pattern used for niches (see
// kaspi-shop-niche-check.mjs + /api/kaspi-shop/niches/deliver) -- swap
// fetchProductReviews's body for a relay call, mapReviewsResponse doesn't
// need to change.

export type RawReview = {
  rating: number
  text: string
  authorName: string | null
  date: string | null
}

export type ProductReviewsPage = {
  reviews: RawReview[]
  avgRating: number | null
  totalCount: number | null
}

const EMPTY_PAGE: ProductReviewsPage = { reviews: [], avgRating: null, totalCount: null }

// Matches niches.ts's own bounded-list convention (12 cards) -- enough for a
// seller to skim the most recent reviews per product without an unbounded
// cache payload growing forever.
export const MAX_REVIEWS_PER_PRODUCT = 50

function toIsoOrNull(raw: any): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toFiniteOrNull(raw: any): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// Defensive by design (see module header): tries a handful of plausible
// field-name variants per value since the real shape is unconfirmed, and
// silently drops anything that doesn't look like a real review (no parsable
// 1-5 rating) rather than guessing wrong data into the cache.
export function mapReviewsResponse(json: any): ProductReviewsPage {
  const data = json?.data ?? json
  if (!data || typeof data !== 'object') return EMPTY_PAGE

  const rawList = Array.isArray(data.reviews) ? data.reviews
    : Array.isArray(data.content) ? data.content
    : Array.isArray(data.items) ? data.items
    : null
  if (!rawList) return EMPTY_PAGE

  const reviews: RawReview[] = rawList
    .map((r: any): RawReview | null => {
      if (!r || typeof r !== 'object') return null
      const rating = Math.round(Number(r.rating ?? r.grade ?? r.score))
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null
      const text = String(r.text ?? r.comment ?? r.reviewText ?? '').trim()
      const authorRaw = r.authorName ?? r.author ?? r.userName ?? r.clientName
      const authorName = authorRaw ? (String(authorRaw).trim() || null) : null
      const date = toIsoOrNull(r.date ?? r.creationDate ?? r.createDate ?? r.createdAt)
      return { rating, text, authorName, date }
    })
    .filter((r: RawReview | null): r is RawReview => r !== null)
    .slice(0, MAX_REVIEWS_PER_PRODUCT)

  const avgRating = toFiniteOrNull(data.averageRating ?? data.avgRating ?? data.rating)
  const totalCount = toFiniteOrNull(data.totalCount ?? data.total ?? data.count)

  return { reviews, avgRating, totalCount }
}

// Legacy-Almaty reference city -- same default used for the reference city
// in .github/scripts/kaspi-shop-price-check.mjs when a product has no
// per-city tracking configured. Review content itself isn't expected to
// vary by city (unlike price/stock), so this only affects the Referer/query
// string sent to Kaspi, not which reviews come back.
export const DEFAULT_CITY_ID = '750000000'

// Confirmed live shape (kaspi-shop-price-check.mjs) -- Kaspi's product pages
// tolerate an empty slug before the numeric id, so no product name/slug
// needs to be stored to build a real, working product page link.
export function buildProductPageUrl(masterSku: string, cityId = DEFAULT_CITY_ID): string {
  return `https://kaspi.kz/shop/p/-${encodeURIComponent(masterSku)}/?c=${encodeURIComponent(cityId)}`
}

// Best-effort URL, see module header -- unconfirmed against a real captured
// browser request.
export function buildReviewsRequestUrl(masterSku: string, page = 0, size = 20): string {
  return `https://kaspi.kz/yml/review-view/api/v1/reviews/product/${encodeURIComponent(masterSku)}?sort=DATE_DESC&page=${page}&size=${size}`
}

export type FetchReviewsResult =
  | { ok: true; page: ProductReviewsPage }
  | { ok: false; error: string }

// The actual network call -- kept as thin as possible around
// mapReviewsResponse so the only thing that needs to change if the real
// endpoint turns out different is this function (and buildReviewsRequestUrl
// above), not any of the caching/aggregation logic downstream. Never throws
// -- callers (the refresh route) need a result per product, not an
// exception that aborts the whole batch.
export async function fetchProductReviews(masterSku: string, cityId = DEFAULT_CITY_ID): Promise<FetchReviewsResult> {
  try {
    const res = await fetch(buildReviewsRequestUrl(masterSku), {
      headers: {
        accept: 'application/json, text/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: buildProductPageUrl(masterSku, cityId),
        Origin: 'https://kaspi.kz',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = await res.json().catch(() => null)
    return { ok: true, page: mapReviewsResponse(json) }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'network error' }
  }
}

export type ReviewStats = { avgRating: number; total: number; negative: number; fiveStar: number }

// Negative = <=3 stars, matching Northline's own definition (the feature
// this page reproduces) -- lets the seller spot lukewarm reviews, not just
// outright 1-star ones, since a string of 3-star reviews is often the
// earlier warning sign of a developing problem.
export function computeReviewStats(ratings: number[]): ReviewStats {
  const total = ratings.length
  if (total === 0) return { avgRating: 0, total: 0, negative: 0, fiveStar: 0 }
  const sum = ratings.reduce((s, r) => s + r, 0)
  const negative = ratings.filter(r => r <= 3).length
  const fiveStar = ratings.filter(r => r === 5).length
  return { avgRating: Math.round((sum / total) * 10) / 10, total, negative, fiveStar }
}

// stars === null means "All" (the first filter pill) -- passthrough with no
// filtering, matching the page's 6-way All/5/4/3/2/1 pill group.
export function filterByStars<T extends { rating: number }>(reviews: T[], stars: number | null): T[] {
  return stars === null ? reviews : reviews.filter(r => r.rating === stars)
}
