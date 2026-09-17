import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSettleAiAgentWalletTopup } from '@/lib/aiAgent/wallet'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// AI-агент is admin-only for now -- same requireAdmin shape as every other
// ai-agent route (see ai-agent/settings/route.ts for the 401-vs-403
// reasoning).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const topupId = req.nextUrl.searchParams.get('topup_id')
  if (!topupId) return NextResponse.json({ error: 'topup_id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('kaspi_wallet_topups')
    .select('id, user_id, amount, kaspi_operation_id, status, expires_at')
    .eq('id', topupId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return NextResponse.json({ status: null })

  if (row.status === 'pending') {
    try {
      const outcome = await checkAndSettleAiAgentWalletTopup(row as any)
      return NextResponse.json({ status: outcome === 'not_paid' ? 'pending' : outcome })
    } catch (e: any) {
      console.error('AI-agent wallet topup status check failed for', topupId, ':', e.message)
      return NextResponse.json({ status: 'pending' })
    }
  }
  return NextResponse.json({ status: row.status })
}
