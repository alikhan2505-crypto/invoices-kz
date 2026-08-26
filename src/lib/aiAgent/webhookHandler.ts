import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { replyToComment, sendDirectMessage, InstagramApiError } from '@/lib/instagram'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCollectFieldsToExtract, buildCatalogBlock, AgentTone, AgentGoal } from './promptContext'
import { loadAgentCatalog } from './catalogContext'
import { buildInvoiceToolExecutor } from './invoiceSend'
import { shouldExitTraining } from './trainingStatus'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TenantConnection {
  connectionId: string
  agentId: string
  externalAccountId: string
  accessToken: string
}

// A 401 from Meta on an actual send means the stored token is dead
// (revoked, expired) -- per the design spec's "Обработка ошибок" section,
// this mirrors Kaspi Shop's own sessionExpired/markSessionExpired pattern:
// mark it in the DB so the settings page (Task 6) can show a reconnect
// banner, instead of silently retrying a token that will never work again.
// Any other error (network blip, malformed request, Meta outage) is left
// alone -- only a confirmed 401 means the token itself is the problem.
async function markTokenExpiredIfUnauthorized(connectionId: string, err: unknown): Promise<void> {
  if (err instanceof InstagramApiError && err.status === 401) {
    await supabase.from('ai_agent_channel_connections').update({ status: 'token_expired' }).eq('id', connectionId)
  }
}

// Looked up once per webhook entry (Task 8's POST handler calls this before
// its changes/messaging loop) -- null means this Instagram account isn't
// connected to any agent, which shouldn't happen for a real event but is
// handled as a defensive no-op rather than a crash.
export async function loadTenantConnection(externalAccountId: string): Promise<TenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id, access_token_enc')
    .eq('channel', 'instagram')
    .eq('external_account_id', externalAccountId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    connectionId: data.id,
    agentId: data.agent_id,
    externalAccountId: data.external_account_id,
    accessToken: decryptAtRest(data.access_token_enc, getKey()).toString('utf8'),
  }
}

interface TenantIncomingParams {
  source: 'comment' | 'dm'
  externalId: string
  fromUsername: string
  incomingText: string
  replyTarget: string
  // Present only for an image DM -- template matching is skipped and this
  // is passed straight to generateAiReply's `image` param instead. Never
  // set for source: 'comment' (a comment can't carry an attachment from the
  // commenter).
  media?: { kind: 'image'; base64: string; mediaType: string }
}

export async function handleTenantIncoming(conn: TenantConnection, params: TenantIncomingParams): Promise<void> {
  // Dedup first, same principle as the single-tenant path's external_id
  // unique constraint -- Meta can redeliver the same event.
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return

  // Owner paused this agent (is_enabled toggle, Контроль tab) -- drop the
  // event entirely: no conversation row, no logged message, no reply, no
  // debit. Same rule and placement as the Telegram tenant path
  // (telegramWebhookHandler.ts).
  if (agent.is_enabled === false) return

  // Find or create the conversation thread for this sender.
  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'instagram',
      external_thread_id: params.replyTarget,
      customer_handle: params.fromUsername,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id, paused_for_human')
    .single()
  if (!conversation) return

  // Log the inbound message. If two concurrent deliveries of the same event
  // both pass the SELECT-based dedup check above, the unique index on
  // external_id (ai_agent_messages_external_id_idx) catches the race here --
  // a 23505 means another call already claimed this externalId, so stop
  // processing this duplicate exactly like the dedup SELECT catching it
  // would have.
  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.incomingText,
    external_id: params.externalId,
  })
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('ai-agent webhook: failed to log inbound message for', params.externalId, ':', insertError.message)
    }
    return
  }

  // Operator-takeover gate. Applies to BOTH comment and dm sources --
  // unlike the invoice tool, a stop-phrase request is legitimate under a
  // public comment too.
  if (conversation.paused_for_human) return

  if (findStopPhraseMatch(params.incomingText, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    // Conditional claim -- see telegramWebhookHandler.ts's identical block for rationale.
    const { data: claimed } = await supabase.from('ai_agent_conversations')
      .update({ paused_for_human: true }).eq('id', conversation.id).eq('paused_for_human', false).select('id')
    if (!claimed || claimed.length === 0) return
    const ackText = 'Передаю ваш вопрос менеджеру, он ответит здесь в ближайшее время.'
    try {
      if (params.source === 'comment') {
        await replyToComment(params.replyTarget, ackText, { accessToken: conn.accessToken })
      } else {
        await sendDirectMessage(params.replyTarget, ackText, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
      }
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: ackText,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent webhook: stop-phrase ack send failed for', params.externalId, ':', err.message)
      await markTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.incomingText.slice(0, 120), '/ai-agent/dialogs')
    return
  }

  // Template match first -- skipped entirely for a photo message, same
  // reasoning as the WhatsApp/Telegram tenant paths. Same channel-scoping
  // rule as instagram_reply_templates otherwise.
  let match: { id: string; reply_text: string } | null = null
  if (!params.media) {
    const { data: templates } = await supabase
      .from('ai_agent_reply_templates')
      .select('id, trigger_words, reply_text')
      .eq('agent_id', conn.agentId)
      .or(`channel.is.null,channel.eq.${params.source}`)
      .order('created_at', { ascending: true })
    match = findTemplateMatch(params.incomingText, templates || [])
  }

  if (match) {
    try {
      if (params.source === 'comment') {
        await replyToComment(params.replyTarget, match.reply_text, { accessToken: conn.accessToken })
      } else {
        await sendDirectMessage(params.replyTarget, match.reply_text, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
      }
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: match.reply_text,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent webhook: template reply send failed for', params.externalId, ':', err.message)
      await markTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    return
  }

  // For DMs, pull prior exchanges with this same conversation so the model
  // doesn't re-greet someone mid-conversation -- mirrors the legacy bot's
  // own history fetch (instagram/webhook/route.ts's handleIncoming), just
  // reshaped for this schema: ai_agent_messages stores one row per
  // inbound/outbound message rather than one row per exchange, so rows are
  // paired up here (inbound followed by the next *sent* outbound reply --
  // a still-pending or skipped draft was never actually seen by the
  // customer, so it doesn't count as "already said"). The current turn's
  // own just-inserted inbound row naturally never forms a pair (nothing
  // outbound follows it yet), so it doesn't need to be excluded separately.
  let conversationHistory: { incoming: string; reply: string }[] | undefined
  if (params.source === 'dm') {
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
    // Depth is owner-configurable per agent (Контроль / "Глубина памяти
    // диалога", ai_agents.history_pairs, default 5) -- more pairs = better
    // context but a costlier prompt on every reply.
    const historyPairs = typeof agent.history_pairs === 'number' && agent.history_pairs >= 1 ? agent.history_pairs : 5
    if (pairs.length > 0) conversationHistory = pairs.slice(-historyPairs)
  }

  // No template -- generate an AI reply.
  let draftReply: string
  let urgent: boolean
  let extractedFields: Record<string, string> | undefined
  try {
    // Phase 3: real catalog prices in context + the invoice tool. The
    // tool is DM-only -- a public comment thread is no place to collect
    // a phone number or drop a personal invoice link.
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      source: params.source,
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
      }) + catalogBlock,
      collectFieldsToExtract: buildCollectFieldsToExtract(Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined),
      ...(params.source === 'dm'
        ? { invoiceTool: buildInvoiceToolExecutor(supabase, { id: agent.id, status: agent.status }, conversation.id) }
        : {}),
    })
    draftReply = result.replyText
    urgent = result.urgent
    extractedFields = result.extractedFields
  } catch (err: any) {
    console.error('ai-agent webhook: AI reply generation failed for', params.externalId, ':', err.message)
    if (params.media) {
      // The inbound row is already claimed (dedup'd), so a platform
      // redelivery will never retry this -- without a fallback here, a
      // failed AI call on a photo would silently swallow the customer's
      // message forever, which is exactly the failure this feature exists
      // to eliminate. Plain text/voice messages keep the pre-existing
      // silent-return behavior; that's out of scope for this fix. A photo
      // is always source: 'dm' (see TenantIncomingParams.media), never
      // 'comment', so sendDirectMessage is always the right send here.
      await sendDirectMessage(params.replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: conn.externalAccountId, accessToken: conn.accessToken }).catch(() => {})
    }
    return
  }

  // Persist whatever the model could confidently read off this turn (and
  // prior turns, via conversationHistory) into collected_data --
  // deliberately unconditional on training vs active mode below: a paused
  // review-queue draft still means the customer said something worth
  // capturing (Task spec: "extraction isn't gated on send status, only on
  // having generated a reply at all"). Best-effort (see mergeCollectedData) --
  // a failure here must never block the reply handling that follows.
  if (extractedFields && Object.keys(extractedFields).length > 0) {
    await mergeCollectedData(conversation.id, extractedFields)
  }

  if (agent.status === 'training') {
    const { data: inserted } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'pending_review',
      urgent,
    }).select('id').single()

    // In-app inbox entry -- unconditional (unlike the Telegram nudge below,
    // this doesn't depend on the user having opted into anything, it's the
    // baseline in-product notification). Best-effort, same reasoning as
    // every other notification call here.
    if (inserted) {
      await createNotification(agent.user_id, 'Новый черновик ответа на проверке', draftReply.slice(0, 120), '/ai-agent/review')
    }

    // Best-effort Telegram nudge -- wrapped in try/catch so a failure can
    // never block or abort the rest of this webhook delivery.
    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      try {
        await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте: https://www.invoices.kz/ai-agent/review')
      } catch (telegramErr: any) {
        console.error('ai-agent webhook: training-mode Telegram nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
  }

  // Agent is active -- send immediately.
  try {
    if (params.source === 'comment') {
      await replyToComment(params.replyTarget, draftReply, { accessToken: conn.accessToken })
    } else {
      await sendDirectMessage(params.replyTarget, draftReply, { igUserId: conn.externalAccountId, accessToken: conn.accessToken })
    }
    await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: true,
      status: 'sent',
      urgent,
    })
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, `ИИ-ответ: ${params.source === 'comment' ? 'комментарий' : 'DM'}`)
    } catch (walletErr: any) {
      console.error('ai-agent webhook: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  } catch (err: any) {
    console.error('ai-agent webhook: AI reply send failed for', params.externalId, ':', err.message)
    await markTokenExpiredIfUnauthorized(conn.connectionId, err)
  }
}

// Read-modify-write merge of newly extracted customer fields into
// ai_agent_conversations.collected_data (jsonb). Deliberately
// non-overwriting: an ALREADY-captured field wins over a new extraction for
// the same key, so a confidently-captured phone number on turn 3 can't be
// erased by an ambiguous turn 7 (spec: "once a field is captured, don't let
// a later ambiguous turn erase it"). Also mirrors a `name`/`phone` key into
// the legacy collected_name/collected_phone columns on the SAME update, for
// backward compatibility with any future reader of those columns --
// collected_data remains the real source of truth going forward.
// Channel-agnostic (same table/columns regardless of Instagram/Telegram/
// WhatsApp), so this lives here once and is imported by the Telegram/
// WhatsApp tenant pipelines -- same sharing pattern as findTemplateMatch
// just below, which those two files already import from this one. Only the
// three handleXIncoming pipeline skeletons themselves stay deliberately
// parallel/duplicated, not small channel-agnostic pieces like this.
// Best-effort: logs and swallows its own DB errors so a merge failure can
// never block the reply already generated by the caller.
export async function mergeCollectedData(conversationId: string, extractedFields: Record<string, string>): Promise<void> {
  if (!extractedFields || Object.keys(extractedFields).length === 0) return

  const { data: existing, error: fetchError } = await supabase
    .from('ai_agent_conversations')
    .select('collected_data')
    .eq('id', conversationId)
    .maybeSingle()
  if (fetchError) {
    console.error('ai-agent: failed to load collected_data for conversation', conversationId, ':', fetchError.message)
    return
  }

  const current = (existing?.collected_data && typeof existing.collected_data === 'object' && !Array.isArray(existing.collected_data))
    ? existing.collected_data as Record<string, string>
    : {}
  // current spread LAST -- an already-stored value for a key wins over a
  // freshly extracted one, never the other way round.
  const merged: Record<string, string> = { ...extractedFields, ...current }

  const update: Record<string, unknown> = { collected_data: merged }
  if (typeof merged.name === 'string' && merged.name) update.collected_name = merged.name
  if (typeof merged.phone === 'string' && merged.phone) update.collected_phone = merged.phone

  const { error: updateError } = await supabase.from('ai_agent_conversations').update(update).eq('id', conversationId)
  if (updateError) {
    console.error('ai-agent: failed to merge collected_data for conversation', conversationId, ':', updateError.message)
  }
}

// Same contiguous-substring matching as this codebase's existing
// findMatchingTemplate (src/lib/instagramReplyMatch.ts) -- deliberately not
// reused directly since that function is typed against
// instagram_reply_templates's row shape; this is the same algorithm
// against ai_agent_reply_templates's identical trigger_words/reply_text
// shape. If instagramReplyMatch.ts's matching logic ever changes, mirror
// the change here too. Exported (2026-08-20) so the Telegram tenant path
// (telegramWebhookHandler.ts) matches templates with the exact same rule.
export function findTemplateMatch(text: string, templates: { id: string; trigger_words: string[]; reply_text: string }[]): { id: string; reply_text: string } | null {
  const lower = text.toLowerCase()
  for (const t of templates) {
    if (t.trigger_words.some(w => lower.includes(w.toLowerCase()))) {
      return { id: t.id, reply_text: t.reply_text }
    }
  }
  return null
}

// Same case-insensitive substring rule as findTemplateMatch/
// findFlowTriggerMatch, applied to the agent's configurable stop-phrase
// list (ai_agents.stop_phrases) instead of templates/flows. Checked
// BEFORE template/flow matching in every tenant handler -- a customer
// asking for a human must never accidentally match a template or flow
// trigger word first.
export function findStopPhraseMatch(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase()
  return phrases.some(p => lower.includes(p.toLowerCase()))
}
