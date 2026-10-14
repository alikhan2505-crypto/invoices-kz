import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapReviewsResponse } from '@/lib/kaspiShop/reviews'
import { ownerHasKaspiShopAccess, trackedProductOwnerId } from '@/lib/kaspiShop/planGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called by the GitHub Actions relay (kaspi-shop-reviews-check.mjs), once
// per tracked product -- Kaspi's review-view endpoint 429s from Vercel's
// IP ranges (confirmed live 2026-08-21, same block class as offer-view/
// product-view), so the actual fetch to kaspi.kz happens from the GH
// Actions runner and the raw response is relayed here for parsing/storage,
// same split as /api/kaspi-shop/niches/deliver and /cron/apply.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const trackedProductId = body?.trackedProductId
  const upstreamStatus = Number(body?.upstreamStatus) || 0
  const upstreamBodyText = typeof body?.upstreamBodyText === 'string' ? body.upstreamBodyText : ''
  if (!trackedProductId) return NextResponse.json({ error: 'trackedProductId обязателен' }, { status: 400 })

  // Kaspi Bot is a Pro feature (founder decision, 14.10.2026): when the
  // product's owner no longer has Pro, nothing is written -- a run that was
  // dispatched while they were still Pro (or a stale manual re-run of the
  // workflow) must not keep refreshing their cache. Answered 200 with
  // skipped so the relay doesn't log it as a failure. The cached reviews
  // already stored stay as they are (nothing is deleted); renewing Pro and
  // pressing «Обновить» again refreshes them. A failed plan lookup fails
  // closed (500, no write) -- same contract as the repricer.
  const { data: product, error: productError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, user_id, kaspi_shop_connections(user_id)')
    .eq('id', trackedProductId)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  let ownerHasAccess: boolean
  try {
    ownerHasAccess = await ownerHasKaspiShopAccess(trackedProductOwnerId(product))
  } catch (e: any) {
    console.error(`kaspi-shop reviews ingest: owner plan lookup failed for product ${trackedProductId}:`, e.message)
    return NextResponse.json({ error: 'Не удалось проверить тариф' }, { status: 500 })
  }
  if (!ownerHasAccess) return NextResponse.json({ ok: true, skipped: 'not_pro' })

  const fetchedAt = new Date().toISOString()

  if (upstreamStatus < 200 || upstreamStatus >= 300) {
    console.error(`kaspi-shop reviews ingest: upstream HTTP ${upstreamStatus} for product ${trackedProductId}, body: ${upstreamBodyText.slice(0, 300)}`)
    // Keep whatever reviews are already cached -- only record the error and
    // bump fetched_at, same as the old direct-fetch path did on failure.
    const { error } = await supabase.from('kaspi_shop_product_reviews').upsert({
      tracked_product_id: trackedProductId,
      fetch_error: `HTTP ${upstreamStatus}`,
      fetched_at: fetchedAt,
    }, { onConflict: 'tracked_product_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const json = (() => { try { return JSON.parse(upstreamBodyText) } catch { return null } })()
  const page = mapReviewsResponse(json)

  const { error } = await supabase.from('kaspi_shop_product_reviews').upsert({
    tracked_product_id: trackedProductId,
    reviews: page.reviews,
    avg_rating: page.avgRating,
    total_count: page.totalCount,
    fetch_error: null,
    fetched_at: fetchedAt,
  }, { onConflict: 'tracked_product_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
