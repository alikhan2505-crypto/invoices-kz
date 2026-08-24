import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapCategorySample, productDemandScore, categoryDemandScore } from '@/lib/kaspiShop/nicheTrends'
import { snapshotRowsFromSample } from '@/lib/kaspiShop/nicheCollections'

// The offerCounts branch loops up to 150 per-SKU updates in one request
// (the script chunks them) -- default serverless timeout is too tight
// for that plus the retention delete.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CategoryResult = {
  categoryKey: string
  categoryLabel: string
  // Which search page this result is (0-based). Older script versions
  // never sent it -- missing means page 0, keeping the rollout window
  // backward compatible.
  page?: number
  upstreamStatus: number
  upstreamBodyText: string
}

type OfferCount = { sku: string; sellersCount: number }

const SNAPSHOT_RETENTION_DAYS = 400

// Delivery target for the kaspi-shop-niche-trends GitHub Actions
// workflow -- same relay shape as /api/kaspi-shop/niches/deliver (a
// cron-secret-authenticated POST from the GH Actions runner, since Kaspi
// blocks its public search endpoint from Vercel's IPs). One workflow run
// now makes SEVERAL posts here instead of one: search results chunked
// (54 raw page bodies would blow Vercel's ~4.5MB request-body limit),
// then the per-SKU sellers counts as a final small POST. Each result is
// processed independently, so chunking is idempotent-safe.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-kaspi-shop-cron-secret')
  if (!secret || secret !== process.env.KASPI_SHOP_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)

  // The script captures ONE snapshot date at process start and sends it
  // with every POST -- without this, a run crossing UTC midnight would
  // write snapshots under date D while the (minutes-later) sellers
  // updates look for D+1 and match nothing. Server-today stays as the
  // fallback for the rollout window / older script versions.
  const snapshotDate = typeof body?.snapshotDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.snapshotDate)
    ? body.snapshotDate
    : new Date().toISOString().slice(0, 10)

  // ---- Offers branch: sellers counts for the run's snapshot rows. ----
  // An empty array is legal -- the script always sends at least one
  // offerCounts POST so the retention delete below runs daily even when
  // the whole offers pass failed.
  if (Array.isArray(body?.offerCounts)) {
    let updated = 0
    let updateFailed = 0
    let unmatched = 0
    for (const oc of body.offerCounts as OfferCount[]) {
      if (!oc?.sku || typeof oc.sellersCount !== 'number' || oc.sellersCount < 0) { updateFailed++; continue }
      // .select('sku') so a 0-row match is visible -- supabase-js reports
      // no error on updates that matched nothing.
      const { data: updatedRows, error } = await supabase
        .from('kaspi_shop_niche_product_snapshots')
        .update({ sellers_count: Math.floor(oc.sellersCount) })
        .eq('sku', String(oc.sku))
        .eq('snapshot_date', snapshotDate)
        .select('sku')
      if (error) {
        console.error(`kaspi-shop niche-trends deliver: sellers update failed for sku=${oc.sku}:`, error.message)
        updateFailed++
      } else if (!updatedRows || updatedRows.length === 0) {
        unmatched++
      } else {
        updated++
      }
    }
    if (unmatched > 0) {
      console.error(`kaspi-shop niche-trends deliver: ${unmatched} sellers update(s) matched no snapshot row for date=${snapshotDate}`)
    }

    const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86400000).toISOString().slice(0, 10)
    const { error: retentionError } = await supabase
      .from('kaspi_shop_niche_product_snapshots')
      .delete()
      .lt('snapshot_date', cutoff)
    if (retentionError) {
      console.error('kaspi-shop niche-trends deliver: retention delete failed:', retentionError.message)
    }

    return NextResponse.json({ ok: true, updated, updateFailed, unmatched })
  }

  // ---- Search-results branch (chunked). ----
  const results = Array.isArray(body?.results) ? (body.results as CategoryResult[]) : []
  if (results.length === 0) return NextResponse.json({ error: 'results обязателен' }, { status: 400 })

  let upserted = 0
  let failed = 0

  for (const r of results) {
    const categoryKey = r?.categoryKey
    const categoryLabel = r?.categoryLabel
    if (!categoryKey || !categoryLabel) { failed++; continue }

    // A failed/blocked fetch for ONE page must not wipe out anything
    // previously cached -- leave it, retry next run (same philosophy as
    // the other Kaspi Shop crons).
    if (r.upstreamStatus < 200 || r.upstreamStatus >= 300) {
      console.error(`kaspi-shop niche-trends deliver: category=${categoryKey} page=${r.page ?? 0} upstream HTTP ${r.upstreamStatus}, body: ${String(r.upstreamBodyText).slice(0, 300)}`)
      failed++
      continue
    }

    const parsed = (() => { try { return JSON.parse(r.upstreamBodyText) } catch { return null } })()
    if (!parsed) {
      console.error(`kaspi-shop niche-trends deliver: category=${categoryKey} page=${r.page ?? 0} non-JSON response, body: ${String(r.upstreamBodyText).slice(0, 300)}`)
      failed++
      continue
    }

    const sample = mapCategorySample(parsed)

    // Every delivered page feeds the snapshot history (the витрина's raw
    // material). A snapshot failure is logged but doesn't fail the
    // result -- the trends upsert below is independent of it.
    const snapshotRows = snapshotRowsFromSample(categoryKey, categoryLabel, sample.products, snapshotDate)
    if (snapshotRows.length > 0) {
      const { error: snapshotError } = await supabase
        .from('kaspi_shop_niche_product_snapshots')
        .upsert(snapshotRows, { onConflict: 'sku,snapshot_date' })
      if (snapshotError) {
        console.error(`kaspi-shop niche-trends deliver: snapshot upsert failed for category=${categoryKey} page=${r.page ?? 0}:`, snapshotError.message)
      }
    }

    // Trends: page-0 only. The velocity diff below compares against the
    // cached total_reviews of the SAME page-0 sample size -- feeding it
    // deeper pages would distort velocity for one cycle and silently
    // change what the number means.
    if ((r.page ?? 0) !== 0) { upserted++; continue }

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
