import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WA_FREE_SERVICE_PER_MONTH } from '@/lib/whatsapp'
import { hasAiAgentPlan, AI_AGENT_PROFILE_COLUMNS } from '@/lib/aiAgent/planGate'
import { waUsageMonthWindow, waUsageLevel, broadcastSentWithoutHistory } from '@/lib/aiAgent/waUsage'

// Счётчик бесплатных ответов WhatsApp, этап 1 (16.10.2026): сколько служебных
// сообщений ушло с номера в этом месяце (по Алматы), из уже записанного в
// базе, без новых таблиц. Источник:
//   ai_agent_messages, direction = 'outbound', status = 'sent',
//   external_id IS NULL -- так отсекается то, что владелец написал со своего
//   телефона (зеркало Coexistence пишется с wamid в external_id, см.
//   handleWhatsAppEcho), а ответы агента, шаблоны, ручные ответы из
//   «Диалогов» и рассылки (их история с 16.10) пишутся без него;
//   + ai_agent_broadcasts.sent_count только для рассылок, созданных ДО того,
//   как рассылки начали писать историю (иначе двойной счёт).
// Сценарии и «не понимаю такой формат» в базу не пишутся -- поэтому
// «примерно» (approximate: true всегда). Ответы НИКОГДА не блокируются.
//
// ?agentId= -- только этот агент; без него -- все WhatsApp-номера владельца.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const IN_CHUNK = 200

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

async function countSentForAgent(agentId: string, sinceIso: string): Promise<number> {
  const { data: conversations, error: convError } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', agentId)
    .eq('channel', 'whatsapp')
  if (convError) throw new Error(convError.message)
  const ids = (conversations || []).map(c => c.id)
  let total = 0
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    // head + count: только число, без строк -- потолок PostgREST в 1000 строк
    // здесь не мешает.
    const { count, error } = await supabase
      .from('ai_agent_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', ids.slice(i, i + IN_CHUNK))
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .is('external_id', null)
      .gte('created_at', sinceIso)
    if (error) throw new Error(error.message)
    total += count ?? 0
  }

  const { data: broadcasts, error: bError } = await supabase
    .from('ai_agent_broadcasts')
    .select('created_at, sent_count')
    .eq('agent_id', agentId)
    .eq('channel', 'whatsapp')
    .gte('created_at', sinceIso)
  if (bError) throw new Error(bError.message)
  return total + broadcastSentWithoutHistory(broadcasts || [])
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select(AI_AGENT_PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
  if (!hasAiAgentPlan(profile)) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const agentIdParam = req.nextUrl.searchParams.get('agentId')
  let agentsQuery = supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
  if (agentIdParam) agentsQuery = agentsQuery.eq('id', agentIdParam)
  const { data: agents, error: agentsError } = await agentsQuery
  if (agentsError) return NextResponse.json({ error: agentsError.message }, { status: 500 })
  if (agentIdParam && (!agents || agents.length === 0)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const window = waUsageMonthWindow(Date.now())
  const base = { limit: WA_FREE_SERVICE_PER_MONTH, monthStart: window.startIso, resetsAt: window.resetIso, approximate: true }
  const agentIds = (agents || []).map(a => a.id)
  if (agentIds.length === 0) return NextResponse.json({ ...base, numbers: [] })

  const { data: connections, error: connError } = await supabase
    .from('ai_agent_channel_connections')
    .select('agent_id, external_account_name, status')
    .in('agent_id', agentIds)
    .eq('channel', 'whatsapp')
    .eq('status', 'active')
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 })

  const nameById = new Map((agents || []).map(a => [a.id, a.name as string]))
  try {
    const numbers = await Promise.all((connections || []).map(async c => {
      const used = await countSentForAgent(c.agent_id, window.startIso)
      return {
        agentId: c.agent_id,
        agentName: nameById.get(c.agent_id) || '',
        phone: c.external_account_name || null,
        used,
        level: waUsageLevel(used, WA_FREE_SERVICE_PER_MONTH),
      }
    }))
    return NextResponse.json({ ...base, numbers })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'usage_failed' }, { status: 500 })
  }
}
