import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { getQualityCategories, QUALITY_TABS, type QualityTab } from '@/lib/kaspiShop/quality'

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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tab = req.nextUrl.searchParams.get('tab') as QualityTab | null
  if (!tab || !(tab in QUALITY_TABS)) {
    return NextResponse.json({ error: `tab обязателен и должен быть одним из: ${Object.keys(QUALITY_TABS).join(', ')}` }, { status: 400 })
  }
  const page = Number(req.nextUrl.searchParams.get('page')) || 0

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await getQualityCategories(connection.sessionCookies, connection.merchantId, tab, page)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  return NextResponse.json({ categories: result.categories, total: result.total })
}
