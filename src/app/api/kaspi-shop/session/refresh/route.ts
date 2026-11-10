import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { refreshStoredSession } from '@/lib/kaspiShop/connection'

// Несколько обходов цепочки входа Kaspi подряд: до ~3 запросов на каждом, с повторами.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Не чаще раза в минуту на подключение: страница пробует сама при открытии, кнопка и
// обновления вкладки не должны превращаться в поток входов в кабинет Kaspi.
const MIN_GAP_MS = 60_000

// Тихое продление сессии кабинета Kaspi без SMS для АКТИВНОГО магазина пользователя
// (10.11.2026). Зовёт страница Демпинг, когда видит «сессия истекла», перед тем как
// просить телефон и код (см. refreshStoredSession / refreshSessionSilently).
// Ответ только исход, без cookies и без деталей Kaspi:
//   { status: 'refreshed' }  -- сессия снова живая, SMS не нужен;
//   { status: 'needs_sms' }  -- единый вход Kaspi тоже закончился: обычный вход по SMS;
//   { status: 'busy' }       -- слишком часто или Kaspi не ответил: повторить позже.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  const { data: conn, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, session_refresh_attempt_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('kaspi-shop session refresh: connection lookup failed:', error.message)
    return NextResponse.json({ error: 'Не удалось проверить подключение' }, { status: 500 })
  }
  if (!conn) return NextResponse.json({ status: 'needs_sms' })

  const last = conn.session_refresh_attempt_at ? Date.parse(conn.session_refresh_attempt_at) : NaN
  if (Number.isFinite(last) && Date.now() - last < MIN_GAP_MS) return NextResponse.json({ status: 'busy' })

  let result
  try {
    result = await refreshStoredSession(conn.id, 'user')
  } catch (err: any) {
    console.error('kaspi-shop session refresh failed:', err?.message || err)
    return NextResponse.json({ error: 'Не удалось продлить сессию' }, { status: 500 })
  }
  if (result.outcome === 'refreshed') return NextResponse.json({ status: 'refreshed' })
  if (result.outcome === 'unreachable' || result.outcome === 'skipped_newer') return NextResponse.json({ status: 'busy' })
  return NextResponse.json({ status: 'needs_sms' })
}
