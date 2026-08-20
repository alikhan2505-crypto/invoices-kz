import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, AgentTone, AgentGoal } from './promptContext'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { findTemplateMatch } from './webhookHandler'
import { sendTelegramBotMessage, pairConversationHistory, TelegramApiError } from './telegram'

// The Telegram twin of webhookHandler.ts's Instagram tenant pipeline.
// Deliberately a PARALLEL handler rather than a channel parameter threaded
// through handleTenantIncoming: that function's send calls, channel
// literals, and source semantics are Instagram-shaped, and it is LIVE with
// a real connected account -- so the shared pieces are reused as functions
// (generateAiReply, buildBusinessContextLine, findTemplateMatch,
// pairConversationHistory, debitAiAgentWallet, the same
// ai_agent_conversations/ai_agent_messages tables) while the pipeline
// skeleton is mirrored here. If handleTenantIncoming's flow changes,
// mirror the change here too.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TelegramTenantConnection {
  connectionId: string
  agentId: string
  // The bot's own Telegram id (external_account_id on the connection row).
  botId: string
  botToken: string
  webhookSecret: string
}

// Same 401 -> token_expired convention as markTokenExpiredIfUnauthorized in
// webhookHandler.ts: Telegram answers 401 Unauthorized once a token is
// revoked via BotFather, which is this channel's equivalent of a dead Meta
// token -- surface it as a reconnect prompt on the settings page instead of
// retrying a token that will never work again.
async function markTelegramTokenExpiredIfUnauthorized(connectionId: string, err: unknown): Promise<void> {
  if (err instanceof TelegramApiError && err.status === 401) {
    await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connectionId)
  }
}

// Looked up once per webhook delivery by the ?secret= query param. The
// caller (webhook route) must ALSO timingSafeEqual the
// X-Telegram-Bot-Api-Secret-Token header against webhookSecret -- this
// lookup alone only proves the caller knows the URL.
export async function loadTelegramConnectionBySecret(secret: string): Promise<TelegramTenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id, access_token_enc, webhook_secret')
    .eq('channel', 'telegram')
    .eq('webhook_secret', secret)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    connectionId: data.id,
    agentId: data.agent_id,
    botId: data.external_account_id,
    botToken: decryptAtRest(data.access_token_enc, getKey()).toString('utf8'),
    webhookSecret: data.webhook_secret,
  }
}

interface TelegramIncomingParams {
  // telegramDedupKey(botId, update_id) -- Telegram's update_id is the
  // natural redelivery-dedup key, scoped by bot id (see telegram.ts).
  externalId: string
  chatId: string
  fromHandle: string
  incomingText: string
}

export async function handleTelegramIncoming(conn: TelegramTenantConnection, params: TelegramIncomingParams): Promise<void> {
  // Dedup first -- Telegram redelivers an update until it gets a 2xx, and
  // can redeliver even after one (timeouts). Same SELECT-then-insert-race
  // structure as the Instagram tenant path.
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return

  // Owner paused this agent (is_enabled toggle) -- drop the update
  // entirely: no conversation row, no logged message, no reply, no debit.
  if (agent.is_enabled === false) return

  // Find or create the conversation thread for this chat. One Telegram
  // private chat == one thread, keyed by chat.id.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'telegram',
      external_thread_id: params.chatId,
      customer_handle: params.fromHandle,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return

  // Log the inbound message. If two concurrent deliveries of the same
  // update both pass the SELECT-based dedup above, the unique index on
  // external_id catches the race here -- a 23505 means another call already
  // claimed this update, so stop processing this duplicate.
  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.incomingText,
    external_id: params.externalId,
  })
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('ai-agent telegram webhook: failed to log inbound message for', params.externalId, ':', insertError.message)
    }
    return
  }

  // Template match first. Telegram messages are private-chat messages, the
  // same conversational shape as Instagram DMs -- so dm-scoped (and
  // unscoped) templates apply, comment-scoped ones don't.
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or('channel.is.null,channel.eq.dm')
    .order('created_at', { ascending: true })

  const match = findTemplateMatch(params.incomingText, templates || [])

  if (match) {
    try {
      await sendTelegramBotMessage(conn.botToken, params.chatId, match.reply_text)
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent telegram webhook: template reply send failed for', params.externalId, ':', err.message)
      await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // Prior exchanges with this chat, so the model doesn't re-greet someone
  // mid-conversation. Depth comes from the agent's history_pairs column
  // (default 5); rows are fetched newest-first with slack for unpaired
  // drafts/skips, then re-ascended for the pairing walk.
  const historyPairs = typeof agent.history_pairs === 'number' && agent.history_pairs >= 0 ? agent.history_pairs : 5
  let conversationHistory: { incoming: string; reply: string }[] | undefined
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

  // No template -- generate an AI reply. source: 'dm' because a Telegram
  // private chat has exactly the DM semantics generateAiReply's prompt
  // distinguishes (private, fuller answers allowed, history applies).
  let draftReply: string
  let urgent: boolean
  try {
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromHandle,
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
        channel: 'telegram',
      }),
    })
    draftReply = result.replyText
    urgent = result.urgent
  } catch (err: any) {
    console.error('ai-agent telegram webhook: AI reply generation failed for', params.externalId, ':', err.message)
    return
  }

  // Training mode mirrors the Instagram path exactly: the draft is queued
  // for review, NOT sent, and NOT debited -- the debit happens in the
  // review route's approve/send handler, once, when the owner sends it.
  if (agent.status === 'training') {
    const { data: inserted } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'pending_review',
      urgent,
    }).select('id').single()

    if (inserted) {
      await createNotification(agent.user_id, 'Новый черновик ответа на проверке', draftReply.slice(0, 120), '/ai-agent/review')
    }

    // Best-effort Telegram nudge to the OWNER's personal chat (profiles
    // opt-in, entirely separate from the customer-facing bot) -- wrapped so
    // a failure can never block or abort the rest of this delivery.
    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      try {
        await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте: https://www.invoices.kz/ai-agent/review')
      } catch (telegramErr: any) {
        console.error('ai-agent telegram webhook: training-mode nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
  }

  // Agent is active -- send immediately, then log, then debit. Same
  // ordering as the Instagram path: the debit only happens after a
  // successful send (a failed send costs the customer nothing), and a
  // failed debit is logged but never un-sends the reply.
  try {
    await sendTelegramBotMessage(conn.botToken, params.chatId, draftReply)
    await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'sent',
      urgent,
    })
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: Telegram')
    } catch (walletErr: any) {
      console.error('ai-agent telegram webhook: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  } catch (err: any) {
    console.error('ai-agent telegram webhook: AI reply send failed for', params.externalId, ':', err.message)
    await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
  }
}
