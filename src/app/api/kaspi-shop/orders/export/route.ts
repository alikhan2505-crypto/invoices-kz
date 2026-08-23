import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listOrders } from '@/lib/kaspiShop/cabinetApi'
import { buildOrdersWorkbookBuffer } from '@/lib/kaspiShop/ordersExport'

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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'NEW'
  const cityId = req.nextUrl.searchParams.get('cityId') || ''

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён — подключите его через Kaspi Магазин' }, { status: 400 })
  }

  const orders: Awaited<ReturnType<typeof listOrders>>['orders'] = []
  let total = Infinity
  let page = 0
  while (orders.length < total && orders.length < MAX_EXPORT_ORDERS) {
    const result = await listOrders(connection.sessionCookies, connection.merchantId, status, page, cityId)
    if (result.sessionExpired) {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия истекла — переподключите кабинет' }, { status: 400 })
    }
    if (result.orders.length === 0) break
    orders.push(...result.orders)
    total = result.total
    page++
  }

  const truncated = total > MAX_EXPORT_ORDERS
  const buffer = buildOrdersWorkbookBuffer(orders.slice(0, MAX_EXPORT_ORDERS))
  const filename = `zakazy_${status}_${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-truncated': truncated ? 'true' : 'false',
    },
  })
}
