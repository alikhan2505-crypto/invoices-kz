import { createClient } from '@supabase/supabase-js'
import { generateAiReply } from '@/lib/instagramAiReply'
import { buildBusinessContextLine, buildCollectFieldsToExtract, buildCatalogBlock, AgentTone, AgentGoal } from './promptContext'
import { loadAgentCatalog } from './catalogContext'
import { buildInvoiceToolExecutor } from './invoiceSend'
import { debitAiAgentWallet, AI_AGENT_CREDITS_PER_AI_REPLY, hasAiAgentBudget, AI_AGENT_BUDGET_DEPLETED_REPLY } from './wallet'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { findTemplateMatch, mergeCollectedData, findStopPhraseMatch, STOP_PHRASE_ACK_TEXT } from './webhookHandler'
import { pairConversationHistory } from './telegram'
import { findFlowTriggerMatch, type FlowStep } from './flow'
import { startFlow, handleFlowButtonClick, FLOW_STALE_TEXT, type FlowStepSender } from './flowEngine'
import { sendIntoConversation } from './channelSend'

// The website tenant pipeline -- a fourth twin of telegramWebhookHandler.ts/
// whatsappWebhookHandler.ts/webhookHandler.ts, driven by direct POSTs from
// the embed widget instead of a platform webhook. Genuinely simpler in one
// respect (no external send API to call -- "sending" a reply is just
// inserting the outbound row; the widget's own poll picks it up) and
// structurally different in one respect (a single POST endpoint carries
// BOTH ordinary messages and flow-button clicks, distinguished by
// isButtonClick, rather than a webhook route seeing a different payload
// shape per event type).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface WebsiteTenantConnection {
  connectionId: string
  agentId: string
  widgetKey: string
}

export async function loadWebsiteConnection(widgetKey: string): Promise<WebsiteTenantConnection | null> {
  const { data } = await supabase
    .from('ai_agent_channel_connections')
    .select('id, agent_id, external_account_id')
    .eq('channel', 'website')
    .eq('external_account_id', widgetKey)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return { connectionId: data.id, agentId: data.agent_id, widgetKey: data.external_account_id }
}

// Website has no external send API -- "delivering" a flow step means
// writing the outbound row with its buttons attached (a nullable jsonb
// column only this channel ever populates); the widget's own poll renders
// them as real HTML buttons, with no platform button-count limit.
function makeWebsiteFlowSender(conversationId: string): FlowStepSender {
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
      console.error('ai-agent website widget: flow step send failed:', error.message)
      return false
    }
    return true
  }
}

interface WebsiteIncomingParams {
  externalId: string
  visitorId: string
  text: string
  isButtonClick: boolean
}

export async function handleWebsiteIncoming(conn: WebsiteTenantConnection, params: WebsiteIncomingParams): Promise<void> {
  const { data: existingMsg } = await supabase
    .from('ai_agent_messages')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existingMsg) return

  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conn.agentId).single()
  if (!agent) return
  if (agent.is_enabled === false) return

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .upsert({
      agent_id: conn.agentId,
      channel: 'website',
      external_thread_id: params.visitorId,
      customer_handle: 'посетитель сайта',
    }, { onConflict: 'agent_id,channel,external_thread_id', ignoreDuplicates: false })
    .select('id, paused_for_human')
    .single()
  if (!conversation) return

  const conversationRef = { id: conversation.id, agent_id: conn.agentId, channel: 'website', external_thread_id: params.visitorId }

  // Conditional claim, same idiom as paused_for_human below -- see
  // whatsappWebhookHandler.ts's identical comment for why a plain "count
  // prior messages" check isn't safe against two genuinely concurrent
  // first messages. Skipped entirely for a button click: that can only ever
  // happen once a flow is already active, which itself requires at least
  // one prior message to have started it.
  let isFirstMessage = false
  if (!params.isButtonClick) {
    const { data: startClaim } = await supabase.from('ai_agent_conversations')
      .update({ start_flow_triggered: true }).eq('id', conversation.id).eq('start_flow_triggered', false).select('id')
    isFirstMessage = !!(startClaim && startClaim.length > 0)
  }

  const { error: insertError } = await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    text: params.isButtonClick ? `[кнопка] ${params.text}` : params.text,
    external_id: params.externalId,
  })
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('ai-agent website widget: failed to log inbound message for', params.externalId, ':', insertError.message)
    }
    return
  }

  if (params.isButtonClick) {
    if (conversation.paused_for_human) return
    const result = await handleFlowButtonClick(supabase, conversationRef, params.text, makeWebsiteFlowSender(conversation.id))
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
      await startFlow(supabase, conversationRef, startFlowRow, makeWebsiteFlowSender(conversation.id))
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
    await startFlow(supabase, conversationRef, matchedFlow, makeWebsiteFlowSender(conversation.id))
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

  let draftReply: string
  let urgent: boolean
  let extractedFields: Record<string, string> | undefined
  // Checked before the AI call (not just before the debit below) so a
  // depleted wallet also skips the real Anthropic cost of a reply that was
  // never going to be billed -- see hasAiAgentBudget's own comment.
  const budgetDepleted = !(await hasAiAgentBudget(agent.user_id))
  if (budgetDepleted) {
    draftReply = AI_AGENT_BUDGET_DEPLETED_REPLY
    urgent = false
  } else try {
    const catalogBlock = buildCatalogBlock(await loadAgentCatalog(supabase, agent.user_id))
    const result = await generateAiReply({
      incomingText: params.text,
      fromUsername: 'посетитель сайта',
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
        channel: 'website',
      }) + catalogBlock,
      collectFieldsToExtract: buildCollectFieldsToExtract(Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined),
      invoiceTool: buildInvoiceToolExecutor(supabase, { id: agent.id, status: agent.status }, conversation.id),
    })
    draftReply = result.replyText
    urgent = result.urgent
    extractedFields = result.extractedFields
  } catch (err: any) {
    console.error('ai-agent website widget: AI reply generation failed for', params.externalId, ':', err.message)
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
        console.error('ai-agent website widget: training-mode nudge failed for user', agent.user_id, ':', telegramErr.message)
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
  // The canned budget-depleted reply is never billed -- there is nothing to
  // debit for a message the AI never actually generated.
  if (!budgetDepleted) {
    try {
      await debitAiAgentWallet(agent.user_id, AI_AGENT_CREDITS_PER_AI_REPLY, 'ИИ-ответ: Сайт')
    } catch (walletErr: any) {
      console.error('ai-agent website widget: wallet debit failed for user', agent.user_id, ':', walletErr.message)
    }
  }
}
