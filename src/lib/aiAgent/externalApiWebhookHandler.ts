import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCollectFieldsToExtract, buildCatalogBlock, AgentTone, AgentGoal } from './promptContext'
import { loadAgentCatalog } from './catalogContext'
import { buildInvoiceToolExecutor } from './invoiceSend'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY, hasAiAgentBudget, AI_AGENT_BUDGET_DEPLETED_REPLY } from './wallet'
import { isConversationRateLimited } from './rateLimit'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { findTemplateMatch, mergeCollectedData, findStopPhraseMatch, STOP_PHRASE_ACK_TEXT } from './webhookHandler'
import { pairConversationHistory } from './telegram'
import { findFlowTriggerMatch, type FlowStep } from './flow'
import { startFlow, handleFlowButtonClick, FLOW_STALE_TEXT, type FlowStepSender } from './flowEngine'
import { sendIntoConversation } from './channelSend'
import { hashApiKey } from './externalApi'

// The fifth tenant pipeline, a twin of websiteWebhookHandler.ts (which it
// mirrors almost exactly -- same "no external send API, the outbound row
// IS the delivery" shape) rather than telegramWebhookHandler.ts/
// whatsappWebhookHandler.ts/webhookHandler.ts (which all call out to a real
// platform send API). Driven by direct POSTs from the OWNER's OWN backend
// system (their CRM, app, or site) instead of an embedded browser widget --
// authenticated with a real secret API key rather than a publicly-visible
// widget data-key, so unlike website there is no per-end-user rate limit to
// bypass by spoofing an identity (see externalApi.ts).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ExternalApiConnection {
  connectionId: string
  agentId: string
}

export async function loadExternalApiConnection(apiKey: string): Promise<ExternalApiConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id')
    .eq('channel', 'api')
    .eq('api_token_hash', hashApiKey(apiKey))
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return { connectionId: data.id, agentId: data.agent_id }
}

// No external send API for this channel -- "delivering" a flow step means
// writing the outbound row with its buttons attached (same nullable jsonb
// column the website widget uses), for the caller's own system to render
// however it wants when it polls GET .../external/messages.
function makeExternalApiFlowSender(conversationId: string): FlowStepSender {
  return async (step: FlowStep) => {
    const { error } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      text: step.text,
      is_ai_generated: false,
      status: 'sent',
      buttons: step.buttons.length > 0 ? step.buttons.map((b, i) => ({ label: b.label, payload: `btn:${step.id}:${i}` })) : null,
    })
    if (error) {
      console.error('ai-agent external api: flow step send failed:', error.message)
      return false
    }
    return true
  }
}

interface ExternalApiIncomingParams {
  externalUserId: string
  text: string
  customerName?: string
  isButtonClick: boolean
}

export async function handleExternalApiIncoming(conn: ExternalApiConnection, params: ExternalApiIncomingParams): Promise<void> {
  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return
  if (agent.is_enabled === false) return

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'api',
      external_thread_id: params.externalUserId,
      customer_handle: params.customerName?.trim() || params.externalUserId,
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id, paused_for_human')
    .single()
  if (!conversation) return

  const conversationRef = { id: conversation.id, agent_id: conn.agentId, channel: 'api', external_thread_id: params.externalUserId }

  // Conditional claim, same idiom as the paused_for_human claim below and
  // websiteWebhookHandler.ts's identical block -- see that file's comment
  // for why a plain "count prior messages" check isn't safe against two
  // genuinely concurrent first messages. Skipped for a button click: that
  // can only happen once a flow is already active.
  let isFirstMessage = false
  if (!params.isButtonClick) {
    const { data: startClaim } = await supabase.from('ai_agent_conversations')
      .update({ start_flow_triggered: true }).eq('id', conversation.id).eq('start_flow_triggered', false).select('id')
    isFirstMessage = !!(startClaim && startClaim.length > 0)
  }

  // No webhook-redelivery concept here (a direct POST from the caller's own
  // backend, not a platform webhook) -- externalId is generated fresh per
  // call, same as the website widget, purely so this row has one for the
  // shared ai_agent_messages schema. Nothing to deduplicate a genuine
  // double-send against.
  const externalId = crypto.randomUUID()
  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.isButtonClick ? `[кнопка] ${params.text}` : params.text,
    external_id: externalId,
  })
  if (insertError) {
    console.error('ai-agent external api: failed to log inbound message:', insertError.message)
    return
  }

  if (params.isButtonClick) {
    if (conversation.paused_for_human) return
    const result = await handleFlowButtonClick(supabase, conversationRef, params.text, makeExternalApiFlowSender(conversation.id))
    if (result.outcome === 'stale') {
      await sendIntoConversation(supabase, conversationRef, FLOW_STALE_TEXT)
    }
    return
  }

  if (isFirstMessage) {
    const { data: startFlowRow } = await supabase
      .from('ai_agent_flows')
      .select('id, definition')
      .eq('agent_id', conn.agentId)
      .eq('is_start', true)
      .maybeSingle()
    if (startFlowRow) {
      await startFlow(supabase, conversationRef, startFlowRow, makeExternalApiFlowSender(conversation.id))
      return
    }
  }

  if (conversation.paused_for_human) return

  if (findStopPhraseMatch(params.text, Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [])) {
    const { data: claimed } = await supabase.from('ai_agent_conversations')
      .update({ paused_for_human: true }).eq('id', conversation.id).eq('paused_for_human', false).select('id')
    if (!claimed || claimed.length === 0) return
    await sendIntoConversation(supabase, conversationRef, STOP_PHRASE_ACK_TEXT)
    await createNotification(agent.user_id, 'Клиент попросил оператора', params.text.slice(0, 120), '/ai-agent/dialogs')
    const { data: ownerProfile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (ownerProfile?.notify_telegram && ownerProfile.telegram_chat_id) {
      try {
        await sendTelegramNotification(ownerProfile.telegram_chat_id, `Клиент попросил оператора: «${params.text.slice(0, 120)}» — https://www.invoices.kz/ai-agent/dialogs`)
      } catch (telegramErr: any) {
        console.error('ai-agent external api: stop-phrase Telegram nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
  }

  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or('channel.is.null,channel.eq.dm')
    .order('created_at', { ascending: true })
  const match = findTemplateMatch(params.text, templates || [])
  if (match) {
    await sendIntoConversation(supabase, conversationRef, match.reply_text)
    return
  }

  const { data: flows } = await supabase
    .from('ai_agent_flows')
    .select('id, trigger_words, definition')
    .eq('agent_id', conn.agentId)
    .order('created_at', { ascending: true })
  const matchedFlowId = findFlowTriggerMatch(params.text, flows || [])
  const matchedFlow = matchedFlowId ? (flows || []).find(f => f.id === matchedFlowId) : undefined
  if (matchedFlow) {
    await startFlow(supabase, conversationRef, matchedFlow, makeExternalApiFlowSender(conversation.id))
    return
  }

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

  // Anti-abuse ceiling (security audit 2026-09-04): every reply below costs
  // the seller 5 ₸ plus a real model call, and nothing capped how fast one
  // thread could ask. A flooder is dropped silently; 30 AI replies in an
  // hour inside a single conversation is far past anything a real customer
  // does. See rateLimit.ts.
  if (await isConversationRateLimited(supabase, conversation.id)) {
    console.warn('ai-agent: conversation rate limit hit, dropping message for', conversation.id)
    return
  }

  let draftReply: string
  let urgent: boolean
  let extractedFields: Record<string, string> | undefined
  const budgetDepleted = !(await hasAiAgentBudget(agent.user_id))
  if (budgetDepleted) {
    draftReply = AI_AGENT_BUDGET_DEPLETED_REPLY
    urgent = false
  } else try {
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: params.text,
      fromUsername: params.customerName?.trim() || params.externalUserId,
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
        channel: 'api',
      }) + catalogBlock,
      collectFieldsToExtract: buildCollectFieldsToExtract(Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined),
      invoiceTool: buildInvoiceToolExecutor(supabase, { id: agent.id, status: agent.status }, conversation.id),
    })
    draftReply = result.replyText
    urgent = result.urgent
    extractedFields = result.extractedFields
  } catch (err: any) {
    console.error('ai-agent external api: AI reply generation failed:', err.message)
    return
  }

  if (extractedFields && Object.keys(extractedFields).length > 0) {
    await mergeCollectedData(conversation.id, extractedFields)
  }

  if (agent.status === 'training') {
    const { data: inserted } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      text: draftReply,
      is_ai_generated: !budgetDepleted,
      status: 'pending_review',
      urgent,
    }).select('id').single()

    if (inserted) {
      await createNotification(agent.user_id, 'Новый черновик ответа на проверке', draftReply.slice(0, 120), '/ai-agent/review')
    }

    const { data: profile } = await supabase.from('profiles').select('telegram_chat_id, notify_telegram').eq('id', agent.user_id).single()
    if (profile?.notify_telegram && profile.telegram_chat_id && inserted) {
      try {
        await sendTelegramNotification(profile.telegram_chat_id, 'У вас новый черновик ответа на проверке в AI-агенте: https://www.invoices.kz/ai-agent/review')
      } catch (telegramErr: any) {
        console.error('ai-agent external api: training-mode nudge failed for user', agent.user_id, ':', telegramErr.message)
      }
    }
    return
  }

  await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'outbound',
    text: draftReply,
    is_ai_generated: !budgetDepleted,
    status: 'sent',
    urgent,
  })
  if (!budgetDepleted) {
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: API')
    } catch (walletErr: any) {
      console.error('ai-agent external api: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  }
}
