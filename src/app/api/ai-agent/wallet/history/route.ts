import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TYPE_LABELS: Record<string, string> = {
  topup: 'Пополнение',
  ai_agent_reply: 'ИИ-ответ',
}

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

  // Unified wallet_ledger holds every wallet-spend category for a user;
  // filtered to this product's own debit type since a shared 'topup' can no
  // longer be attributed to one specific product page (see task-3 brief).
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('type, amount, note, created_at')
    .eq('user_id', user.id)
    .in('type', ['ai_agent_reply'])
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries = (data || []).map(row => ({
    label: row.note || TYPE_LABELS[row.type] || row.type,
    amount: Number(row.amount),
    createdAt: row.created_at,
  }))
  return NextResponse.json({ entries })
}
