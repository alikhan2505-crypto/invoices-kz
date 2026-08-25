import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCollectFieldsToExtract, buildCatalogBlock, AgentTone, AgentGoal } from './promptContext'
import { loadAgentCatalog } from './catalogContext'
import { buildInvoiceToolExecutor } from './invoiceSend'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { findTemplateMatch, mergeCollectedData } from './webhookHandler'
import { pairConversationHistory } from './telegram'
import { sendWhatsAppMessage, WhatsAppApiError } from '@/lib/whatsapp'
import { UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'

// The WhatsApp twin of telegramWebhookHandler.ts's Telegram tenant pipeline
// (itself the twin of webhookHandler.ts's Instagram pipeline) -- same
// deliberate PARALLEL-handler choice: WhatsApp is DM-only (no comment
// concept), so the pipeline here mirrors the Telegram one almost exactly
// (private-chat shape, source: 'dm', pairConversationHistory for history).
// If the Telegram pipeline's flow changes, mirror the change here too.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface WhatsAppTenantConnection {
  connectionId: string
  agentId: string
  // The Cloud API phone_number_id (external_account_id on the connection
  // row) -- NOT the human-readable phone number itself.
  phoneNumberId: string
  wabaId: string
  accessToken: string
}

// Same 401 -> token_expired convention as the Instagram/Telegram tenant
// paths: a dead token surfaces as a reconnect banner on the settings page
// instead of retrying a send that will never succeed.
async function markWhatsAppTokenExpiredIfUnauthorized(connectionId: string, err: unknown): Promise<void> {
  if (err instanceof WhatsAppApiError && err.status === 401) {
    await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connectionId)
  }
}

// Looked up once per webhook delivery by the Cloud API phone_number_id
// carried in value.metadata.phone_number_id -- every connected customer's
// WhatsApp number shares the same app-level webhook callback URL, so this
// is how an inbound message is routed to the right tenant.
export async function loadWhatsAppConnection(phoneNumberId: string): Promise<WhatsAppTenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id, waba_id, access_token_enc')
    .eq('channel', 'whatsapp')
    .eq('external_account_id', phoneNumberId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    connectionId: data.id,
    agentId: data.agent_id,
    phoneNumberId: data.external_account_id,
    wabaId: data.waba_id || '',
    accessToken: decryptAtRest(data.access_token_enc, getKey()).toString('utf8'),
  }
}

interface WhatsAppIncomingParams {
  // The WhatsApp message's own `id` (e.g. "wamid.XXXX") -- globally unique
  // across all WhatsApp numbers (unlike Telegram's per-bot update_id), so
  // it's used directly as ai_agent_messages.external_id with no extra
  // scoping prefix.
  externalId: string
  // Sender's WhatsApp phone number, e.g. "77771234567" -- doubles as the
  // conversation's external_thread_id and the send target.
  from: string
  customerHandle: string
  incomingText: string
  // Present only for an image message -- template matching is skipped and
  // this goes straight to generateAiReply's `image` param instead. Never
  // set for a transcribed voice message (that flows as plain incomingText).
  media?: { kind: 'image'; base64: string; mediaType: string }
}

export async function handleWhatsAppIncoming(conn: WhatsAppTenantConnection, params: WhatsAppIncomingParams): Promise<void> {
  // Dedup first -- Meta can redeliver the same webhook event.
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return

  // Owner paused this agent (is_enabled toggle) -- drop the message
  // entirely: no conversation row, no logged message, no reply, no debit.
  if (agent.is_enabled === false) return

  // Find or create the conversation thread for this sender. One WhatsApp
  // phone number == one thread, keyed by the sender's wa_id.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'whatsapp',
      external_thread_id: params.from,
      customer_handle: params.customerHandle,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return

  // Log the inbound message. If two concurrent deliveries of the same
  // message both pass the SELECT-based dedup above, the unique index on
  // external_id catches the race here.
  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.incomingText,
    external_id: params.externalId,
  })
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('ai-agent whatsapp webhook: failed to log inbound message for', params.externalId, ':', insertError.message)
    }
    return
  }

  // Template match first -- skipped entirely for a photo message, since
  // word-based matching has nothing meaningful to match against a caption
  // placeholder. WhatsApp has no "comment" concept -- every message is
  // DM-shaped, so dm-scoped (and unscoped) templates apply.
  let match: { id: string; reply_text: string } | null = null
  if (!params.media) {
    const { data: templates } = await supabase
      .from('ai_agent_reply_templates')
      .select('id, trigger_words, reply_text')
      .eq('agent_id', conn.agentId)
      .or('channel.is.null,channel.eq.dm')
      .order('created_at', { ascending: true })
    match = findTemplateMatch(params.incomingText, templates || [])
  }

  if (match) {
    try {
      await sendWhatsAppMessage(conn.phoneNumberId, params.from, match.reply_text, { accessToken: conn.accessToken })
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent whatsapp webhook: template reply send failed for', params.externalId, ':', err.message)
      await markWhatsAppTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // Prior exchanges with this number, so the model doesn't re-greet someone
  // mid-conversation -- same depth/pairing rule as the Telegram path.
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

  // No template -- generate an AI reply. source: 'dm' because a WhatsApp
  // chat has exactly the DM semantics generateAiReply's prompt
  // distinguishes (private, fuller answers allowed, history applies).
  let draftReply: string
  let urgent: boolean
  let extractedFields: Record<string, string> | undefined
  try {
    // Phase 3: real catalog prices in context + the invoice tool.
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.customerHandle,
      source: 'dm',
      conversationHistory,
      image: params.media?.kind === 'image' ? { base64: params.media.base64, mediaType: params.media.mediaType } : undefined,
      businessContextLine: buildBusinessContextLine({
        name: agent.name,
        tone: agent.tone as AgentTone,
        description: agent.business_description,
        goal: agent.goal as AgentGoal,
        collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined,
        timezone: agent.timezone || undefined,
        currency: agent.currency || undefined,
        customInstructions: typeof agent.custom_instructions === 'string' ? agent.custom_instructions : undefined,
        channel: 'whatsapp',
      }) + catalogBlock,
      collectFieldsToExtract: buildCollectFieldsToExtract(Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined),
      invoiceTool: buildInvoiceToolExecutor(supabase, { id: agent.id, status: agent.status }, conversation.id),
    })
    draftReply = result.replyText
    urgent = result.urgent
    extractedFields = result.extractedFields
  } catch (err: any) {
    console.error('ai-agent whatsapp webhook: AI reply generation failed for', params.externalId, ':', err.message)
    if (params.media) {
      // The inbound row is already claimed (dedup'd), so a platform
      // redelivery will never retry this -- without a fallback here, a
      // failed AI call on a photo would silently swallow the customer's
      // message forever, which is exactly the failure this feature exists
      // to eliminate. Plain text/voice messages keep the pre-existing
      // silent-return behavior; that's out of scope for this fix.
      await sendWhatsAppMessage(conn.phoneNumberId, params.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken }).catch(() => {})
    }
    return
  }

  // Persist whatever the model could confidently read off this turn (and
  // prior turns) into collected_data -- unconditional on training vs active
  // mode below, same rule as the Instagram tenant path (webhookHandler.ts).
  // Best-effort: a merge failure must never block the reply handling below.
  if (extractedFields && Object.keys(extractedFields).length > 0) {
    await mergeCollectedData(conversation.id, extractedFields)
  }

  // Training mode mirrors the Telegram/Instagram paths exactly: the draft
  // is queued for review, NOT sent, and NOT debited -- the debit happens in
  // the review route's approve/send handler, once, when the owner sends it.
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
    // opt-in, entirely separate from the customer-facing WhatsApp number) --
    // wrapped so a failure can never block or abort the rest of this
    // delivery.
    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      try {
        await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте: https://www.invoices.kz/ai-agent/review')
      } catch (telegramErr: any) {
        console.error('ai-agent whatsapp webhook: training-mode nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
  }

  // Agent is active -- send immediately, then log, then debit. Same
  // ordering as the Instagram/Telegram paths: the debit only happens after
  // a successful send, and a failed debit is logged but never un-sends the
  // reply.
  try {
    await sendWhatsAppMessage(conn.phoneNumberId, params.from, draftReply, { accessToken: conn.accessToken })
    await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'sent',
      urgent,
    })
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: WhatsApp')
    } catch (walletErr: any) {
      console.error('ai-agent whatsapp webhook: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  } catch (err: any) {
    console.error('ai-agent whatsapp webhook: AI reply send failed for', params.externalId, ':', err.message)
    await markWhatsAppTokenExpiredIfUnauthorized(conn.connectionId, err)
  }
}
