import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { searchBrands } from '@/lib/kaspiShop/addProductNewCard'

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

// Brand search-as-you-type for step 2. Empty prefix returns Kaspi's own
// default list with «Без бренда» first -- the wizard resolves it by name
// client-side (findNoBrandOption), never a hardcoded code.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const category = req.nextUrl.searchParams.get('category')?.trim() || ''
  const prefix = req.nextUrl.searchParams.get('prefix')?.trim() || ''
  if (!category) return NextResponse.json({ error: 'category обязателен' }, { status: 400 })

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await searchBrands(connection.sessionCookies, connection.merchantId, category, prefix)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  return NextResponse.json({ brands: result.brands })
}
