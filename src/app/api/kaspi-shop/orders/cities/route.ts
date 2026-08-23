import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listOrders } from '@/lib/kaspiShop/cabinetApi'
import { collectDistinctCities } from '@/lib/kaspiShop/ordersFilters'

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

// Kaspi's getOrders has no "list distinct cities" endpoint of its own, and
// guessing a new one is exactly what caused накладная to 404 for real (see
// docs/superpowers/specs/2026-08-13-kaspi-orders-api-findings.md section 5
// and the 2026-08-23 waybill fix). Sampling existing pages needs no new
// confirmed-live shape.
const CITY_SAMPLE_PAGES = 5

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'NEW'

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const sampled: { cityId: string | null; cityName: string | null }[] = []
  let fetched = 0
  for (let page = 0; page < CITY_SAMPLE_PAGES; page++) {
    const result = await listOrders(connection.sessionCookies, connection.merchantId, status, page)
    if (result.sessionExpired) {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия истекла — переподключите кабинет' }, { status: 400 })
    }
    if (result.orders.length === 0) break
    sampled.push(...result.orders)
    fetched += result.orders.length
    if (fetched >= result.total) break
  }

  return NextResponse.json({ cities: collectDistinctCities(sampled) })
}
