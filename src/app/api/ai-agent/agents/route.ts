import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// AI-агент is admin-only for now (founder decision, not yet a public plan
// perk) -- same requireAdmin shape as src/app/api/ai-agent/settings/route.ts,
// kept as a separate check after requireUser so a logged-out caller still
// gets 401 Unauthorized and only a logged-in non-admin gets the distinct
// 403 admin_only body.
async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Lists the caller's agents (multi-agent since 2026-08-20) newest-first,
// with each agent's channel connections attached. Two queries total --
// agents, then one .in() over all their ids -- joined in JS, no N+1.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { data: agents, error } = await supabase
    .from('ai_agents')
    .select('id, name, tone, goal, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agentIds = (agents || []).map(a => a.id)
  const { data: connections } = agentIds.length > 0
    ? await supabase
        .from('ai_agent_channel_connections')
        .select('agent_id, channel, external_account_id, external_account_name, status')
        .in('agent_id', agentIds)
    : { data: [] }

  const connectionsByAgent: Record<string, { channel: string; external_account_id: string; external_account_name: string | null; status: string }[]> = {}
  for (const c of connections || []) {
    if (!connectionsByAgent[c.agent_id]) connectionsByAgent[c.agent_id] = []
    connectionsByAgent[c.agent_id].push({ channel: c.channel, external_account_id: c.external_account_id, external_account_name: c.external_account_name, status: c.status })
  }

  return NextResponse.json({
    agents: (agents || []).map(a => ({
      id: a.id,
      name: a.name,
      tone: a.tone,
      goal: a.goal,
      status: a.status,
      createdAt: a.created_at,
      connections: connectionsByAgent[a.id] || [],
    })),
  })
}
