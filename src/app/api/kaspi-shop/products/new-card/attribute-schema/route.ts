import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { getCategoryAttributeSchema } from '@/lib/kaspiShop/addProductNewCard'
import { generateSkuSuffix, getMerchantPoints } from '@/lib/kaspiShop/addProduct'

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

// Everything step 4 (характеристики) needs in one round trip: the dynamic
// form schema for the chosen leaf category, plus a suggested Артикул (same
// suffix generator the join-card flow already uses).
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const category = req.nextUrl.searchParams.get('category')?.trim() || ''
  if (!category) return NextResponse.json({ error: 'category обязателен' }, { status: 400 })

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const [schemaRes, suggestedSku, pointsRes] = await Promise.all([
    getCategoryAttributeSchema(connection.sessionCookies, connection.merchantId, category),
    generateSkuSuffix(connection.sessionCookies, connection.merchantId),
    getMerchantPoints(connection.sessionCookies, connection.merchantId),
  ])
  if (schemaRes.sessionExpired || pointsRes.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  return NextResponse.json({ classifications: schemaRes.classifications, suggestedSku, cities: pointsRes.cities })
}
