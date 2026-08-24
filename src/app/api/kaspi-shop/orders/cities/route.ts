import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { getCachedMerchantPoints } from '@/lib/kaspiShop/merchantPoints'

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

// Confirmed live 2026-08-24: the real cabinet's "Выберите город" filter on
// the orders page lists the MERCHANT's own pickup-point cities (this
// account has 2: Астана, Шымкент) -- a static, status-independent concept,
// not something to sample per status from live orders. See
// getMerchantPoints's comment for the KATO-id confirmation.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const points = await getCachedMerchantPoints(connection.id, connection.sessionCookies, connection.merchantId)

  const cities = new Map<string, string>()
  for (const p of points) {
    if (p.cityId && p.cityName) cities.set(p.cityId, p.cityName)
  }

  return NextResponse.json({
    cities: Array.from(cities.entries())
      .map(([cityId, cityName]) => ({ cityId, cityName }))
      .sort((a, b) => a.cityName.localeCompare(b.cityName, 'ru')),
  })
}
