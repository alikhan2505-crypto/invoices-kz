import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { NicheCheck } from '@/lib/kaspiShop/nicheChecks'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Kaspi Bot access (admin or Pro) is required, AND the check must be the
// caller's own: kaspi_niche_checks.user_id records who requested it
// (createNicheCheck), so one Pro seller can't poll another's paid check by
// its id. Rows with no user_id (created before the column was filled) stay
// readable by any Kaspi Bot user, as before.
// 401 only for a missing/invalid token; a logged-in user without Kaspi Bot
// access (admin or canKaspiShop) gets the shared 403 { errorCode:'not_pro' }
// from kaspiShopPlanGate (14.10.2026 -- this used to answer a non-Pro seller
// with a misleading 401 "Unauthorized").
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

  const checkId = req.nextUrl.searchParams.get('checkId')
  if (!checkId) return NextResponse.json({ error: 'checkId обязателен' }, { status: 400 })

  // One read for both the owner check and the payload -- this route is
  // polled every 2s while a check runs. A malformed id (Postgres 22P02,
  // not a uuid) is just "not found", not a server error.
  const { data: row, error: rowError } = await supabase
    .from('kaspi_niche_checks')
    .select('user_id, status, result, error')
    .eq('id', checkId)
    .maybeSingle()
  if (rowError && rowError.code !== '22P02') {
    console.error(`kaspi-shop niches result: lookup failed for ${checkId}:`, rowError.message)
    return NextResponse.json({ error: 'Не удалось получить результат' }, { status: 500 })
  }
  if (!row || (row.user_id && row.user_id !== user.id)) {
    return NextResponse.json({ error: 'Проверка не найдена' }, { status: 404 })
  }

  const check: NicheCheck = { status: row.status, result: row.result, error: row.error }
  return NextResponse.json(check)
}
