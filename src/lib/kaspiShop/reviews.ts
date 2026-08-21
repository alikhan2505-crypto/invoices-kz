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
// CONFIRMED LIVE 2026-08-21 (a real browser capture superseded the original
// unconfirmed guess this module shipped with -- "не тянутся отзывы" turned
// out to be exactly that guess being wrong, not a Kaspi-side block):
//   GET /yml/review-view/api/v1/reviews/product/{masterSku}
//       ?filter=ALL&sort=POPULARITY&limit={n}&withAgg=true
// `sort` only accepts POPULARITY -- DATE_DESC (the original guess) gets a
// flat HTTP 400 with no JSON body. `filter` accepts ALL/COMMENT/POSITIVE/
// NEGATIVE/PICTURE (Kaspi's own review-page tabs); ALL is the one that
// returns every rating, including star-only reviews with no written text
// (COMMENT, what the original guess's captured example used, excludes those
// -- 24 of the product's 56 real reviews). Response shape is FLAT, not the
// nested {data:{reviews:[...]}} originally guessed:
//   {data: RawKaspiReview[], summary: {global: number, statistic: [...]},
//    groupSummary: [{id:'ALL', total}, {id:'COMMENT', total}, ...]}
// and each review's text lives at comment.text (comment is an object with
// minus/plus/text, not a flat string), its date is Kaspi's own DD.MM.YYYY
// (not ISO -- new Date() cannot be trusted to parse it correctly). This
// capture was done from a real browser, not Vercel, so whether Vercel's IP
// gets the same block the sibling product-view/offer-view endpoints do
// (which needed the GitHub Actions relay pattern -- see niches.ts +
// kaspi-shop-niche-check.mjs) is still unconfirmed; check production
// runtime logs after deploying this fix before assuming it's fine. If
// Vercel is blocked, fetchProductReviews's body is where to swap in a relay
// call -- mapReviewsResponse would not need to change.

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

// Kaspi's own review date format, confirmed live: "09.07.2026" (DD.MM.YYYY),
// not ISO -- new Date("09.07.2026") is not reliably parsed as that format by
// JS engines (some read it as MM.DD, some produce Invalid Date), so it needs
// its own parse rather than a generic fallback.
function parseKaspiReviewDate(raw: any): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toFiniteOrNull(raw: any): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// Confirmed live shape (see module header) -- json.data IS the review array
// directly (not nested under reviews/content/items as originally guessed);
// each item's text lives at comment.text and its author at the flat
// `author` field.
export function mapReviewsResponse(json: any): ProductReviewsPage {
  const rawList = Array.isArray(json?.data) ? json.data : null
  if (!rawList) return EMPTY_PAGE

  const reviews: RawReview[] = rawList
    .map((r: any): RawReview | null => {
      if (!r || typeof r !== 'object') return null
      const rating = Math.round(Number(r.rating))
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null
      const text = String(r.comment?.text ?? '').trim()
      const authorName = r.author ? (String(r.author).trim() || null) : null
      const date = parseKaspiReviewDate(r.date)
      return { rating, text, authorName, date }
    })
    .filter((r: RawReview | null): r is RawReview => r !== null)
    .slice(0, MAX_REVIEWS_PER_PRODUCT)

  const avgRating = toFiniteOrNull(json?.summary?.global)
  const allGroup = Array.isArray(json?.groupSummary) ? json.groupSummary.find((g: any) => g?.id === 'ALL') : null
  const totalCount = toFiniteOrNull(allGroup?.total)

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

// Confirmed live (see module header). filter=ALL is the one review-page tab
// that returns every rating including star-only reviews with no written
// text; sort=POPULARITY is the only value this endpoint accepts (DATE_DESC
// 400s) -- final display order is by date regardless, since the caller
// re-sorts the aggregated reviews itself.
export function buildReviewsRequestUrl(masterSku: string, limit = MAX_REVIEWS_PER_PRODUCT): string {
  return `https://kaspi.kz/yml/review-view/api/v1/reviews/product/${encodeURIComponent(masterSku)}?filter=ALL&sort=POPULARITY&limit=${limit}&withAgg=true`
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
