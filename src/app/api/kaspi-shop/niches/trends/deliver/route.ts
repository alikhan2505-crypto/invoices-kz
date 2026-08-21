import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapCategorySample, productDemandScore, categoryDemandScore } from '@/lib/kaspiShop/nicheTrends'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CategoryResult = {
  categoryKey: string
  categoryLabel: string
  upstreamStatus: number
  upstreamBodyText: string
}

// Delivery target for the kaspi-shop-niche-trends GitHub Actions
// workflow -- same relay shape as /api/kaspi-shop/niches/deliver (a
// cron-secret-authenticated POST from the GH Actions runner, since Kaspi
// blocks its public search endpoint from Vercel's IPs), except this one
// batches ALL sampled categories from one workflow run into a single
// request instead of one checkId at a time. There's no per-batch
// "pending -> done" row to update either (unlike kaspi_niche_checks) --
// nothing polls a batch's status, the read route
// (GET /api/kaspi-shop/niches/trends) always just serves whatever is
// currently cached in kaspi_shop_niche_trends, so this route can go
// straight from "parse" to "upsert" for each category.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const results = Array.isArray(body?.results) ? (body.results as CategoryResult[]) : []
  if (results.length === 0) return NextResponse.json({ error: 'results обязателен' }, { status: 400 })

  let upserted = 0
  let failed = 0

  for (const r of results) {
    const categoryKey = r?.categoryKey
    const categoryLabel = r?.categoryLabel
    if (!categoryKey || !categoryLabel) { failed++; continue }

    // A failed/blocked fetch for ONE category must not wipe out its
    // previously cached row -- leaving yesterday's snapshot in place is
    // strictly better than showing nothing (or worse, zeroing out its
    // demand score), and the next run's retry is the actual fix. Same
    // "leave it, retry next run" philosophy as the other Kaspi Shop
    // crons (see kaspi-poll's transient-error handling).
    if (r.upstreamStatus < 200 || r.upstreamStatus >= 300) {
      console.error(`kaspi-shop niche-trends deliver: category=${categoryKey} upstream HTTP ${r.upstreamStatus}, body: ${String(r.upstreamBodyText).slice(0, 300)}`)
      failed++
      continue
    }

    const parsed = (() => { try { return JSON.parse(r.upstreamBodyText) } catch { return null } })()
    if (!parsed) {
      console.error(`kaspi-shop niche-trends deliver: category=${categoryKey} non-JSON response, body: ${String(r.upstreamBodyText).slice(0, 300)}`)
      failed++
      continue
    }

    const sample = mapCategorySample(parsed)
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
