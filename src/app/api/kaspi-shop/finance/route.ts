import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { computeFinanceSummary } from '@/lib/kaspiShop/finance'

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

// Custom period (founder request 2026-08-22): any whole day count is
// accepted, not just the three presets -- computeFinanceSummary already
// takes a plain sinceDays number with no assumption about which values are
// "valid", so the only real constraint is a sane upper bound (a year) to
// keep the underlying order-history fetch bounded.
const MAX_CUSTOM_DAYS = 365

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const daysParam = Number(req.nextUrl.searchParams.get('days')) || 30
  const days = Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= MAX_CUSTOM_DAYS ? daysParam : 30

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const summary = await computeFinanceSummary(connection.sessionCookies, connection.merchantId, days)
  if (summary.sessionExpired) await markSessionExpired(connection.id)
  return NextResponse.json(summary)
}
