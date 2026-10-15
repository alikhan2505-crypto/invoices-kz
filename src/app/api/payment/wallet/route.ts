import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { BillingPeriod, PlanKey } from '@/lib/plans/pricing'
import { quoteWalletPlanPayment, payPlanFullyFromWallet } from '@/lib/plans/walletPlanPayment'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function authUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!accessToken) return null
  const { data: { user } } = await supabaseAuth.auth.getUser(accessToken)
  return user
}

function parsePlan(plan: unknown, period: unknown): { plan: PlanKey; period: BillingPeriod } | null {
  if (plan !== 'pro' && plan !== 'basic') return null
  if (period !== undefined && period !== null && period !== 'monthly' && period !== 'annual') return null
  return { plan, period: period === 'annual' ? 'annual' : 'monthly' }
}

// Сколько из цены тарифа может покрыть кошелёк. Сумма считается только на
// сервере по PLAN_PRICES и текущему балансу.
export async function GET(req: NextRequest) {
  const user = await authUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = parsePlan(req.nextUrl.searchParams.get('plan'), req.nextUrl.searchParams.get('period'))
  if (!parsed) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  try {
    const quote = await quoteWalletPlanPayment(user.id, parsed.plan, parsed.period)
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('Wallet quote failed for', user.id, ':', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// Оплатить тариф целиком с кошелька.
export async function POST(req: NextRequest) {
  const user = await authUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const parsed = parsePlan(body?.plan, body?.period)
  if (!parsed) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  try {
    const result = await payPlanFullyFromWallet(user, parsed.plan, parsed.period)
    if (result.ok) return NextResponse.json(result)
    const status = result.error === 'unavailable' ? 503
      : result.error === 'insufficient_funds' || result.error === 'busy' || result.error === 'already_paid' ? 409
      : result.error === 'account_deleted' ? 403
      : 500
    return NextResponse.json({ error: result.error }, { status })
  } catch (e) {
    console.error('Wallet plan payment error for', user.id, ':', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
