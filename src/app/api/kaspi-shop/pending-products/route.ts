import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listPendingProducts, getPendingCount, hasMoreByCount } from '@/lib/kaspiShop/pendingProducts'

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

  const pageParam = Number(req.nextUrl.searchParams.get('page')) || 1
  const page = pageParam < 1 ? 1 : pageParam

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const [list, counter] = await Promise.all([
    listPendingProducts(connection.sessionCookies, connection.merchantId, page),
    getPendingCount(connection.sessionCookies, connection.merchantId),
  ])
  const sessionExpired = list.sessionExpired || counter.sessionExpired
  if (sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true }, { status: 502 })
  }
  // Сбой списка это 502, а не «нераспознанных нет». Сбой одного только счётчика не роняет
  // страницу: список виден, число «Всего» неизвестно (count: null), «Дальше» по размеру страницы.
  if (list.failed) {
    return NextResponse.json({ error: `Kaspi не отдал список нераспознанных товаров${list.error ? ` (${list.error})` : ''}. Повторите через минуту.`, sessionExpired: false }, { status: 502 })
  }
  const count = counter.failed ? null : counter.count
  // «Дальше» по общему числу: на ровно кратном размеру страницы числе карточек пустой
  // следующей страницы больше нет. Без счётчика остаётся оценка по размеру страницы.
  const hasMore = count !== null ? hasMoreByCount(page, count) : list.hasMore

  return NextResponse.json({ products: list.products, hasMore, count, sessionExpired: false })
}
