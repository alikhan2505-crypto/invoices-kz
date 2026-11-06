import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { getOrderCounters } from '@/lib/kaspiShop/cabinetApi'

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
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const { counts, sessionExpired, failed, error } = await getOrderCounters(connection.sessionCookies, connection.merchantId)
  if (sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true }, { status: 502 })
  }
  // Пустой counts при сбое раньше уходил как 200: Обзор показывал «0 в работе».
  if (failed) {
    return NextResponse.json({ error: `Kaspi не отдал счётчики заказов${error ? ` (${error})` : ''}`, sessionExpired: false }, { status: 502 })
  }
  return NextResponse.json({ counts, sessionExpired: false })
}
