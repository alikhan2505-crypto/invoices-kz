import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listRefunds, REFUND_TABS, type RefundTab } from '@/lib/kaspiShop/refunds'

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

  const tab = req.nextUrl.searchParams.get('tab') as RefundTab | null
  if (!tab || !REFUND_TABS.includes(tab)) {
    return NextResponse.json({ error: `tab обязателен и должен быть одним из: ${REFUND_TABS.join(', ')}` }, { status: 400 })
  }
  const pageRaw = req.nextUrl.searchParams.get('page')
  const page = pageRaw === null || pageRaw === '' ? 0 : Number(pageRaw)
  if (!Number.isInteger(page) || page < 0 || page > 1000) {
    return NextResponse.json({ error: 'page должен быть целым числом от 0' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await listRefunds(connection.sessionCookies, connection.merchantId, tab, page)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  // Сбой Kaspi это не «заявок нет»: 502 с причиной (аудит K35).
  if (result.failed) {
    return NextResponse.json({ error: `Не удалось получить заявки от Kaspi${result.error ? ` (${result.error})` : ''}. Повторите позже.` }, { status: 502 })
  }
  return NextResponse.json({ refunds: result.refunds, total: result.total })
}
