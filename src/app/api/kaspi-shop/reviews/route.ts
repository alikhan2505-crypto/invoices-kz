import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchProductReviews, computeReviewStats, filterByStars, RawReview } from '@/lib/kaspiShop/reviews'

// A refresh does one sequential, delayed fetch per tracked product (see
// REFRESH_DELAY_MS below) -- same reasoning as
// src/app/api/ai-agent/broadcasts/route.ts's maxDuration bump: the loop runs
// inside the request, so the Vercel function budget needs to cover it.
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Sequential with a small gap rather than firing one request per SKU at
// once -- matches the ~300ms gap .github/scripts/kaspi-shop-price-check.mjs
// already uses between per-city offer fetches to the same Kaspi backend, so
// a seller with many tracked products doesn't hammer Kaspi with a burst of
// simultaneous requests on one click of "Обновить".
const REFRESH_DELAY_MS = 300

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type AggregatedReview = RawReview & { trackedProductId: string; productName: string }

async function loadAggregatedReviews(userId: string) {
  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, kaspi_master_sku')
    .eq('user_id', userId)
  if (productsError) throw new Error(productsError.message)

  const productIds = (products || []).map(p => p.id)
  const nameById = new Map((products || []).map(p => [p.id, p.product_name as string]))

  if (productIds.length === 0) {
    return { aggregated: [] as AggregatedReview[], fetchedAtValues: [] as string[], errorCount: 0 }
  }

  const { data: cacheRows, error: cacheError } = await supabase
    .from('kaspi_shop_product_reviews')
    .select('tracked_product_id, reviews, fetch_error, fetched_at')
    .in('tracked_product_id', productIds)
  if (cacheError) throw new Error(cacheError.message)

  const aggregated: AggregatedReview[] = []
  const fetchedAtValues: string[] = []
  let errorCount = 0
  for (const row of cacheRows || []) {
    if (row.fetched_at) fetchedAtValues.push(row.fetched_at as string)
    if (row.fetch_error) errorCount += 1
    const productName = nameById.get(row.tracked_product_id) || ''
    const reviews = Array.isArray(row.reviews) ? (row.reviews as RawReview[]) : []
    for (const r of reviews) {
      aggregated.push({ ...r, trackedProductId: row.tracked_product_id, productName })
    }
  }

  return { aggregated, fetchedAtValues, errorCount }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const starsParam = req.nextUrl.searchParams.get('stars')
  const stars = starsParam ? Number(starsParam) : null
  const validStars = stars !== null && Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null

  let aggregation
  try {
    aggregation = await loadAggregatedReviews(user.id)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Не удалось загрузить отзывы' }, { status: 500 })
  }

  // Stats always reflect the FULL set regardless of the ?stars filter --
  // matching niches/page.tsx's own convention of filtering only the shown
  // list, not the headline numbers above it. The star pills are a view into
  // "which reviews am I looking at right now", not a different dataset.
  const stats = computeReviewStats(aggregation.aggregated.map(r => r.rating))
  const reviews = filterByStars(aggregation.aggregated, validStars)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const lastFetchedAt = aggregation.fetchedAtValues.length > 0
    ? aggregation.fetchedAtValues.reduce((max, v) => (v > max ? v : max))
    : null

  return NextResponse.json({ stats, reviews, lastFetchedAt, productErrorCount: aggregation.errorCount })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_master_sku')
    .eq('user_id', user.id)
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 })

  const withSku = (products || []).filter(p => !!p.kaspi_master_sku)
  let refreshed = 0
  let failed = 0

  for (let i = 0; i < withSku.length; i++) {
    const product = withSku[i]
    const fetchResult = await fetchProductReviews(product.kaspi_master_sku as string)
    const fetchedAt = new Date().toISOString()

    if (fetchResult.ok) {
      refreshed += 1
      await supabase.from('kaspi_shop_product_reviews').upsert({
        tracked_product_id: product.id,
        reviews: fetchResult.page.reviews,
        avg_rating: fetchResult.page.avgRating,
        total_count: fetchResult.page.totalCount,
        fetch_error: null,
        fetched_at: fetchedAt,
      }, { onConflict: 'tracked_product_id' })
    } else {
      failed += 1
      console.error('kaspi-shop reviews refresh: fetch failed for product', product.id, '--', fetchResult.error)
      // Keep whatever reviews are already cached (don't clobber good data
      // with an empty list just because this refresh attempt failed) --
      // only record the error and bump fetched_at so the UI can show a
      // "last attempt failed" signal without losing the last successful
      // snapshot.
      await supabase.from('kaspi_shop_product_reviews').upsert({
        tracked_product_id: product.id,
        fetch_error: fetchResult.error,
        fetched_at: fetchedAt,
      }, { onConflict: 'tracked_product_id' })
    }

    if (i < withSku.length - 1) await sleep(REFRESH_DELAY_MS)
  }

  let aggregation
  try {
    aggregation = await loadAggregatedReviews(user.id)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Не удалось загрузить отзывы' }, { status: 500 })
  }

  const stats = computeReviewStats(aggregation.aggregated.map(r => r.rating))
  const reviews = aggregation.aggregated.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const lastFetchedAt = aggregation.fetchedAtValues.length > 0
    ? aggregation.fetchedAtValues.reduce((max, v) => (v > max ? v : max))
    : null

  return NextResponse.json({
    stats,
    reviews,
    lastFetchedAt,
    productErrorCount: aggregation.errorCount,
    refreshedCount: refreshed,
    refreshFailedCount: failed,
    skippedCount: (products || []).length - withSku.length,
  })
}
