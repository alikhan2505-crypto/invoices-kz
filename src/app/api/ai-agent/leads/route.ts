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

// AI-агент is admin-only for now -- same requireAdmin shape as
// src/app/api/ai-agent/settings/route.ts, kept as a separate check after
// requireUser so a logged-out caller still gets 401 Unauthorized and only a
// logged-in non-admin gets the distinct 403 admin_only body.
async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// Заявки: EVERY conversation is a lead from its first message (2026-08-27
// pipeline redesign) -- the old collected_data-non-empty filter is gone.
// A lead with no extracted data just shows an empty chip row on its card.
// ?agentId= narrows to one owned agent (404 if not owned, same shape as the
// analytics/settings routes' ?agentId= lookup); omitted, every one of the
// caller's agents is included.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const agentIdParam = req.nextUrl.searchParams.get('agentId')

  let agents: { id: string; name: string }[]
  if (agentIdParam) {
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('id, name')
      .eq('id', agentIdParam)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agents = [agent]
  } else {
    const { data, error } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    agents = data || []
  }
  if (agents.length === 0) return NextResponse.json({ items: [] })

  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name

  const { data: conversations, error: convError } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, customer_handle, collected_data, lead_status, created_at')
    .in('agent_id', agents.map(a => a.id))
  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversations || conversations.length === 0) return NextResponse.json({ items: [] })

  // "Last-updated": ai_agent_conversations has no updated_at column, so the
  // latest message in each conversation stands in for it -- same
  // batched-fetch-then-walk shape as the review route's
  // inboundByConversation.
  const conversationIds = conversations.map(c => c.id)
  const { data: messageRows } = await supabase
    .from('ai_agent_messages')
    .select('conversation_id, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })
  const lastActivityByConversation: Record<string, string> = {}
  for (const row of messageRows || []) {
    if (!lastActivityByConversation[row.conversation_id]) lastActivityByConversation[row.conversation_id] = row.created_at
  }

  const items = conversations
    .map(c => ({
      id: c.id,
      agentId: c.agent_id,
      agentName: agentNameById[c.agent_id] || '',
      channel: c.channel || 'instagram',
      customerHandle: c.customer_handle || 'клиент',
      collectedData: (c.collected_data && typeof c.collected_data === 'object' && !Array.isArray(c.collected_data)
        ? c.collected_data : {}) as Record<string, string>,
      leadStatus: (c.lead_status || 'new') as 'new' | 'in_progress' | 'closed',
      lastActivityAt: lastActivityByConversation[c.id] || c.created_at,
      createdAt: c.created_at,
    }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))

  return NextResponse.json({ items })
}
