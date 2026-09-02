import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { replyToComment, sendDirectMessage, InstagramApiError } from '@/lib/instagram'
import { sendTelegramBotMessage, TelegramApiError } from '@/lib/aiAgent/telegram'
import { sendWhatsAppMessage, WhatsAppApiError } from '@/lib/whatsapp'
import { extractTriggerWords } from '@/lib/instagramAiReply'
import { shouldExitTraining } from '@/lib/aiAgent/trainingStatus'
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

// AI-агент is admin-only for now (founder decision, not yet a public plan
// perk) -- same requireAdmin shape as src/app/api/kaspi/admin-stats/route.ts
// and src/app/api/kaspi-shop/niches/{request,result}/route.ts, kept as a
// separate check after requireUser (rather than folded into one function)
// so a logged-out caller still gets 401 Unauthorized and only a logged-in
// non-admin gets the distinct 403 admin_only body.
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  // Multi-agent (2026-08-20): the review queue defaults to aggregating
  // across ALL of the user's agents -- chosen as the least-invasive correct
  // option since a second agent could otherwise make the old .maybeSingle()
  // error (data: null), silently emptying the queue. That default is
  // UNCHANGED (matches how the user actually works it -- approve/skip
  // everything pending, whichever agent it came from). An optional
  // ?agentId= (2026-09-02) narrows to one owned agent instead, same
  // 404-if-not-owned shape as leads/route.ts and dialogs/route.ts, for when
  // the caller wants to focus on a single agent's drafts. POST needs no
  // change: it resolves message -> conversation -> agent and
  // ownership-checks that agent by user_id per item.
  const agentIdParam = req.nextUrl.searchParams.get('agentId')
  let agents: { id: string; name: string }[]
  if (agentIdParam) {
    const { data: agent } = await supabase.from('ai_agents').select('id, name').eq('id', agentIdParam).eq('user_id', user.id).maybeSingle()
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    agents = [agent]
  } else {
    const { data } = await supabase.from('ai_agents').select('id, name').eq('user_id', user.id)
    agents = data || []
  }
  if (agents.length === 0) return NextResponse.json({ items: [], pendingCount: 0 })
  const agentNameById: Record<string, string> = {}
  for (const a of agents) agentNameById[a.id] = a.name

  const { data: conversations } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, customer_handle, channel')
    .in('agent_id', agents.map(a => a.id))
  const conversationIds = (conversations || []).map(c => c.id)
  const conversationMeta: Record<string, { handle: string; channel: string; agentId: string; agentName: string }> = {}
  for (const c of conversations || []) conversationMeta[c.id] = {
    handle: c.customer_handle || 'клиент',
    channel: c.channel || 'instagram',
    agentId: c.agent_id,
    agentName: agentNameById[c.agent_id] || '',
  }

  if (conversationIds.length === 0) return NextResponse.json({ items: [], pendingCount: 0 })

  const { data: messages } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, urgent, regen_count, created_at')
    .in('conversation_id', conversationIds)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })

  // The customer question that triggered each draft: the latest inbound row
  // in the same conversation at-or-before the draft's own created_at (the
  // webhook pipeline always inserts the inbound row first, then the draft).
  // One batched fetch over just the conversations that actually have pending
  // drafts, walked in memory -- not a per-draft query.
  const pendingConvIds = Array.from(new Set((messages || []).map(m => m.conversation_id)))
  const inboundByConversation: Record<string, { text: string; created_at: string }[]> = {}
  if (pendingConvIds.length > 0) {
    const { data: inboundRows } = await supabase
      .from('ai_agent_messages')
      .select('conversation_id, text, created_at')
      .in('conversation_id', pendingConvIds)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: true })
    for (const row of inboundRows || []) {
      ;(inboundByConversation[row.conversation_id] ||= []).push({ text: row.text, created_at: row.created_at })
    }
  }
  function questionFor(m: { conversation_id: string; created_at: string }): string {
    const rows = inboundByConversation[m.conversation_id] || []
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].created_at <= m.created_at) return rows[i].text
    }
    return ''
  }

  const items = (messages || []).map(m => ({
    id: m.id,
    agentId: conversationMeta[m.conversation_id]?.agentId || '',
    agentName: conversationMeta[m.conversation_id]?.agentName || '',
    customerHandle: conversationMeta[m.conversation_id]?.handle || 'клиент',
    channel: conversationMeta[m.conversation_id]?.channel || 'instagram',
    question: questionFor(m),
    text: m.text,
    urgent: m.urgent,
    regenCount: m.regen_count ?? 0,
    createdAt: m.created_at,
  }))
  // pendingCount duplicates items.length today, but it's a stable contract
  // for other consumers (the settings page reads just the count).
  // Invoice drafts count toward the badge too (spec: «the existing
  // pending-count badge includes invoice drafts») -- the settings page
  // consumes this number, so without it a pending draft is invisible
  // everywhere except the review page itself.
  const { count: draftCount } = await supabase
    .from('ai_agent_invoice_drafts')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', agents.map(a => a.id))
    .in('status', ['pending_approval', 'error'])

  return NextResponse.json({ items, pendingCount: items.length + (draftCount || 0) })
}

// One action endpoint, mirroring how this codebase's other approve-queue
// features (e.g. the single-tenant bot's Telegram ig_reply_send/skip
// callbacks) keep send/edit/skip as one small state machine rather than
// three separate routes.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { messageId, action, editedText } = await req.json()
  if (!messageId || !['send', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const { data: message } = await supabase
    .from('ai_agent_messages')
    .select('id, conversation_id, text, status, is_ai_generated, created_at')
    .eq('id', messageId)
    .eq('status', 'pending_review')
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id')
    .eq('id', message.conversation_id)
    .single()
  if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conversation.agent_id).eq('user_id', user.id).single()
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const finalText = action === 'send' && typeof editedText === 'string' && editedText.trim() ? editedText.trim() : message.text

  // Filled by the approve branch when a template actually gets created --
  // returned to the UI so it can show «Триггеры для шаблона: …» honestly
  // (only when they really exist, never as a promise).
  let triggerWords: string[] = []

  if (action === 'send') {
    const { data: connection } = await supabase
      .from('ai_agent_channel_connections')
      .select('id, access_token_enc, external_account_id')
      .eq('agent_id', agent.id)
      .eq('channel', conversation.channel)
      .single()
    if (!connection) return NextResponse.json({ error: 'channel_not_connected' }, { status: 400 })

    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    try {
      // ai_agent_conversations.external_thread_id doubles as the reply
      // target for both comment and DM sends, same as the single-tenant
      // bot's reply_target column.
      if (conversation.channel === 'instagram') {
        // A conversation thread doesn't record whether it's a comment
        // thread or a DM thread today -- v1 review-queue sends only ever
        // apply to DMs in practice (comment replies are short and public,
        // less likely to need editing before sending), but if a comment
        // draft ever reaches this queue, sendDirectMessage would be wrong.
        // Flagged here rather than silently guessed -- if comment drafts
        // do reach training-mode review in practice, this needs a
        // source column on ai_agent_conversations (or ai_agent_messages)
        // to pick the right send function.
        await sendDirectMessage(conversation.external_thread_id, finalText, { igUserId: connection.external_account_id, accessToken })
      } else if (conversation.channel === 'telegram') {
        // For telegram rows access_token_enc holds the encrypted BotFather
        // token (same column, same encryption -- see telegram/connect) and
        // external_thread_id is the Telegram chat.id.
        await sendTelegramBotMessage(accessToken, conversation.external_thread_id, finalText)
      } else if (conversation.channel === 'whatsapp') {
        // connection.external_account_id is the Cloud API phone_number_id
        // (see whatsapp/callback route); external_thread_id is the
        // customer's WhatsApp phone number (wa_id).
        await sendWhatsAppMessage(connection.external_account_id, conversation.external_thread_id, finalText, { accessToken })
      }
    } catch (e: any) {
      console.error('ai-agent review: send failed for message', messageId, ':', e.message)
      // Same 401 -> token_expired marker as the webhook path (Task 8) --
      // per the design spec's error-handling section, a dead token surfaces
      // as a reconnect banner on the settings page (Task 6), not a retry
      // loop against a token that will never work again. A Telegram 401
      // means the bot token was revoked via BotFather; a WhatsApp 401 means
      // the Embedded Signup token was revoked -- same treatment both ways.
      if ((e instanceof InstagramApiError && e.status === 401) || (e instanceof TelegramApiError && e.status === 401) || (e instanceof WhatsAppApiError && e.status === 401)) {
        await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connection.id)
      }
      return NextResponse.json({ error: 'send_failed' }, { status: 502 })
    }

    await supabase.from('ai_agent_messages').update({ status: 'sent', text: finalText }).eq('id', messageId)
    try {
      await debitAiAgentWallet(user.id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: одобрено в режиме обучения')
    } catch (e: any) {
      console.error('ai-agent review: wallet debit failed for user', user.id, ':', e.message)
    }

    // Turn the approved AI reply into a reusable per-agent template, exactly
    // like the single-tenant bot's telegram-webhook approve handler does for
    // instagram_reply_templates (2026-08-20: before this, NOTHING wrote
    // ai_agent_reply_templates rows -- training mode never actually taught
    // the agent anything). Scoped to 'dm': review-queue sends are DM-shaped
    // on both channels (sendDirectMessage / sendTelegramBotMessage above),
    // and the telegram pipeline matches dm-scoped templates too -- so the
    // template can never fire on a public Instagram comment. Best-effort:
    // a failure here must not affect the reply already sent to the customer.
    if (message.is_ai_generated) {
      const { data: questionRow } = await supabase
        .from('ai_agent_messages')
        .select('text')
        .eq('conversation_id', conversation.id)
        .eq('direction', 'inbound')
        .lte('created_at', message.created_at)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (questionRow?.text) {
        try {
          triggerWords = await extractTriggerWords(questionRow.text)
          if (triggerWords.length > 0) {
            await supabase.from('ai_agent_reply_templates').insert({
              agent_id: agent.id,
              trigger_words: triggerWords,
              reply_text: finalText,
              channel: 'dm',
            })
          }
        } catch (e: any) {
          triggerWords = []
          console.error('ai-agent review: failed to save approved reply as template for', messageId, ':', e.message)
        }
      }
    }
  } else {
    await supabase.from('ai_agent_messages').update({ status: 'skipped' }).eq('id', messageId)
  }

  const nextCount = agent.training_message_count + 1
  const exit = shouldExitTraining(
    { status: agent.status, trainingStartedAt: agent.training_started_at, trainingMessageCount: nextCount },
    new Date()
  )
  await supabase.from('ai_agents').update({
    training_message_count: nextCount,
    ...(exit ? { status: 'active' } : {}),
  }).eq('id', agent.id)

  return NextResponse.json({ ok: true, exitedTraining: exit, triggerWords })
}
