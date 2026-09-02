import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendIntoConversation } from '@/lib/aiAgent/channelSend'
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

// Sending a manual reply IS the takeover -- no separate "Взять диалог"
// action. Idempotent on an already-paused conversation.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!conversationId || !text) return NextResponse.json({ error: 'conversationId и text обязательны' }, { status: 400 })

  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
  const agentIds = (agents || []).map(a => a.id)
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id, paused_for_human')
    .eq('id', conversationId)
    .in('agent_id', agentIds)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 })

  if (!conversation.paused_for_human) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversationId)
  }

  const sendError = await sendIntoConversation(supabase, conversation, text)
  if (sendError) return NextResponse.json({ error: sendError }, { status: 502 })

  return NextResponse.json({ ok: true })
}
