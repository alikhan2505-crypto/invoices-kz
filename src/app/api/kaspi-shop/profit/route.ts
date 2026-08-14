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

  const { data: connRow } = await supabase
    .from('kaspi_shop_connections')
    .select('commission_rate_percent')
    .eq('id', connection.id)
    .single()
  const commissionRatePercent = connRow?.commission_rate_percent ?? null

  const { data: productRows } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, kaspi_master_sku, cogs_amount')
    .eq('connection_id', connection.id)
  const catalog = (productRows || [])
    .filter(p => p.kaspi_master_sku)
    .map(p => ({ kaspiMasterSku: p.kaspi_master_sku as string, trackedProductId: p.id as string, cogsAmount: p.cogs_amount as number | null }))

  const { data: adSpendRow } = await supabase
    .from('kaspi_shop_ad_spend')
    .select('amount')
    .eq('connection_id', connection.id)
    .eq('days', days)
    .maybeSingle()
  const adSpend = { amount: Number(adSpendRow?.amount) || 0, configured: !!adSpendRow }

  const summary = await computeProfitSummary(connection.sessionCookies, connection.merchantId, days, catalog, adSpend, commissionRatePercent)
  if (summary.sessionExpired) await markSessionExpired(connection.id)
  return NextResponse.json(summary)
}
