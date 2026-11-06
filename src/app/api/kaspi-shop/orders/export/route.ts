import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listOrders, PAGE_SIZE } from '@/lib/kaspiShop/cabinetApi'
import { buildOrdersWorkbookBuffer } from '@/lib/kaspiShop/ordersExport'
import { ORDER_STATUS_TABS } from '@/lib/kaspiShop/orderStatuses'
import { paginateOrders, almatyDateStamp } from '@/lib/kaspiShop/ordersPaging'

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

// Hard stop against a multi-thousand-row Архив export hanging the request
// (docs/superpowers/specs/2026-08-23-kaspi-orders-filters-excel-design.md).
const MAX_EXPORT_ORDERS = 500

// Up to 50 sequential Kaspi page fetches (500 / PAGE_SIZE=10) plus one
// terminating call comfortably exceed Vercel's 15s default function
// budget -- same pattern as api/cron/kaspi-poll/route.ts.
export const maxDuration = 60

// Сколько из 60 секунд тратим на листание Kaspi; остальное на сборку xlsx и ответ.
const EXPORT_BUDGET_MS = 48_000

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const status = req.nextUrl.searchParams.get('status') || 'NEW'
  if (!ORDER_STATUS_TABS.some(t => t.value === status)) {
    return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 })
  }
  const cityId = req.nextUrl.searchParams.get('cityId') || ''

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  // Страницы листаются общей функцией (ordersPaging.ts): сбой страницы -- это failed, а не
  // «заказов больше нет», и total при этом не затирается нулём. Запас по времени оставляем
  // до лимита функции, чтобы вернуть хотя бы честно подписанную неполную выгрузку.
  const { sessionCookies, merchantId } = connection
  const deadline = Date.now() + EXPORT_BUDGET_MS
  const outcome = await paginateOrders({
    pageSize: PAGE_SIZE,
    cap: MAX_EXPORT_ORDERS,
    shouldStop: () => Date.now() > deadline,
    fetchPage: page => listOrders(sessionCookies, merchantId, status, page, cityId),
  })

  if (outcome.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин', sessionExpired: true }, { status: 400 })
  }
  // Сбой на самой первой странице: ни одной строки не получено. Раньше здесь уходил пустой
  // валидный xlsx с кодом 200, который выглядел как «заказов нет».
  if (outcome.failed && outcome.orders.length === 0) {
    return NextResponse.json({ error: `Kaspi не отдал заказы для выгрузки${outcome.error ? ` (${outcome.error})` : ''}. Повторите через минуту.` }, { status: 502 })
  }

  const exported = outcome.orders.slice(0, MAX_EXPORT_ORDERS)
  const total = Math.max(outcome.total, exported.length)
  // Неполной считаем любую выгрузку, где строк меньше, чем сообщил Kaspi: потолок, сбой
  // посередине или выход по времени. Точные числа уходят в заголовках, страница их показывает.
  const truncated = exported.length < total || outcome.failed || outcome.aborted
  const buffer = buildOrdersWorkbookBuffer(exported)
  const filename = `zakazy_${status}_${almatyDateStamp()}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-truncated': truncated ? 'true' : 'false',
      'x-exported-count': String(exported.length),
      'x-total-count': String(total),
      'x-export-failed': outcome.failed ? 'true' : 'false',
    },
  })
}
