import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { getOrderCounters } from '@/lib/kaspiShop/cabinetApi'
import { getRefundCounts } from '@/lib/kaspiShop/refunds'
import { getPendingCountOrNull } from '@/lib/kaspiShop/pendingProducts'
import { ordersInWork, refundsNeedingAttention, type MenuCounts } from '@/lib/kaspiShop/menuCounts'

// Числа «в работе» для бокового меню Kaspi Bot (18.10.2026). Ничего не пишет и
// не тянет списки: три лёгких счётчика кабинета Kaspi (те же вызовы, что у страниц
// Заказы, Возвраты и Нераспознанные товары), параллельно. Сбой любого из них даёт
// null для своего числа (= «не знаем»), а не ошибку -- меню не должно ломать страницу.
// В отличие от соседних маршрутов НЕ помечает сессию истёкшей (это запись в БД):
// просто сообщает sessionExpired, а пометку ставит страница, на которую зайдёт человек.

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

const UPSTREAM_TIMEOUT_MS = 8000
const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Медленный ответ Kaspi -- это «не знаем», а не повод держать меню.
function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), UPSTREAM_TIMEOUT_MS)
    p.then(v => { clearTimeout(timer); resolve(v) }, (err: unknown) => {
      clearTimeout(timer)
      console.error('kaspi-shop menu-counts: upstream call failed', err instanceof Error ? err.message : err)
      resolve(fallback)
    })
  })
}

const UNKNOWN: MenuCounts = { orders: null, refunds: null, pendingProducts: null }

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  let connection
  try {
    connection = await loadConnection(user.id)
  } catch (err) {
    console.error('kaspi-shop menu-counts: connection load failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ ...UNKNOWN, sessionExpired: false }, { headers: NO_STORE })
  }
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ ...UNKNOWN, sessionExpired: false }, { headers: NO_STORE })
  }
  const { sessionCookies, merchantId } = connection

  const [orders, refunds, pending] = await Promise.all([
    withTimeout(getOrderCounters(sessionCookies, merchantId), null),
    withTimeout(getRefundCounts(sessionCookies, merchantId), null),
    withTimeout(getPendingCountOrNull(sessionCookies, merchantId), null),
  ])

  // The session is considered expired only when the orders call (the page's own
  // anchor) says so; a real expiry fails every call, orders included. A 401/403
  // on a single other endpoint (e.g. a refunds permission) only makes that one
  // number unknown, the counts that did succeed are still returned.
  const sessionExpired = !!orders?.sessionExpired
  if (sessionExpired) {
    return NextResponse.json({ ...UNKNOWN, sessionExpired: true }, { headers: NO_STORE })
  }

  const body: MenuCounts & { sessionExpired: boolean } = {
    orders: orders && !orders.sessionExpired ? ordersInWork(orders.counts) : null,
    refunds: refunds && !refunds.sessionExpired ? refundsNeedingAttention(refunds.counts) : null,
    pendingProducts: pending && !pending.sessionExpired ? pending.count : null,
    sessionExpired: false,
  }
  return NextResponse.json(body, { headers: NO_STORE })
}
