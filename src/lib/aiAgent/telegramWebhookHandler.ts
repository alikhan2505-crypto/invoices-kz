import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCollectFieldsToExtract, buildCatalogBlock, AgentTone, AgentGoal } from './promptContext'
import { loadAgentCatalog } from './catalogContext'
import { buildInvoiceToolExecutor, createDraft } from './invoiceSend'
import { validateDraftInput, canAutoSend } from './invoiceDrafts'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { findTemplateMatch, mergeCollectedData, findStopPhraseMatch, STOP_PHRASE_ACK_TEXT } from './webhookHandler'
import { sendTelegramBotMessage, sendTelegramFlowStep, answerTelegramCallbackQuery, pairConversationHistory, TelegramApiError } from './telegram'
import { UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'
import { parseFlowDefinition, isTerminalStep, findStepById, firstStep, findFlowTriggerMatch, type FlowStep } from './flow'

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
  // Present only for an image message -- template matching is skipped and
  // this goes straight to generateAiReply's `image` param instead.
  media?: { kind: 'image'; base64: string; mediaType: string }
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
    .select('id, active_flow_id, paused_for_human')
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

  // The customer was mid-flow but sent free text instead of tapping a
  // button -- exit the flow silently rather than nudge them back to it:
  // someone who prefers typing should get a real answer (template/AI
  // below), not be stuck in a menu. Runs only after the inbound insert
  // above succeeds, so a failed insert (for a non-dedup reason) never
  // clears the customer's flow state without the message being logged.
  if (conversation.active_flow_id) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }

  // Operator-takeover gate: already-paused conversations get NOTHING
  // beyond the inbound log above -- no template, no flow, no AI, no
  // repeated acknowledgement. The owner is already handling it in
  // /ai-agent/dialogs.
  if (conversation.paused_for_human) return

  // Not yet paused -- check for a stop-phrase BEFORE template/flow
  // matching, so a customer asking for a human can't accidentally match
  // a template/flow trigger word first.
  if (findStopPhraseMatch(params.incomingText, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    // Conditional claim (final-review finding): two near-simultaneous
    // messages both matching a stop-phrase must not both send the
    // acknowledgement + fire the owner notification. Only the request
    // that actually flips false->true proceeds; the loser just returns
    // (the winner's ack already covers the customer).
    const { data: claimed } = await supabase.from('ai_agent_conversations')
      .update({ paused_for_human: true }).eq('id', conversation.id).eq('paused_for_human', false).select('id')
    if (!claimed || claimed.length === 0) return
    const ackText = STOP_PHRASE_ACK_TEXT
    try {
      await sendTelegramBotMessage(conn.botToken, params.chatId, ackText)
      await supabase.from('ai_agent_messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        text: ackText,
        is_ai_generated: false,
        status: 'sent',
      })
    } catch (err: any) {
      console.error('ai-agent telegram webhook: stop-phrase ack send failed for', params.externalId, ':', err.message)
      await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.incomingText.slice(0, 120), '/ai-agent/dialogs')
    return
  }

  // Template match first -- skipped entirely for a photo message, same
  // reasoning as the WhatsApp tenant path. Telegram messages are private-
  // chat messages, the same conversational shape as Instagram DMs -- so
  // dm-scoped (and unscoped) templates apply, comment-scoped ones don't.
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

  // No template -- check whether a flow's trigger words match before
  // falling to paid AI. Flows are free, like templates -- this tier sits
  // between template matching and the AI fallback below.
  if (!params.media) {
    const { data: flows } = await supabase
      .from('ai_agent_flows')
      .select('id, trigger_words, definition')
      .eq('agent_id', conn.agentId)
      .order('created_at', { ascending: true })
    const matchedFlowId = findFlowTriggerMatch(params.incomingText, flows || [])
    const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
    if (matchedFlow) {
      await startTelegramFlow(conn, conversation.id, params.chatId, matchedFlow)
      return
    }
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
  let extractedFields: Record<string, string> | undefined
  try {
    // Phase 3: real catalog prices in context + the invoice tool.
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromHandle,
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
        channel: 'telegram',
      }) + catalogBlock,
      collectFieldsToExtract: buildCollectFieldsToExtract(Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined),
      invoiceTool: buildInvoiceToolExecutor(supabase, { id: agent.id, status: agent.status }, conversation.id),
    })
    draftReply = result.replyText
    urgent = result.urgent
    extractedFields = result.extractedFields
  } catch (err: any) {
    console.error('ai-agent telegram webhook: AI reply generation failed for', params.externalId, ':', err.message)
    if (params.media) {
      // The inbound row is already claimed (dedup'd), so a platform
      // redelivery will never retry this -- without a fallback here, a
      // failed AI call on a photo would silently swallow the customer's
      // message forever, which is exactly the failure this feature exists
      // to eliminate. Plain text/voice messages keep the pre-existing
      // silent-return behavior; that's out of scope for this fix.
      await sendTelegramBotMessage(conn.botToken, params.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT).catch(() => {})
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

// Starts a flow for an ALREADY-loaded conversation -- used by
// handleTelegramIncoming's flow-trigger tier above. handleTelegramStart
// (below) is the /start-specific twin that creates/loads the conversation
// itself.
// Phase 3: an 'invoice' flow step, after its own text is delivered,
// creates an invoice draft from the step's fixed item + the
// conversation's collected name/phone -- same core (and same autonomy
// rule) as the AI tool. Missing name/phone -> a fixed ask; the step is
// terminal-shaped (buttons: []), so the existing isTerminalStep handling
// clears the flow state and the customer's reply flows through the
// normal pipeline, where the AI tool can finish the job.
async function maybeExecuteInvoiceStep(
  conn: TelegramTenantConnection,
  conversationId: string,
  chatId: string,
  step: FlowStep,
): Promise<void> {
  if (step.kind !== 'invoice' || !step.invoiceItem) return
  try {
    const { data: conv } = await supabase.from('ai_agent_conversations')
      .select('collected_name, collected_phone')
      .eq('id', conversationId).single()
    const customerName = conv?.collected_name?.trim() || ''
    const customerPhone = conv?.collected_phone?.trim() || ''
    if (!customerName || !customerPhone) {
      await sendTelegramBotMessage(conn.botToken, chatId, 'Чтобы выставить счёт, напишите, пожалуйста, ваше имя и номер телефона одним сообщением.')
      return
    }
    const validated = validateDraftInput([{ name: step.invoiceItem.name, qty: 1, unitPrice: step.invoiceItem.unitPrice }])
    if (!validated.ok) {
      console.error('ai-agent telegram webhook: invoice step has invalid item:', validated.error)
      return
    }
    const { data: agentRow } = await supabase.from('ai_agents').select('status').eq('id', conn.agentId).single()
    const { count } = await supabase.from('ai_agent_invoice_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', conn.agentId)
      .eq('status', 'approved_sent')
    const auto = canAutoSend(agentRow?.status || 'training', count || 0)
    const created = await createDraft(supabase, {
      agentId: conn.agentId,
      conversationId,
      customerName,
      customerPhone,
      items: validated.items,
      total: validated.total,
      source: 'flow_step',
      autoSend: auto,
    })
    if (!created.sent) {
      await sendTelegramBotMessage(conn.botToken, chatId, 'Счёт готовится — как только владелец подтвердит, ссылка на оплату придёт сюда.')
    }
  } catch (err: any) {
    console.error('ai-agent telegram webhook: invoice step failed:', err?.message || err)
  }
}

async function startTelegramFlow(
  conn: TelegramTenantConnection,
  conversationId: string,
  chatId: string,
  flow: { id: string; definition: unknown }
): Promise<void> {
  const definition = parseFlowDefinition(flow.definition)
  const entryStep = definition ? firstStep(definition) : undefined
  if (!definition || !entryStep) return // corrupted saved flow -- shouldn't happen, defensive no-op

  await supabase.from('ai_agent_conversations').update({ active_flow_id: flow.id, active_step_id: entryStep.id }).eq('id', conversationId)

  let stepDelivered = true
  try {
    await sendTelegramFlowStep(conn.botToken, chatId, entryStep)
  } catch (err: any) {
    stepDelivered = false
    console.error('ai-agent telegram webhook: flow trigger send failed:', err.message)
    await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
  }

  // Never issue an invoice whose introductory step text failed to reach
  // the customer -- a bare payment link with no context (finding M5).
  if (stepDelivered) await maybeExecuteInvoiceStep(conn, conversationId, chatId, entryStep)

  // A one-step flow with no buttons is immediately terminal -- don't leave
  // the conversation waiting for a click that will never come.
  if (isTerminalStep(entryStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversationId)
  }
}

// Called by the webhook route for a /start update, BEFORE any of the usual
// dedup/conversation/billing machinery in handleTelegramIncoming -- mirrors
// the route's existing treatment of /start as a handshake, not a billable
// turn. If the agent has a flow marked is_start, that flow's first step
// replaces the old static greeting; otherwise the greeting is unchanged.
export async function handleTelegramStart(conn: TelegramTenantConnection, params: { chatId: string; fromHandle: string }): Promise<void> {
  const { data: agent } = await supabase.from('ai_agents').select('is_enabled').eq('id', conn.agentId).single()
  if (!agent || agent.is_enabled === false) return // owner paused the agent -- stay silent, matching handleTelegramIncoming's own pause behavior

  const { data: startFlow } = await supabase
    .from('ai_agent_flows')
    .select('id, definition')
    .eq('agent_id', conn.agentId)
    .eq('is_start', true)
    .maybeSingle()

  if (!startFlow) {
    await sendTelegramBotMessage(conn.botToken, params.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    return
  }

  const definition = parseFlowDefinition(startFlow.definition)
  const entryStep = definition ? firstStep(definition) : undefined
  if (!definition || !entryStep) {
    // A saved-but-corrupted flow (shouldn't happen -- the save route
    // validates before writing) -- fall back to the static greeting rather
    // than send nothing.
    await sendTelegramBotMessage(conn.botToken, params.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    return
  }

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'telegram',
      external_thread_id: params.chatId,
      customer_handle: params.fromHandle,
      active_flow_id: startFlow.id,
      active_step_id: entryStep.id,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id')
    .single()
  if (!conversation) return

  let stepDelivered = true
  try {
    await sendTelegramFlowStep(conn.botToken, params.chatId, entryStep)
  } catch (err: any) {
    stepDelivered = false
    console.error('ai-agent telegram webhook: flow start send failed:', err.message)
    await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
  }

  if (stepDelivered) await maybeExecuteInvoiceStep(conn, conversation.id, params.chatId, entryStep)

  if (isTerminalStep(entryStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
}

// Handles a callback_query update (an inline-keyboard button tap) for a
// customer currently inside a flow. Resolves the click's outcome FIRST,
// then answers the callback query exactly once with outcome-appropriate
// text -- Telegram allows only one answerCallbackQuery call per callback
// query id, so answering eagerly (before knowing the outcome) would
// foreclose ever attaching a toast message to a stale/invalid click.
export async function handleTelegramFlowCallback(
  conn: TelegramTenantConnection,
  params: { chatId: string; data: string; callbackQueryId: string }
): Promise<void> {
  const { data: agent } = await supabase.from('ai_agents').select('is_enabled').eq('id', conn.agentId).single()
  if (!agent || agent.is_enabled === false) {
    // Owner paused the agent -- still clear the customer's spinner, but
    // otherwise stay silent, matching handleTelegramIncoming's own pause behavior.
    await answerTelegramCallbackQuery(conn.botToken, params.callbackQueryId).catch((err: any) => {
      console.error('ai-agent telegram webhook: answerCallbackQuery failed:', err.message)
    })
    return
  }

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, active_flow_id, active_step_id')
    .eq('agent_id', conn.agentId)
    .eq('channel', 'telegram')
    .eq('external_thread_id', params.chatId)
    .maybeSingle()

  // callback_data is "btn:<stepId>:<index>" -- the step id lets a click on
  // an OLD step's still-visible inline keyboard (Telegram never removes
  // old keyboards from chat history) be detected as stale instead of
  // silently resolved against whatever button currently sits at that
  // array index on the CURRENT step.
  const match = params.data.match(/^btn:([^:]+):(\d+)$/)
  const clickedStepId = match ? match[1] : undefined
  const buttonIndex = match ? Number(match[2]) : NaN

  const STALE_TOAST = 'Этот сценарий уже неактуален'
  let toastText: string | undefined
  let clearState = false
  let nextStepToSend: FlowStep | undefined

  if (!conversation?.active_flow_id || !conversation.active_step_id || clickedStepId !== conversation.active_step_id) {
    toastText = STALE_TOAST
  } else {
    const { data: flow } = await supabase.from('ai_agent_flows').select('id, definition').eq('id', conversation.active_flow_id).maybeSingle()
    const definition = flow ? parseFlowDefinition(flow.definition) : null
    const currentStep = definition ? findStepById(definition, conversation.active_step_id) : undefined
    const button = currentStep?.buttons[buttonIndex]

    if (!definition || !currentStep || !button) {
      toastText = STALE_TOAST
      clearState = true
    } else if (button.nextStepId === null) {
      // "Конец сценария" -- ends immediately, no further message (the
      // button's own label was the final word).
      clearState = true
    } else {
      const nextStep = findStepById(definition, button.nextStepId)
      if (!nextStep) {
        // Dangling reference -- shouldn't happen (the save route validates
        // this), defensive: end the flow rather than send nothing.
        toastText = STALE_TOAST
        clearState = true
      } else {
        nextStepToSend = nextStep
      }
    }
  }

  try {
    await answerTelegramCallbackQuery(conn.botToken, params.callbackQueryId, toastText)
  } catch (err: any) {
    console.error('ai-agent telegram webhook: answerCallbackQuery failed:', err.message)
  }

  if (!conversation) return

  if (clearState) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    return
  }

  if (nextStepToSend) {
    await supabase.from('ai_agent_conversations').update({ active_step_id: nextStepToSend.id }).eq('id', conversation.id)
    let stepDelivered = true
    try {
      await sendTelegramFlowStep(conn.botToken, params.chatId, nextStepToSend)
    } catch (err: any) {
      stepDelivered = false
      console.error('ai-agent telegram webhook: flow step send failed:', err.message)
      await markTelegramTokenExpiredIfUnauthorized(conn.connectionId, err)
    }
    if (stepDelivered) await maybeExecuteInvoiceStep(conn, conversation.id, params.chatId, nextStepToSend)
    if (isTerminalStep(nextStepToSend)) {
      await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    }
  }
}
