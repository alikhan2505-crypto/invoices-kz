import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAiReply } from '@/lib/instagramAiReply'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY, hasAiAgentBudget, AI_AGENT_BUDGET_DEPLETED_REPLY } from '@/lib/aiAgent/wallet'
import { findStopPhraseMatch, findTemplateMatch, STOP_PHRASE_ACK_TEXT } from '@/lib/aiAgent/webhookHandler'
import { buildAgentReplyContext, pickPreviewChannel } from '@/lib/aiAgent/replyContext'
import { findFlowTriggerMatch, parseFlowDefinition, firstStep, flowStepPreviewText } from '@/lib/aiAgent/flow'
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
// just without any channel send or DB persistence.
//
// Since 15.10.2026 it walks the SAME tiers, in the same order, as a live
// channel (see whatsappWebhookHandler.ts): start flow on the first message ->
// stop phrase -> template -> flow trigger -> wallet check -> AI reply built
// with the shared replyContext.ts builder (catalog, delivery, shop links,
// salon). Before, it skipped templates/flows, ignored the wallet (live
// channels answered with the canned text while the test chat showed a real
// AI answer) and prompted without the catalog or delivery. Still not
// mirrored: the invoice/booking tools -- they create real drafts in the
// database, which a browser-only preview must not do.
//
// `source` tells the panel what produced the reply (and whether it was paid).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

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

  // Live channels fire the agent's start flow on a customer's very first
  // message; an empty transcript is that moment here.
  if (rawHistory.length === 0) {
    const { data: startFlowRow } = await supabase
      .from('ai_agent_flows')
      .select('definition')
      .eq('agent_id', agent.id)
      .eq('is_start', true)
      .maybeSingle()
    const startDefinition = startFlowRow ? parseFlowDefinition(startFlowRow.definition) : null
    const entry = startDefinition ? firstStep(startDefinition) : undefined
    if (entry) return NextResponse.json({ replyText: flowStepPreviewText(entry), source: 'flow' })
  }

  // Stop-phrase preview: test-chat has no ai_agent_conversations row (the
  // transcript is browser-only), so there's nothing to persist paused
  // state onto -- but the CUSTOMER-facing effect of a stop-phrase match
  // (the fixed handoff text instead of an AI reply) is exactly the kind
  // of setting this tool exists to preview, same as tone/goal/custom
  // instructions already are. Checked per-message, statelessly: unlike a
  // real channel, test-chat never "stays paused" across messages -- there
  // is no owner-side inbox conversation here to hand off to. Free, like
  // the real ack (no Anthropic call, no wallet debit).
  if (findStopPhraseMatch(message, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    return NextResponse.json({ replyText: STOP_PHRASE_ACK_TEXT, source: 'stop_phrase' })
  }

  // Templates, then flow triggers -- free tiers, same scope as a DM on a
  // live channel (dm-scoped and unscoped templates).
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', agent.id)
    .or('channel.is.null,channel.eq.dm')
    .order('created_at', { ascending: true })
  const templateMatch = findTemplateMatch(message, templates || [])
  if (templateMatch) return NextResponse.json({ replyText: templateMatch.reply_text, source: 'template' })

  const { data: flows } = await supabase
    .from('ai_agent_flows')
    .select('id, trigger_words, definition')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: true })
  const matchedFlowId = findFlowTriggerMatch(message, flows || [])
  const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
  const matchedDefinition = matchedFlow ? parseFlowDefinition(matchedFlow.definition) : null
  const flowEntry = matchedDefinition ? firstStep(matchedDefinition) : undefined
  if (flowEntry) return NextResponse.json({ replyText: flowStepPreviewText(flowEntry), source: 'flow' })

  // Same wallet gate as every live channel: below the price of one reply the
  // customer gets the canned text, so the preview shows exactly that (free,
  // no model call) instead of an AI answer nobody would actually receive.
  if (!(await hasAiAgentBudget(user.id))) {
    return NextResponse.json({ replyText: AI_AGENT_BUDGET_DEPLETED_REPLY, source: 'budget_depleted', budgetDepleted: true })
  }

  // Prompt as on the agent's connected channel (WhatsApp first), with the
  // same catalog/delivery/shop-links/salon context the live reply gets.
  const { data: activeConnections } = await supabase
    .from('ai_agent_channel_connections')
    .select('channel')
    .eq('agent_id', agent.id)
    .eq('status', 'active')
  const channel = pickPreviewChannel((activeConnections || []).map(c => c.channel))

  let replyText: string
  try {
    const replyContext = await buildAgentReplyContext(supabase, agent, { channel, withSalon: true })
    const result = await generateAiReply({
      incomingText: message,
      fromUsername: 'Клиент',
      source: 'dm',
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      businessContextLine: replyContext.businessContextLine,
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

  return NextResponse.json({ replyText, source: 'ai' })
}
