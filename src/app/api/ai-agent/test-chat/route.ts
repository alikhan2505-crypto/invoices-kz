import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, AgentTone, AgentGoal } from '@/lib/aiAgent/promptContext'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from '@/lib/aiAgent/wallet'

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

const MAX_MESSAGE_LEN = 2000
// Mirrors webhookHandler.ts's slice(-5) fallback for agents predating the
// history_pairs column (or with it unset).
const DEFAULT_HISTORY_PAIRS = 5
// The transcript lives only in the browser (test-chat messages are
// deliberately NOT persisted -- no ai_agent_conversations/_messages rows),
// so the client-supplied history is untrusted input: cap the raw entry
// count before pairing so a hostile payload can't inflate the prompt.
const MAX_RAW_HISTORY_ENTRIES = 60

// The owner chatting with their own agent to try it out before (or without)
// connecting a real channel. Same generation + billing path as a real DM
// reply -- generateAiReply on the paid Anthropic API, then a wallet debit --
// just without any Instagram send or DB persistence.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json()
  const { agentId, message, history } = body

  if (!agentId || typeof agentId !== 'string') return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (typeof message !== 'string' || message.trim().length === 0) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return NextResponse.json({ error: 'message too long' }, { status: 400 })

  // Ownership check -- exactly the settings route's ?agentId= shape: 404 for
  // an agent that doesn't exist OR belongs to someone else (no distinction
  // leaked).
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Pair the client transcript into the {incoming, reply} exchanges
  // generateAiReply expects -- same pairing walk as webhookHandler.ts's DM
  // history fetch (an inbound followed by the next agent reply forms a
  // pair), then capped to the agent's configured history_pairs.
  const rawHistory: { role: string; text: string }[] = Array.isArray(history)
    ? history
        .filter((h: unknown): h is { role: string; text: string } =>
          !!h && typeof h === 'object'
          && typeof (h as any).role === 'string'
          && typeof (h as any).text === 'string')
        .slice(-MAX_RAW_HISTORY_ENTRIES)
    : []
  const pairs: { incoming: string; reply: string }[] = []
  let pendingIncoming: string | null = null
  for (const h of rawHistory) {
    if (h.role === 'user') {
      pendingIncoming = h.text.slice(0, MAX_MESSAGE_LEN)
    } else if (h.role === 'agent' && pendingIncoming) {
      pairs.push({ incoming: pendingIncoming, reply: h.text.slice(0, MAX_MESSAGE_LEN) })
      pendingIncoming = null
    }
  }
  const pairsCap = Number.isInteger(agent.history_pairs) && agent.history_pairs > 0
    ? agent.history_pairs
    : DEFAULT_HISTORY_PAIRS
  const conversationHistory = pairs.slice(-pairsCap)

  const businessContextLine = buildBusinessContextLine({
    name: agent.name,
    tone: agent.tone as AgentTone,
    description: agent.business_description,
    goal: agent.goal as AgentGoal,
    collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined,
    timezone: agent.timezone || undefined,
    currency: agent.currency || undefined,
    customInstructions: typeof agent.custom_instructions === 'string' ? agent.custom_instructions : undefined,
  })

  let replyText: string
  try {
    const result = await generateAiReply({
      incomingText: message,
      fromUsername: 'Клиент',
      source: 'dm',
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      businessContextLine,
    })
    replyText = result.replyText
  } catch (err: any) {
    console.error('ai-agent test-chat: AI reply generation failed for agent', agentId, ':', err.message)
    return NextResponse.json({ error: 'ai_generation_failed' }, { status: 502 })
  }

  // Honest billing: a test reply costs exactly what a real one does (the
  // Anthropic call above was just as real). Debit failure is logged but
  // never blocks returning the reply -- same best-effort contract as
  // webhookHandler.ts's live-reply debit.
  try {
    await debitAiAgentWallet(user.id, AI_AGENT_CREDITS_PER_AI_REPLY, 'Тестовый чат')
  } catch (walletErr: any) {
    console.error('ai-agent test-chat: wallet debit failed for user', user.id, ':', walletErr.message)
  }

  return NextResponse.json({ replyText })
}
