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

async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'conversationId обязателен' }, { status: 400 })

  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  const agentIds = (agents || []).map(a => a.id)
  if (agentIds.length === 0) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('id', conversationId)
    .in('agent_id', agentIds)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  const { data: messages, error } = await supabase
    .from('ai_agent_messages')
    .select('id, direction, text, is_ai_generated, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    messages: (messages || []).map(m => ({
      id: m.id, direction: m.direction, text: m.text, isAiGenerated: m.is_ai_generated, createdAt: m.created_at,
    })),
  })
}
