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

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// AI-агент is admin-only for now -- same requireAdmin shape as
// src/app/api/ai-agent/settings/route.ts, kept as a separate check after
// requireUser so a logged-out caller still gets 401 Unauthorized and only a
// logged-in non-admin gets the distinct 403 admin_only body.
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

const VALID_DAYS = [7, 14, 30]

// Kazakhstan unified on UTC+5 country-wide in March 2024, so every timezone
// the settings route accepts (Asia/Almaty..Asia/Aqtau) is a fixed +5 offset
// today -- a constant shift is exact for day-bucketing, no tz library needed.
const KZ_OFFSET_MS = 5 * 60 * 60 * 1000

function kzDayKey(isoOrMs: string | number): string {
  return new Date(new Date(isoOrMs).getTime() + KZ_OFFSET_MS).toISOString().slice(0, 10)
}

// Per-day message counts + window totals for one agent or all of the
// caller's agents. Everything is computed from ai_agent_messages joined
// through ai_agent_conversations (agent_id lives on the conversation, not
// the message), plus wallet_ledger for spend.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const daysParam = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)
  const days = VALID_DAYS.includes(daysParam) ? daysParam : 30
  const agentIdParam = req.nextUrl.searchParams.get('agentId')

  // Scope: one owned agent (404 when the id isn't the caller's, same shape
  // as the settings route's ?agentId= lookup) or all of the caller's agents.
  let agentIds: string[]
  if (agentIdParam) {
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentIdParam)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agentIds = [agent.id]
  } else {
    const { data: agents, error } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    agentIds = (agents || []).map(a => a.id)
  }

  // Window: the last `days` KZ calendar days including today. sinceIso is
  // the UTC instant of KZ midnight on the earliest day.
  const shiftedNow = new Date(Date.now() + KZ_OFFSET_MS)
  const startShiftedMs = Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate() - (days - 1))
  const sinceIso = new Date(startShiftedMs - KZ_OFFSET_MS).toISOString()

  const dayKeys: string[] = []
  for (let i = 0; i < days; i++) {
    dayKeys.push(new Date(startShiftedMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  }
  const perDay: Record<string, { inbound: number; outbound: number }> = {}
  for (const key of dayKeys) perDay[key] = { inbound: 0, outbound: 0 }

  const conversationIds = new Set<string>()
  let replies = 0

  if (agentIds.length > 0) {
    // Single query via the FK embed: !inner makes the agent_id filter on the
    // joined conversation restrict the message rows themselves (a plain
    // embed would return all messages with a null join instead). Filtering
    // on the handful of agent ids keeps the request small no matter how
    // many conversations exist -- unlike a two-step conversation-ids fetch,
    // whose .in() list would grow unboundedly into the request URL.
    const { data: rows, error } = await supabase
      .from('ai_agent_messages')
      .select('direction, status, created_at, conversation_id, ai_agent_conversations!inner(agent_id)')
      .in('ai_agent_conversations.agent_id', agentIds)
      .gte('created_at', sinceIso)
      .limit(20000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    for (const row of rows || []) {
      const key = kzDayKey(row.created_at)
      const bucket = perDay[key]
      if (!bucket) continue // clock-skew safety: a row just outside the bucket range
      if (row.direction === 'inbound') {
        bucket.inbound++
        conversationIds.add(row.conversation_id)
      } else if (row.direction === 'outbound' && row.status === 'sent') {
        // Only actually-sent replies count -- a pending_review draft the
        // customer never saw isn't a reply (same rule as webhookHandler.ts's
        // history pairing).
        bucket.outbound++
        replies++
        conversationIds.add(row.conversation_id)
      }
    }
  }

  // Spend is account-wide by construction: wallet_ledger has no agent_id
  // column (the unified wallet debits per user), so the ?agentId= filter
  // can't narrow it -- the page's "Потрачено" card is the user's total
  // AI-reply spend for the window regardless of the agent picker.
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('wallet_ledger')
    .select('amount')
    .eq('user_id', user.id)
    .eq('type', 'ai_agent_reply')
    .gte('created_at', sinceIso)
    .limit(20000)
  if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 })
  // Debits are stored negative; spend reads as a positive ₸ figure.
  const spendTenge = Math.round((ledgerRows || []).reduce((sum, r) => sum + Math.max(0, -Number(r.amount)), 0))

  return NextResponse.json({
    days: dayKeys.map(date => ({ date, inbound: perDay[date].inbound, outbound: perDay[date].outbound })),
    totals: {
      conversations: conversationIds.size,
      replies,
      spendTenge,
    },
  })
}
