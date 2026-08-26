import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { generateSkuSuffix, getLowestPrice, getMerchantPoints } from '@/lib/kaspiShop/addProduct'

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

// Everything the «Цена и остатки» step of the add wizard needs in one round
// trip: suggested артикул, the «Самая низкая цена» hint, and the merchant's
// active points grouped by city.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = req.nextUrl.searchParams.get('code')?.trim() || ''
  if (!code) return NextResponse.json({ error: 'code обязателен' }, { status: 400 })

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const [suffix, lowestPrice, pointsRes] = await Promise.all([
    generateSkuSuffix(connection.sessionCookies, connection.merchantId),
    getLowestPrice(connection.sessionCookies, code),
    getMerchantPoints(connection.sessionCookies, connection.merchantId),
  ])
  if (pointsRes.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  return NextResponse.json({
    suggestedSku: `${code}_${suffix}`,
    lowestPrice,
    cities: pointsRes.cities,
  })
}
