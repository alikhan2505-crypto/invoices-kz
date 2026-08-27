import type { SupabaseClient } from '@supabase/supabase-js'
import { parseFlowDefinition, firstStep, isTerminalStep, resolveFlowButtonClick, type FlowStep } from './flow'
import { sendIntoConversation } from './channelSend'
import { createDraft } from './invoiceSend'
import { validateDraftInput, canAutoSend } from './invoiceDrafts'

// Shared start/click/invoice-step orchestration for channels that render
// flow steps as their own native interactive message type (WhatsApp
// Reply Buttons/List Messages, Instagram quick replies) instead of
// Telegram's inline keyboard. Telegram keeps its own already-shipped
// equivalents (telegramWebhookHandler.ts) untouched -- this module exists
// so WhatsApp/Instagram don't each reimplement the same state machine.

export type FlowStepSender = (step: FlowStep) => Promise<boolean>

export interface FlowConversationRef {
  id: string
  agent_id: string
  channel: string
  external_thread_id: string
}

export const FLOW_STALE_TEXT = 'Этот сценарий уже неактуален'

// Phase 3 «счёт из чата», channel-generic twin of
// telegramWebhookHandler.ts's maybeExecuteInvoiceStep: after an 'invoice'
// step's own text is delivered, creates an invoice draft from the step's
// fixed item + the conversation's collected name/phone. Missing name/phone
// -> a fixed ask via the plain-text sendIntoConversation (an invoice step
// is terminal-shaped, buttons: [], so the customer's reply flows through
// the normal pipeline afterward, where the AI tool can finish the job).
export async function maybeExecuteInvoiceStep(
  supabase: SupabaseClient,
  conversation: FlowConversationRef,
  step: FlowStep,
): Promise<void> {
  if (step.kind !== 'invoice' || !step.invoiceItem) return
  try {
    const { data: conv } = await supabase.from('ai_agent_conversations')
      .select('collected_name, collected_phone').eq('id', conversation.id).single()
    const customerName = conv?.collected_name?.trim() || ''
    const customerPhone = conv?.collected_phone?.trim() || ''
    if (!customerName || !customerPhone) {
      await sendIntoConversation(supabase, conversation, 'Чтобы выставить счёт, напишите, пожалуйста, ваше имя и номер телефона одним сообщением.')
      return
    }
    const validated = validateDraftInput([{ name: step.invoiceItem.name, qty: 1, unitPrice: step.invoiceItem.unitPrice }])
    if (!validated.ok) {
      console.error('ai-agent flow engine: invoice step has invalid item:', validated.error)
      return
    }
    const { data: agentRow } = await supabase.from('ai_agents').select('status').eq('id', conversation.agent_id).single()
    const { count } = await supabase.from('ai_agent_invoice_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', conversation.agent_id)
      .eq('status', 'approved_sent')
    const auto = canAutoSend(agentRow?.status || 'training', count || 0)
    const created = await createDraft(supabase, {
      agentId: conversation.agent_id,
      conversationId: conversation.id,
      customerName,
      customerPhone,
      items: validated.items,
      total: validated.total,
      source: 'flow_step',
      autoSend: auto,
    })
    if (!created.sent) {
      await sendIntoConversation(supabase, conversation, 'Счёт готовится — как только владелец подтвердит, ссылка на оплату придёт сюда.')
    }
  } catch (err: any) {
    console.error('ai-agent flow engine: invoice step failed:', err?.message || err)
  }
}

// Starts a flow: sends its entry step via the caller's own channel-specific
// sendStep, marks the conversation as inside this flow/step, runs the
// invoice-step side effect if applicable, and immediately clears the flow
// state again if the entry step is terminal (a one-step flow with no
// buttons shouldn't leave the conversation waiting for a click that will
// never come).
export async function startFlow(
  supabase: SupabaseClient,
  conversation: FlowConversationRef,
  flow: { id: string; definition: unknown },
  sendStep: FlowStepSender,
): Promise<void> {
  const definition = parseFlowDefinition(flow.definition)
  const entryStep = definition ? firstStep(definition) : undefined
  if (!definition || !entryStep) return // corrupted saved flow -- shouldn't happen, defensive no-op

  await supabase.from('ai_agent_conversations').update({ active_flow_id: flow.id, active_step_id: entryStep.id }).eq('id', conversation.id)

  const delivered = await sendStep(entryStep)
  if (delivered) await maybeExecuteInvoiceStep(supabase, conversation, entryStep)

  if (isTerminalStep(entryStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
}

// Resolves + advances a click on a flow's interactive message, for a
// channel with no separate "acknowledge the tap" step (unlike Telegram's
// callback_query/answerCallbackQuery) -- a stale click just gets
// FLOW_STALE_TEXT as a normal reply from the caller, an ended flow gets
// nothing further, an advance sends the next step the same way startFlow does.
export async function handleFlowButtonClick(
  supabase: SupabaseClient,
  conversation: FlowConversationRef,
  clickedPayload: string,
  sendStep: FlowStepSender,
): Promise<{ outcome: 'stale' | 'ended' | 'advanced' }> {
  const { data: current } = await supabase
    .from('ai_agent_conversations')
    .select('active_flow_id, active_step_id')
    .eq('id', conversation.id)
    .maybeSingle()

  // Same "btn:<stepId>:<index>" format Telegram already uses for
  // callback_data -- the step id lets a click on an OLD, still-visible
  // interactive message be detected as stale instead of resolved against
  // whatever button currently sits at that array index on the CURRENT step.
  const match = clickedPayload.match(/^btn:([^:]+):(\d+)$/)
  const clickedStepId = match ? match[1] : undefined
  const buttonIndex = match ? Number(match[2]) : NaN

  if (!current?.active_flow_id || !current.active_step_id || clickedStepId !== current.active_step_id) {
    return { outcome: 'stale' }
  }

  const { data: flow } = await supabase.from('ai_agent_flows').select('id, definition').eq('id', current.active_flow_id).maybeSingle()
  const definition = flow ? parseFlowDefinition(flow.definition) : null
  const resolution = definition ? resolveFlowButtonClick(definition, current.active_step_id, buttonIndex) : { outcome: 'stale' as const }

  if (resolution.outcome !== 'advanced') {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
    return { outcome: resolution.outcome }
  }

  await supabase.from('ai_agent_conversations').update({ active_step_id: resolution.nextStep.id }).eq('id', conversation.id)
  const delivered = await sendStep(resolution.nextStep)
  if (delivered) await maybeExecuteInvoiceStep(supabase, conversation, resolution.nextStep)
  if (isTerminalStep(resolution.nextStep)) {
    await supabase.from('ai_agent_conversations').update({ active_flow_id: null, active_step_id: null }).eq('id', conversation.id)
  }
  return { outcome: 'advanced' }
}
