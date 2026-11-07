import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { aggregateReviewCache, computeReviewStats, filterByStars, type ReviewCacheRow, type ReviewProduct } from '@/lib/kaspiShop/reviews'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { claimDispatchSlot, releaseDispatchSlot } from '@/lib/kaspiShop/dispatchGuard'

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

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Scoped to the user's ACTIVE connection -- a user_id-wide query mixed both
// stores' products once multi-store support landed (2026-08-21).
async function loadAggregatedReviews(userId: string, sinceIso: string | null) {
  const connection = await loadConnection(userId)
  if (!connection) return aggregateReviewCache([], [], sinceIso)
  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, kaspi_master_sku')
    .eq('connection_id', connection.id)
  if (productsError) throw new Error(productsError.message)

  const productList: ReviewProduct[] = (products || []).map(p => ({
    id: p.id as string,
    name: (p.product_name as string) || '',
    masterSku: (p.kaspi_master_sku as string | null) || null,
  }))
  if (productList.length === 0) return aggregateReviewCache([], [], sinceIso)

  const { data: cacheRows, error: cacheError } = await supabase
    .from('kaspi_shop_product_reviews')
    .select('tracked_product_id, reviews, fetch_error, fetched_at, avg_rating, total_count')
    .in('tracked_product_id', productList.map(p => p.id))
  if (cacheError) throw new Error(cacheError.message)

  const rows: ReviewCacheRow[] = (cacheRows || []).map(r => ({
    trackedProductId: r.tracked_product_id as string,
    reviews: r.reviews,
    fetchError: (r.fetch_error as string | null) || null,
    fetchedAt: (r.fetched_at as string | null) || null,
    avgRating: numOrNull(r.avg_rating),
    totalCount: numOrNull(r.total_count),
  }))
  return aggregateReviewCache(productList, rows, sinceIso)
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const starsParam = req.nextUrl.searchParams.get('stars')
  const stars = starsParam ? Number(starsParam) : null
  const validStars = stars !== null && Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null

  // since -- момент запуска обновления (его отдаёт POST): по нему считается прогресс
  // ИМЕННО этого запуска, а не «самая свежая строка по всем товарам» (аудит K42).
  const sinceParam = req.nextUrl.searchParams.get('since')
  const sinceIso = sinceParam && Number.isFinite(Date.parse(sinceParam)) ? new Date(sinceParam).toISOString() : null

  let aggregation
  try {
    aggregation = await loadAggregatedReviews(user.id, sinceIso)
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

  // stats -- по загруженной выборке (до 50 самых популярных отзывов на товар: Kaspi
  // принимает только сортировку POPULARITY). catalog -- настоящие числа карточек
  // из total_count и avg_rating, средняя взвешена по числу отзывов (аудит K40).
  return NextResponse.json({
    stats,
    catalog: aggregation.catalog,
    reviews,
    lastFetchedAt: aggregation.lastFetchedAt,
    productErrorCount: aggregation.errorCount,
    refresh: aggregation.refresh,
  })
}

// Static -- this repo never changes owner/name, matching niches/request's
// own convention for the same GitHub Actions dispatch call.
const GITHUB_OWNER = 'alikhan2505-crypto'
const GITHUB_REPO = 'invoices-kz'
const GITHUB_WORKFLOW = 'kaspi-shop-reviews-check.yml'

// Окно между запусками обновления отзывов: не короче самого длинного запуска
// (timeout-minutes: 9 в workflow). Подробности -- dispatchGuard.ts.
const REVIEWS_RUN_WINDOW_MS = 10 * 60_000
const REVIEWS_PREFIX = 'kaspireviews'

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
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })

  const { data: products, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_master_sku')
    .eq('connection_id', connection.id)
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 })

  // По одному запросу в Kaspi на master SKU: после переподключения у SKU бывает
  // несколько строк, и раньше раннер ходил за одним и тем же дважды.
  const seenSkus = new Set<string>()
  const withSku: { trackedProductId: string; masterSku: string }[] = []
  for (const p of products || []) {
    const sku = p.kaspi_master_sku as string | null
    if (!sku || seenSkus.has(sku)) continue
    seenSkus.add(sku)
    withSku.push({ trackedProductId: p.id as string, masterSku: sku })
  }

  if (withSku.length === 0) {
    return NextResponse.json({ error: 'Нет товаров с известным master SKU для проверки отзывов' }, { status: 400 })
  }

  const token = process.env.KASPI_SHOP_GITHUB_PAT
  if (!token) {
    console.error('kaspi-shop reviews: KASPI_SHOP_GITHUB_PAT is not configured')
    return NextResponse.json({ error: 'Обновление отзывов временно недоступно' }, { status: 500 })
  }

  // Не чаще одного запуска за окно на продавца и без параллельных запусков (K42):
  // каждый запуск до 9 минут ходит в Kaspi с одного IP раннера, токен общий.
  // Слот занимаем ДО запуска и возвращаем, если GitHub отказал.
  const claim = await claimDispatchSlot(supabase, REVIEWS_PREFIX, `${user.id}|${connection.id}`, REVIEWS_RUN_WINDOW_MS)
  if (!claim.ok) {
    if (claim.reason === 'running') {
      // Слот держит прошлый запуск. Идёт он ещё или уже закончился, говорим по данным:
      // если все карточки обновлены после его начала, это не «идёт», а «уже обновлено».
      let finished = false
      try {
        const agg = await loadAggregatedReviews(user.id, claim.since)
        finished = !!agg.refresh && agg.refresh.expected > 0 && agg.refresh.updated >= agg.refresh.expected
      } catch { /* не смогли проверить: считаем, что идёт */ }
      return NextResponse.json(
        {
          error: finished
            ? `Отзывы уже обновлены. Новый запуск можно не раньше чем через ${Math.ceil(claim.retryAfterSeconds / 60)} мин.`
            : 'Обновление отзывов уже идёт, дождитесь окончания. Страница сама покажет свежие данные.',
          alreadyRunning: !finished,
          retryAfterSeconds: claim.retryAfterSeconds,
          since: claim.since,
          dispatchedCount: withSku.length,
        },
        { status: 429, headers: { 'Retry-After': String(claim.retryAfterSeconds) } }
      )
    }
    return NextResponse.json({ error: 'Не удалось проверить лимит запуска, попробуйте через минуту' }, { status: 503 })
  }

  let dispatchRes: Response | null = null
  try {
    dispatchRes = await fetch(
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
  } catch (err: any) {
    console.error('kaspi-shop reviews: GitHub dispatch threw', err?.message)
  }
  if (!dispatchRes || !dispatchRes.ok) {
    if (dispatchRes) console.error('kaspi-shop reviews: GitHub dispatch failed', dispatchRes.status, await dispatchRes.text().catch(() => ''))
    await releaseDispatchSlot(supabase, claim.slotKey)
    return NextResponse.json({ error: 'Не удалось запустить обновление отзывов' }, { status: 502 })
  }

  // since -- серверное время запуска: по нему страница считает прогресс этого запуска.
  return NextResponse.json({
    ok: true,
    dispatchedCount: withSku.length,
    skippedCount: (products || []).filter(p => !p.kaspi_master_sku).length,
    since: claim.since,
  }, { status: 202 })
}
