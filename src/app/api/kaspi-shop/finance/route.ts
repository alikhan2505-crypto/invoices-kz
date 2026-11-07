import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { computeFinanceSummary } from '@/lib/kaspiShop/finance'
import { parseSinceDate, MAX_PERIOD_DAYS } from '@/lib/kaspiShop/revenueOrders'

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

  // Custom period (founder request 2026-08-22): `since=YYYY-MM-DD` -- считать с этой
  // даты, 00:00 по Алматы (UTC+5), включительно (аудит K37: раньше клиент слал
  // число суток, и окно начиналось посреди дня). Пресеты `days` -- N календарных
  // суток по Алматы, считая сегодняшние. Верхняя граница -- год, чтобы выборка
  // заказов из Kaspi оставалась ограниченной.
  const sinceParam = req.nextUrl.searchParams.get('since')
  let days: number
  let windowStartMs: number | undefined
  if (sinceParam) {
    const period = parseSinceDate(sinceParam)
    if (!period.ok) {
      return NextResponse.json({ error: `since должен быть датой ГГГГ-ММ-ДД не позже сегодня и не старше ${MAX_PERIOD_DAYS} дней` }, { status: 400 })
    }
    days = period.days
    windowStartMs = period.startMs
  } else {
    const daysParam = Number(req.nextUrl.searchParams.get('days')) || 30
    days = Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= MAX_PERIOD_DAYS ? daysParam : 30
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const summary = await computeFinanceSummary(connection.sessionCookies, connection.merchantId, days, undefined, { windowStartMs, cacheKey: connection.id })
  if (summary.sessionExpired) await markSessionExpired(connection.id)
  return NextResponse.json(summary)
}
