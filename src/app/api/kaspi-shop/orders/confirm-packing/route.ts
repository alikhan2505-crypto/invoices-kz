import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
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

const MAX_CONFIRM_ORDERS = 200

// The real cabinet's «Я упаковал, сформировать накладные»: confirms the
// selected orders are packed, which is the action that actually generates
// their накладные (Kaspi processes it asynchronously, ~5 minutes) and moves
// each order from Упаковка to Передача.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

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
  // Потолок на один запрос и жёсткая проверка полей: подтверждение упаковки двигает заказы
  // в Передачу и запускает у Kaspi генерацию накладных, поэтому мусор сюда не пускаем.
  if (orders.length > MAX_CONFIRM_ORDERS) {
    return NextResponse.json({ error: `Не больше ${MAX_CONFIRM_ORDERS} заказов за один раз` }, { status: 400 })
  }
  const parsed = orders.map(o => ({ orderCode: typeof o?.orderCode === 'string' ? o.orderCode.trim() : '', quantity: Number(o?.quantity) }))
  if (parsed.some(o => !o.orderCode)) {
    return NextResponse.json({ error: 'Каждый заказ должен иметь orderCode' }, { status: 400 })
  }
  // quantity 0 раньше принималось и уходило в Kaspi (заказ без позиций).
  if (parsed.some(o => !Number.isInteger(o.quantity) || o.quantity < 1)) {
    return NextResponse.json({ error: 'У каждого заказа количество должно быть целым числом от 1' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await confirmPacking(connection.sessionCookies, connection.merchantId, parsed)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true }, { status: 400 })
  }
  if (!result.success) {
    return NextResponse.json({ error: `Kaspi отклонил подтверждение упаковки: ${result.message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
