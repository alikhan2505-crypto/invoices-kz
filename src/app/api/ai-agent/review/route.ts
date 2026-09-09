import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'
import { replyToComment, sendDirectMessage, sendDirectImage, InstagramApiError } from '@/lib/instagram'
import { pickProductPhoto } from '@/lib/aiAgent/productPhoto'
import { loadAgentCatalog } from '@/lib/aiAgent/catalogContext'
import { sendTelegramBotMessage, sendTelegramBotPhoto, TELEGRAM_CAPTION_MAX, TelegramApiError } from '@/lib/aiAgent/telegram'
import { sendWhatsAppImage, sendWhatsAppMessage, WhatsAppApiError } from '@/lib/whatsapp'
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
    .select('id, agent_id, customer_handle, channel, source')
    .in('agent_id', agents.map(a => a.id))
  const conversationIds = (conversations || []).map(c => c.id)
  const conversationMeta: Record<string, { handle: string; channel: string; source: string; agentId: string; agentName: string }> = {}
  for (const c of conversations || []) conversationMeta[c.id] = {
    handle: c.customer_handle || 'клиент',
    channel: c.channel || 'instagram',
    // 'dm' for anything older than the source column, matching what the
    // review queue assumed for its whole life before it existed.
    source: c.source || 'dm',
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
    source: conversationMeta[m.conversation_id]?.source || 'dm',
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
    .select('id, agent_id, channel, external_thread_id, source')
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
    // The website widget and the external API deliver by row: the client polls
    // ai_agent_messages, which now only returns approved ones. Flipping the
    // status below IS the send, so there is nothing to call and no token to
    // decrypt. Before this branch existed the request fell past every channel
    // case, sent nothing, and still marked the draft 'sent'.
    const deliversByRow = conversation.channel === 'website' || conversation.channel === 'api'

    let accessToken = ''
    let connection: { id: string; access_token_enc: string; external_account_id: string } | null = null
    if (!deliversByRow) {
      const { data } = await supabase
        .from('ai_agent_channel_connections')
        .select('id, access_token_enc, external_account_id')
        .eq('agent_id', agent.id)
        .eq('channel', conversation.channel)
        .single()
      if (!data) return NextResponse.json({ error: 'channel_not_connected' }, { status: 400 })
      connection = data
      accessToken = decryptAtRest(data.access_token_enc, getKey()).toString('utf8')
    }

    // In training mode every reply the agent writes comes through here, and
    // that is every agent until its owner has approved enough drafts. So a
    // product photo that is only attached on the direct-send paths is a photo
    // that never reaches anyone. Same choice, same catalogue, made again here
    // against the text the owner is actually approving — which they may have
    // edited, so re-deciding is right rather than reusing what was drafted.
    const photo = deliversByRow
      ? null
      : pickProductPhoto(finalText, await loadAgentCatalog(supabase, agent.user_id, agent.kaspi_shop_connection_id))

    try {
      // ai_agent_conversations.external_thread_id doubles as the reply
      // target for both comment and DM sends, same as the single-tenant
      // bot's reply_target column.
      if (conversation.channel === 'instagram') {
        // The comment case is real, not hypothetical: the founder hit it on
        // 2026-09-07 approving a reply to a comment, and it failed because
        // this branch always called sendDirectMessage — with a COMMENT id
        // where a user id belongs. ai_agent_conversations.source now records
        // which surface the thread came from, so the right send function can
        // be picked. A null source means a row from before that column
        // existed; those were backfilled, and 'dm' stays the safe default
        // because it is what this branch did for its whole life.
        if (conversation.source === 'comment') {
          await replyToComment(conversation.external_thread_id, finalText, { accessToken })
        } else {
          await sendDirectMessage(conversation.external_thread_id, finalText, { igUserId: connection!.external_account_id, accessToken })
          if (photo) {
            // Separate message, so a rejected image cannot take down the
            // answer that already reached the customer.
            await sendDirectImage(conversation.external_thread_id, photo, { igUserId: connection!.external_account_id, accessToken })
              .catch((err: any) => console.error('ai-agent review: product photo send failed:', err?.message || err))
          }
        }
      } else if (conversation.channel === 'telegram') {
        // For telegram rows access_token_enc holds the encrypted BotFather
        // token (same column, same encryption -- see telegram/connect) and
        // external_thread_id is the Telegram chat.id.
        if (photo && finalText.length <= TELEGRAM_CAPTION_MAX) {
          await sendTelegramBotPhoto(accessToken, conversation.external_thread_id, photo, finalText)
        } else {
          await sendTelegramBotMessage(accessToken, conversation.external_thread_id, finalText)
        }
      } else if (conversation.channel === 'whatsapp') {
        // connection.external_account_id is the Cloud API phone_number_id
        // (see whatsapp/callback route); external_thread_id is the
        // customer's WhatsApp phone number (wa_id).
        if (photo) {
          await sendWhatsAppImage(connection!.external_account_id, conversation.external_thread_id, photo, finalText, { accessToken })
        } else {
          await sendWhatsAppMessage(connection!.external_account_id, conversation.external_thread_id, finalText, { accessToken })
        }
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
        if (connection) await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connection.id)
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
