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

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

// «Переписка» -- every conversation across the caller's agents, newest
// activity first, with a last-message preview. Same batched-query shape
// as leads/route.ts's lastActivityByConversation (ai_agent_conversations
// has no updated_at column -- the latest message stands in for it), here
// also carrying the message TEXT for the preview, not just the timestamp.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { data: agents } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
  if (!agents || agents.length === 0) return NextResponse.json({ items: [] })
  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name

  const { data: conversations, error: convError } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, customer_handle, collected_name, created_at, paused_for_human')
    .in('agent_id', agents.map(a => a.id))
  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })
  if (!conversations || conversations.length === 0) return NextResponse.json({ items: [] })

  const conversationIds = conversations.map(c => c.id)
  const { data: messageRows } = await supabase
    .from('ai_agent_messages')
    .select('conversation_id, text, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })
  const previewByConversation: Record<string, { text: string; createdAt: string }> = {}
  for (const row of messageRows || []) {
    if (!previewByConversation[row.conversation_id]) previewByConversation[row.conversation_id] = { text: row.text, createdAt: row.created_at }
  }

  const items = conversations
    .map(c => ({
      id: c.id,
      agentId: c.agent_id,
      agentName: agentNameById[c.agent_id] || '',
      channel: c.channel || 'instagram',
      customerHandle: c.collected_name || c.customer_handle || 'клиент',
      lastMessagePreview: previewByConversation[c.id]?.text.slice(0, 140) || '',
      lastActivityAt: previewByConversation[c.id]?.createdAt || c.created_at,
      pausedForHuman: !!c.paused_for_human,
    }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))

  return NextResponse.json({ items })
}
