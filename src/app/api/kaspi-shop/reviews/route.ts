import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeReviewStats, filterByStars, RawReview } from '@/lib/kaspiShop/reviews'
import { loadConnection } from '@/lib/kaspiShop/connection'

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

type AggregatedReview = RawReview & { trackedProductId: string; productName: string }

// Scoped to the user's ACTIVE connection -- a user_id-wide query mixed both
// stores' products once multi-store support landed (2026-08-21).
async function loadAggregatedReviews(userId: string) {
  const connection = await loadConnection(userId)
  if (!connection) {
    return { aggregated: [] as AggregatedReview[], fetchedAtValues: [] as string[], errorCount: 0 }
  }
  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, kaspi_master_sku')
    .eq('connection_id', connection.id)
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

// Static -- this repo never changes owner/name, matching niches/request's
// own convention for the same GitHub Actions dispatch call.
const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-reviews-check.yml'

// Kaspi's review-view endpoint 429s from Vercel's IP ranges (confirmed live
// 2026-08-21 -- 61/61 products failed identically), the same block class as
// offer-view/product-view elsewhere in this codebase. The actual per-product
// fetch now happens on a GitHub Actions runner (kaspi-shop-reviews-check.mjs
// + .yml), which relays each raw response to /api/kaspi-shop/reviews/ingest
// for parsing/storage -- this endpoint's job is just to dispatch that run
// and hand back immediately; the caller polls GET on this same route (whose
// lastFetchedAt/stats improve as ingest calls land) instead of waiting for
// one long synchronous response the way the old direct-fetch version did.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })

  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_master_sku')
    .eq('connection_id', connection.id)
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 })

  const withSku = (products || [])
    .filter((p): p is { id: string; kaspi_master_sku: string } => !!p.kaspi_master_sku)
    .map(p => ({ trackedProductId: p.id, masterSku: p.kaspi_master_sku }))

  if (withSku.length === 0) {
    return NextResponse.json({ error: 'Нет товаров с известным master SKU для проверки отзывов' }, { status: 400 })
  }

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    console.error('kaspi-shop reviews: KASPI_SHOP_GITHUB_PAT is not configured')
    return NextResponse.json({ error: 'Обновление отзывов временно недоступно' }, { status: 500 })
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { products: JSON.stringify(withSku) } }),
    }
  )
  if (!dispatchRes.ok) {
    console.error('kaspi-shop reviews: GitHub dispatch failed', dispatchRes.status, await dispatchRes.text().catch(() => ''))
    return NextResponse.json({ error: 'Не удалось запустить обновление отзывов' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, dispatchedCount: withSku.length, skippedCount: (products || []).length - withSku.length }, { status: 202 })
}
