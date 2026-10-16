import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasAiAgentPlan, aiAgentAccessLevel, AI_AGENT_PROFILE_COLUMNS, type AiAgentAccess } from '@/lib/aiAgent/planGate'
import { VISIBLE_IN_DIALOG_FILTER } from '@/lib/aiAgent/dialogVisibility'

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

// Решение основателя 3 (16.10.2026): когда Про кончился, агент молчит, но
// переписка остаётся открытой НА ЧТЕНИЕ -- если агенты у владельца есть.
// Ответить (dialogs/reply) и вернуть боту (dialogs/release) по-прежнему
// можно только на Про.
async function dialogsAccess(userId: string): Promise<AiAgentAccess> {
  const { data: profile } = await supabase.from('profiles').select(AI_AGENT_PROFILE_COLUMNS).eq('id', userId).single()
  if (hasAiAgentPlan(profile)) return 'full'
  const { count } = await supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  return aiAgentAccessLevel(profile, (count ?? 0) > 0)
}

const MESSAGES_LIMIT = 200

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await dialogsAccess(user.id)
  if (access === 'none') return NextResponse.json({ error: 'admin_only' }, { status: 403 })
  const readOnly = access === 'read_only'

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

  // Only what the customer actually saw: every inbound row plus outbound rows
  // that were really sent. A skipped (rejected) or still-pending draft used to
  // render as an «ИИ» bubble, as if the customer had received it.
  // The NEWEST N, shown oldest-first: ordering ascending with a limit
  // returned the first 200 messages forever and hid everything after them.
  const { data: newestFirst, error } = await supabase
    .from('ai_agent_messages')
    .select('id, direction, text, is_ai_generated, created_at')
    .eq('conversation_id', conversationId)
    .or(VISIBLE_IN_DIALOG_FILTER)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_LIMIT)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const messages = (newestFirst || []).slice().reverse()

  return NextResponse.json({
    readOnly,
    messages: messages.map(m => ({
      id: m.id, direction: m.direction, text: m.text, isAiGenerated: m.is_ai_generated, createdAt: m.created_at,
    })),
  })
}
