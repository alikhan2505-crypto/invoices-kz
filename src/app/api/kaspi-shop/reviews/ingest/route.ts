import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapReviewsResponse } from '@/lib/kaspiShop/reviews'

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
