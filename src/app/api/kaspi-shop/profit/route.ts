import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { computeProfitSummary } from '@/lib/kaspiShop/profit'

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

const VALID_DAYS = [7, 30, 90]

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const daysParam = Number(req.nextUrl.searchParams.get('days')) || 30
  const days = VALID_DAYS.includes(daysParam) ? daysParam : 30

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const { data: connRow, error: connError } = await supabase
    .from('kaspi_shop_connections')
    .select('commission_rate_percent')
    .eq('id', connection.id)
    .single()
  if (connError) {
    console.error('kaspi-shop profit: failed to load commission rate', connError.message)
    return NextResponse.json({ error: 'Не удалось загрузить прибыль' }, { status: 500 })
  }
  const commissionRatePercent = connRow?.commission_rate_percent ?? null

  const { data: productRows, error: productsError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_master_sku, cogs_amount, created_at')
    .eq('connection_id', connection.id)
  if (productsError) {
    console.error('kaspi-shop profit: failed to load tracked products', productsError.message)
    return NextResponse.json({ error: 'Не удалось загрузить прибыль' }, { status: 500 })
  }

  // Reconnecting re-imports the seller's whole catalog (finalizeConnection.ts
  // inserts fresh rows rather than upserting), so more than one row can
  // share the same kaspi_master_sku -- confirmed live 2026-08-14 (68 master
  // SKUs with 2 rows each on the connected account, from today's earlier
  // reconnect). An undeterministic "last one seen" pick would let an
  // entered COGS value silently vanish on the next load if a different
  // duplicate won. Prefer whichever row already has a real cogs_amount; if
  // several/none do, prefer the most recently created row for stability.
  const canonicalByMasterSku = new Map<string, { id: string; cogsAmount: number | null; createdAt: string }>()
  for (const p of productRows || []) {
    if (!p.kaspi_master_sku) continue
    const candidate = { id: p.id as string, cogsAmount: p.cogs_amount as number | null, createdAt: p.created_at as string }
    const existing = canonicalByMasterSku.get(p.kaspi_master_sku)
    if (!existing) {
      canonicalByMasterSku.set(p.kaspi_master_sku, candidate)
      continue
    }
    const existingHasCogs = existing.cogsAmount !== null
    const candidateHasCogs = candidate.cogsAmount !== null
    if (candidateHasCogs && !existingHasCogs) {
      canonicalByMasterSku.set(p.kaspi_master_sku, candidate)
    } else if (candidateHasCogs === existingHasCogs && candidate.createdAt > existing.createdAt) {
      canonicalByMasterSku.set(p.kaspi_master_sku, candidate)
    }
  }
  const catalog: { kaspiMasterSku: string; trackedProductId: string | null; cogsAmount: number | null; commissionCategoryLabel: string | null }[] =
    Array.from(canonicalByMasterSku.entries()).map(([kaspiMasterSku, row]) => ({
      kaspiMasterSku,
      trackedProductId: row.id,
      cogsAmount: row.cogsAmount,
      commissionCategoryLabel: null,
    }))

  // Себестоимость (+ seller-assigned commission category, 2026-09-02) from
  // the master-sku-keyed costs table (2026-08-21): OVERRIDES the
  // tracked-row value when both exist, and adds entries for sold products
  // that were never added to демпинг -- those previously had no place to
  // store cogs at all.
  const { data: costRows } = await supabase
    .from('kaspi_shop_product_costs')
    .select('kaspi_master_sku, cogs_amount, commission_category_label')
    .eq('connection_id', connection.id)
  const catalogBySkuIndex = new Map(catalog.map((c, i) => [c.kaspiMasterSku, i]))
  for (const row of costRows || []) {
    const idx = catalogBySkuIndex.get(row.kaspi_master_sku)
    const cogs = row.cogs_amount !== null ? Number(row.cogs_amount) : null
    const categoryLabel = row.commission_category_label || null
    if (idx !== undefined) {
      if (cogs !== null) catalog[idx].cogsAmount = cogs
      if (categoryLabel !== null) catalog[idx].commissionCategoryLabel = categoryLabel
    } else {
      catalog.push({ kaspiMasterSku: row.kaspi_master_sku, trackedProductId: null, cogsAmount: cogs, commissionCategoryLabel: categoryLabel })
    }
  }

  const { data: adSpendRow, error: adSpendError } = await supabase
    .from('kaspi_shop_ad_spend')
    .select('amount, other_amount')
    .eq('connection_id', connection.id)
    .eq('days', days)
    .maybeSingle()
  if (adSpendError) {
    console.error('kaspi-shop profit: failed to load ad spend', adSpendError.message)
    return NextResponse.json({ error: 'Не удалось загрузить прибыль' }, { status: 500 })
  }
  const adSpend = { amount: Number(adSpendRow?.amount) || 0, otherAmount: Number(adSpendRow?.other_amount) || 0, configured: !!adSpendRow }

  const summary = await computeProfitSummary(connection.sessionCookies, connection.merchantId, days, catalog, adSpend, commissionRatePercent)
  if (summary.sessionExpired) await markSessionExpired(connection.id)
  return NextResponse.json(summary)
}
