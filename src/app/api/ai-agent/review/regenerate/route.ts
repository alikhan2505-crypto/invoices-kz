import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCatalogBlock, AgentTone, AgentGoal } from '@/lib/aiAgent/promptContext'
import { loadAgentCatalog } from '@/lib/aiAgent/catalogContext'
import { pairConversationHistory } from '@/lib/aiAgent/telegram'
import { debitAiAgentWallet, hasAiAgentBudget } from '@/lib/aiAgent/wallet'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Founder's billing rule (2026-08-20): the first 3 regenerations of a draft
// are free, every one after that costs 1 credit (5 ₸) off the unified
// wallet. Tracked per-message in ai_agent_messages.regen_count.
const FREE_REGENS = 3

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Same admin gate as ../route.ts (and settings/route.ts): logged-out -> 401,
// logged-in non-admin -> distinct 403 admin_only.
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

// «Другой вариант»: re-runs the exact same reply pipeline the webhook
// handlers run (same buildBusinessContextLine fields incl.
// custom_instructions + channel, same history pairing, same generateAiReply)
// against the draft's triggering inbound message, and UPDATES the pending
// draft in place.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { messageId } = await req.json()
  if (!messageId) return NextResponse.json({ error: 'invalid request' }, { status: 400 })

  const { data: message } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, status, regen_count, created_at')
    .eq('id', messageId)
    .eq('status', 'pending_review')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, customer_handle')
    .eq('id', message.conversation_id)
    .single()
  if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Ownership: message -> conversation -> agent -> user_id.
  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conversation.agent_id).eq('user_id', user.id).single()
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The customer question this draft answers: latest inbound row in the
  // conversation at-or-before the draft (the pipeline inserts the inbound
  // row first, then the draft).
  const { data: questionRow } = await supabase
    .from('ai_agent_messages')
    .select('text')
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound')
    .lte('created_at', message.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!questionRow?.text) return NextResponse.json({ error: 'question_not_found' }, { status: 400 })

  const priorCount = typeof message.regen_count === 'number' ? message.regen_count : 0

  // Checked before the AI call (not just before the debit further down) so
  // a depleted wallet also skips the real Anthropic cost of a regeneration
  // that could never be billed -- founder's explicit ask to extend the
  // Kaspi Cashier mint-time gate to every unified-wallet spend, including
  // this one (previously it always regenerated and just logged a failed
  // debit, per the now-superseded "gating happens at top-up time" note
  // below).
  if (priorCount >= FREE_REGENS && !(await hasAiAgentBudget(user.id))) {
    return NextResponse.json({ error: 'insufficient_balance' }, { status: 402 })
  }

  // Conversation history, rebuilt with the SAME pairing rule as the pipeline
  // that produced the draft (inbound paired with the next *sent* outbound --
  // the pending draft itself is not 'sent', so it's naturally excluded, and
  // the triggering inbound stays unpaired rather than leaking into history).
  // Telegram and WhatsApp mirror telegramWebhookHandler.ts /
  // whatsappWebhookHandler.ts (same pairConversationHistory helper),
  // Instagram mirrors webhookHandler.ts's dm branch -- review-queue drafts
  // are DM-shaped on all three channels (see ../route.ts's send handler).
  let conversationHistory: { incoming: string; reply: string }[] | undefined
  if (conversation.channel === 'telegram' || conversation.channel === 'whatsapp') {
    const historyPairs = typeof agent.history_pairs === 'number' && agent.history_pairs >= 0 ? agent.history_pairs : 5
    if (historyPairs > 0) {
      const { data: historyRows } = await supabase
        .from('ai_agent_messages')
        .select('direction, text, status, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(Math.min(historyPairs * 4, 80))
      const pairs = pairConversationHistory((historyRows || []).slice().reverse(), historyPairs)
      if (pairs.length > 0) conversationHistory = pairs
    }
  } else {
    const { data: historyRows } = await supabase
      .from('ai_agent_messages')
      .select('direction, text, status, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(20)
    const pairs: { incoming: string; reply: string }[] = []
    let pendingIncoming: string | null = null
    for (const row of historyRows || []) {
      if (row.direction === 'inbound') {
        pendingIncoming = row.text
      } else if (row.direction === 'outbound' && row.status === 'sent' && pendingIncoming) {
        pairs.push({ incoming: pendingIncoming, reply: row.text })
        pendingIncoming = null
      }
    }
    const historyPairs = typeof agent.history_pairs === 'number' && agent.history_pairs >= 1 ? agent.history_pairs : 5
    if (pairs.length > 0) conversationHistory = pairs.slice(-historyPairs)
  }

  let replyText: string
  let urgent: boolean
  try {
    // Same catalog context the live webhook pipelines use -- without it a
    // regenerated variant of a price question loses the real prices the
    // original draft had (final-review finding M2). No invoiceTool here:
    // «Другой вариант» regenerates TEXT, it must not create drafts.
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: questionRow.text,
      fromUsername: conversation.customer_handle || 'клиент',
      source: 'dm',
      conversationHistory,
      businessContextLine: buildBusinessContextLine({
        name: agent.name,
        tone: agent.tone as AgentTone,
        description: agent.business_description,
        goal: agent.goal as AgentGoal,
        collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined,
        timezone: agent.timezone || undefined,
        currency: agent.currency || undefined,
        customInstructions: typeof agent.custom_instructions === 'string' ? agent.custom_instructions : undefined,
        channel: conversation.channel === 'telegram' ? 'telegram' : conversation.channel === 'whatsapp' ? 'whatsapp' : 'instagram',
      }) + catalogBlock,
    })
    replyText = result.replyText
    urgent = result.urgent
  } catch (e: any) {
    console.error('ai-agent regenerate: AI reply generation failed for message', messageId, ':', e.message)
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 })
  }

  const newCount = priorCount + 1

  // Guarded update: .eq('regen_count', priorCount) makes two concurrent
  // regens of the same draft claim distinct counts instead of both landing
  // on (and both being billed as, or both being free as) the same slot.
  const { data: updated } = await supabase
    .from('ai_agent_messages')
    .update({ text: replyText, urgent, regen_count: newCount })
    .eq('id', messageId)
    .eq('status', 'pending_review')
    .eq('regen_count', priorCount)
    .select('id')
  if (!updated || updated.length === 0) return NextResponse.json({ error: 'conflict' }, { status: 409 })

  // Paid regen: the balance was already confirmed sufficient above before
  // any AI call was made, so this debit itself stays best-effort (same
  // contract as every send path) -- the regenerated text is already saved,
  // a failed debit here is a transient DB issue, logged, never rolled back.
  if (priorCount >= FREE_REGENS) {
    try {
      await debitAiAgentWallet(user.id, 1, 'Перегенерация ответа')
    } catch (e: any) {
      console.error('ai-agent regenerate: wallet debit failed for user', user.id, ':', e.message)
    }
  }

  return NextResponse.json({
    replyText,
    urgent,
    freeRegensLeft: Math.max(0, FREE_REGENS - newCount),
  })
}
