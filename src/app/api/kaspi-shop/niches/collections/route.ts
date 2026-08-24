import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCollections, addDays, type NicheSnapshotRow } from '@/lib/kaspiShop/nicheCollections'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Same admin gate as the sibling trends route: snapshots are global
// shared Kaspi catalog data (no owner column, RLS with no policies,
// service-role only) and the whole «Ниши» page is admin-only today.
async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// Collections are computed here at read time from the raw snapshot
// history (see nicheCollections.ts's header for why not precomputed in
// deliver). Volume is trivial: one day's snapshot is ~650 rows.
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: latestRow, error: latestError } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    console.error('kaspi-shop niches collections: latest-date fetch failed:', latestError.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  // No snapshots at all yet (before the first post-deploy cron run) --
  // an empty-but-valid state, same convention as the trends route.
  if (!latestRow) return NextResponse.json({ computedAt: null, collections: [] })

  const latestDate = latestRow.snapshot_date as string

  const { data: latest, error: rowsError } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('*')
    .eq('snapshot_date', latestDate)
    .limit(2000)

  if (rowsError) {
    console.error('kaspi-shop niches collections: rows fetch failed:', rowsError.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  // Spike baseline: snapshots 6-8 days older than the latest one; the
  // lib picks, per SKU, whichever is closest to exactly 7 days back.
  const { data: baseline, error: baselineError } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('sku, reviews_count, snapshot_date')
    .gte('snapshot_date', addDays(latestDate, -8))
    .lte('snapshot_date', addDays(latestDate, -6))
    .limit(5000)

  if (baselineError) {
    console.error('kaspi-shop niches collections: baseline fetch failed:', baselineError.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  // «Всплеск спроса» stays in its honest "копим данные" pending state
  // until history reaches at least 6 days back from the latest snapshot.
  const { data: historyProbe } = await supabase
    .from('kaspi_shop_niche_product_snapshots')
    .select('id')
    .lte('snapshot_date', addDays(latestDate, -6))
    .limit(1)

  const collections = buildCollections(
    (latest || []) as NicheSnapshotRow[],
    (baseline || []) as Pick<NicheSnapshotRow, 'sku' | 'reviews_count' | 'snapshot_date'>[],
    latestDate,
    (historyProbe || []).length > 0,
  )

  return NextResponse.json({ computedAt: latestDate, collections })
}
