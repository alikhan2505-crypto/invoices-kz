import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { confirmPacking } from '@/lib/kaspiShop/cabinetApi'

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

// The real cabinet's «Я упаковал, сформировать накладные»: confirms the
// selected orders are packed, which is the action that actually generates
// their накладные (Kaspi processes it asynchronously, ~5 minutes) and moves
// each order from Упаковка to Передача.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const orders: any[] = Array.isArray(body?.orders) ? body.orders : []
  if (orders.length === 0) {
    return NextResponse.json({ error: 'orders обязателен и не должен быть пустым' }, { status: 400 })
  }
  const parsed = orders.map(o => ({ orderCode: String(o?.orderCode ?? ''), quantity: Number(o?.quantity) || 0 }))
  if (parsed.some(o => !o.orderCode)) {
    return NextResponse.json({ error: 'Каждый заказ должен иметь orderCode' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await confirmPacking(connection.sessionCookies, connection.merchantId, parsed)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  if (!result.success) {
    return NextResponse.json({ error: `Kaspi отклонил подтверждение упаковки: ${result.message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
