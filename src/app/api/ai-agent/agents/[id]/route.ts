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

// Same admin-only gating as every other ai-agent route (see
// src/app/api/ai-agent/settings/route.ts for the rationale).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

// Hard delete -- MoonAI-style (docs/superpowers/mooonai-research-findings.md
// §8): no archive/soft-delete path, the UI gates this behind a
// type-the-agent's-name confirm modal. The child tables' FKs have no ON
// DELETE CASCADE, so children are deleted manually in FK-safe order:
// messages (via the agent's conversation ids) -> conversations ->
// channel connections -> reply templates -> the agent row itself.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { id } = await params

  // Ownership check first -- the service-role client bypasses RLS, so
  // without the user_id filter any authenticated admin could delete another
  // user's agent by guessing its uuid.
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: conversations } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', agent.id)
  const conversationIds = (conversations || []).map(c => c.id)

  if (conversationIds.length > 0) {
    const { error: msgError } = await supabase
      .from('ai_agent_messages')
      .delete()
      .in('conversation_id', conversationIds)
    if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  const { error: convError } = await supabase.from('ai_agent_conversations').delete().eq('agent_id', agent.id)
  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })

  const { error: connError } = await supabase.from('ai_agent_channel_connections').delete().eq('agent_id', agent.id)
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 })

  const { error: tplError } = await supabase.from('ai_agent_reply_templates').delete().eq('agent_id', agent.id)
  if (tplError) return NextResponse.json({ error: tplError.message }, { status: 500 })

  const { error: agentError } = await supabase.from('ai_agents').delete().eq('id', agent.id).eq('user_id', user.id)
  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
