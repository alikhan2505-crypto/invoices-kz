import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { sendTelegramBotMessage } from './telegram'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendDirectMessage } from '@/lib/instagram'
import { validateDraftInput, normalizeToolInput, canAutoSend, type DraftItem, type InvoiceToolInput } from './invoiceDrafts'
import { createNotification } from '@/lib/notifications'

// Phase 3 «счёт из чата» core: turns an approved (or auto-approved)
// draft into a REAL invoices.kz счёт and sends the /view link into the
// draft's conversation. Invoice creation mirrors the canonical
// server-side path in src/app/api/cron/recurring/route.ts (RPC
// claim_invoice_number + invoices insert + public_token link). The
// /view/[token] page then does the rest on its own: Kaspi payment link
// auto-mint for Pro owners with a connected Кассир, live paid-polling --
// zero payment code here by design (see the spec).

// The create_invoice_draft executor all three tenant handlers pass to
// generateAiReply's invoiceTool param -- one shared implementation so
// the channels can't drift. Validation errors and missing name/phone go
// back to the model as structured outcomes (it asks the customer);
// a complete input becomes a draft, auto-sent only per canAutoSend
// (active agent + 5 human-approved drafts -- in training everything
// waits in the review queue alongside the reply itself).
export function buildInvoiceToolExecutor(
  supabase: SupabaseClient,
  agent: { id: string; status: string },
  conversationId: string,
) {
  return {
    execute: async (raw: InvoiceToolInput) => {
      const { data: conv } = await supabase.from('ai_agent_conversations')
        .select('collected_name, collected_phone')
        .eq('id', conversationId).single()
      const norm = normalizeToolInput(raw, { name: conv?.collected_name, phone: conv?.collected_phone })
      const validated = validateDraftInput(norm.items)
      if (!validated.ok) return { outcome: 'draft_pending' as const, error: validated.error }
      const missing: ('customer_name' | 'customer_phone')[] = []
      if (!norm.customerName) missing.push('customer_name')
      if (!norm.customerPhone) missing.push('customer_phone')
      if (missing.length > 0) return { outcome: 'draft_pending' as const, missing }
      const { count } = await supabase.from('ai_agent_invoice_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('status', 'approved_sent')
      const auto = canAutoSend(agent.status, count || 0)
      const created = await createDraft(supabase, {
        agentId: agent.id,
        conversationId,
        customerName: norm.customerName,
        customerPhone: norm.customerPhone,
        items: validated.items,
        total: validated.total,
        source: 'ai_tool',
        autoSend: auto,
      })
      return created.sent
        ? { outcome: 'sent' as const, total: validated.total }
        : { outcome: 'draft_pending' as const, total: validated.total }
    },
  }
}

// Creates the draft row; when autoSend, immediately issues+sends the
// invoice. Split so the review route can approve a pending draft later
// through the same sendInvoiceForDraft.
export async function createDraft(supabase: SupabaseClient, args: {
  agentId: string
  conversationId: string
  customerName: string
  customerPhone: string
  items: DraftItem[]
  total: number
  source: 'ai_tool' | 'flow_step'
  autoSend: boolean
}): Promise<{ draftId: string; sent: boolean }> {
  const { data: draft, error } = await supabase.from('ai_agent_invoice_drafts').insert({
    agent_id: args.agentId,
    conversation_id: args.conversationId,
    customer_name: args.customerName,
    customer_phone: args.customerPhone,
    items: args.items,
    total: args.total,
    source: args.source,
    status: 'pending_approval',
  }).select('id').single()
  if (error || !draft) throw new Error(`draft insert failed: ${error?.message}`)
  if (!args.autoSend) {
    // Best-effort owner nudge (final-review finding I4: without this a
    // customer is told «счёт готовится» while the owner has zero signal
    // until they happen to open the review page). Failure never blocks
    // the draft itself.
    try {
      const { data: agent } = await supabase.from('ai_agents').select('user_id').eq('id', args.agentId).single()
      if (agent) {
        await createNotification(agent.user_id, 'Черновик счёта ждёт подтверждения',
          `${args.customerName || 'Клиент'} — ${args.total.toLocaleString('ru-KZ')} ₸`, '/ai-agent/review')
      }
    } catch (err: any) {
      console.error('ai-agent invoice draft: owner notification failed:', err?.message || err)
    }
    return { draftId: draft.id, sent: false }
  }
  const sent = await sendInvoiceForDraft(supabase, draft.id, { auto: true })
  return { draftId: draft.id, sent: sent.ok }
}

// Idempotent on retry: a draft that already has invoice_id skips
// creation and only re-sends the link. On any failure the draft goes to
// status='error' with error_message and NOTHING new reaches the
// customer -- the review card shows the error with a retry button.
export async function sendInvoiceForDraft(
  supabase: SupabaseClient,
  draftId: string,
  opts: { auto?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const fail = async (msg: string) => {
    await supabase.from('ai_agent_invoice_drafts')
      .update({ status: 'error', error_message: msg, decided_at: new Date().toISOString() })
      .eq('id', draftId)
    return { ok: false, error: msg }
  }
  try {
    // Atomic claim (final-review finding C1): two concurrent approves --
    // or an approve racing a reject -- must never both proceed. Only the
    // request that flips the row to 'sending' does the work; everyone
    // else sees zero claimed rows and backs off. reject's own
    // conditional update can't touch a 'sending' row either.
    const { data: claimed } = await supabase.from('ai_agent_invoice_drafts')
      .update({ status: 'sending' })
      .eq('id', draftId)
      .in('status', ['pending_approval', 'error'])
      .select('id')
    if (!claimed || claimed.length === 0) {
      return { ok: false, error: 'draft already claimed' }
    }

    const { data: draft } = await supabase.from('ai_agent_invoice_drafts').select('*').eq('id', draftId).single()
    if (!draft) return { ok: false, error: 'draft not found' }

    const { data: agent } = await supabase.from('ai_agents').select('id, user_id, name').eq('id', draft.agent_id).single()
    if (!agent) return fail('агент не найден')
    const { data: conversation } = await supabase.from('ai_agent_conversations')
      .select('id, channel, external_thread_id, agent_id')
      .eq('id', draft.conversation_id).single()
    if (!conversation) return fail('диалог не найден')

    let invoiceId: string | null = draft.invoice_id
    let publicToken: string | null = null
    let invoiceNumber: string | null = null

    if (invoiceId) {
      const { data: existing } = await supabase.from('invoices')
        .select('id, number, public_token').eq('id', invoiceId).single()
      if (!existing) return fail('счёт из черновика не найден')
      publicToken = existing.public_token
      invoiceNumber = existing.number
    } else {
      const { data: number, error: numberError } = await supabase.rpc('claim_invoice_number', { p_user_id: agent.user_id })
      if (numberError) return fail(`нумерация: ${numberError.message}`)
      const services = (draft.items as DraftItem[]).map(i => ({
        name: i.name, qty: i.qty, price: i.unitPrice, unit: 'шт', code: '', type: 'service',
      }))
      const { data: invoice, error: invError } = await supabase.from('invoices').insert({
        user_id: agent.user_id,
        number,
        amount: draft.total,
        status: 'sent',
        client_name: draft.customer_name || 'Клиент из чата',
        client_phone: draft.customer_phone || null,
        services,
        note: 'Выставлен ИИ-агентом из диалога',
      }).select('id, number, public_token').single()
      if (invError || !invoice) return fail(`создание счёта: ${invError?.message}`)
      invoiceId = invoice.id
      publicToken = invoice.public_token
      invoiceNumber = invoice.number
      // Persist BEFORE sending and fail hard if it doesn't stick
      // (final-review finding I3): without invoice_id on the draft, a
      // later «Повторить» would claim a new number and create a
      // duplicate real invoice instead of re-sending this one.
      const { error: persistError } = await supabase.from('ai_agent_invoice_drafts')
        .update({ invoice_id: invoiceId }).eq('id', draftId)
      if (persistError) return fail(`сохранение ссылки на счёт: ${persistError.message}`)
    }

    const link = `https://www.invoices.kz/view/${publicToken}`
    const text = `Ваш счёт №${invoiceNumber} на ${Number(draft.total).toLocaleString('ru-KZ')} ₸ готов: ${link}`
    const sendError = await sendIntoConversation(supabase, conversation, text)
    if (sendError) return fail(`отправка в чат: ${sendError}`)

    const { error: finalError } = await supabase.from('ai_agent_invoice_drafts').update({
      status: opts.auto ? 'auto_sent' : 'approved_sent',
      decided_at: new Date().toISOString(),
    }).eq('id', draftId)
    if (finalError) {
      // The link already reached the customer -- returning ok would leave
      // the card pending and invite a second (double-sending) click, so
      // surface the failure instead (finding I3).
      console.error('ai-agent invoice draft: final status update failed:', finalError.message)
      return fail('счёт отправлен клиенту, но статус черновика не сохранился — не отправляйте повторно без проверки')
    }
    return { ok: true }
  } catch (err: any) {
    return fail(String(err?.message || err))
  }
}

// Sends one plain-text message into a conversation via its channel's
// active connection, and records it as an outbound ai_agent_messages row
// so the dialog history shows the invoice link. Returns null on success,
// an error string on failure (caller decides how to surface it).
async function sendIntoConversation(
  supabase: SupabaseClient,
  conversation: { id: string; channel: string; external_thread_id: string; agent_id: string },
  text: string,
): Promise<string | null> {
  const { data: connection } = await supabase.from('ai_agent_channel_connections')
    .select('external_account_id, access_token_enc, status')
    .eq('agent_id', conversation.agent_id)
    .eq('channel', conversation.channel)
    .eq('status', 'active')
    .maybeSingle()
  if (!connection) return `нет активного подключения канала ${conversation.channel}`

  try {
    const accessToken = decryptAtRest(connection.access_token_enc, getKey()).toString('utf8')
    if (conversation.channel === 'telegram') {
      await sendTelegramBotMessage(accessToken, conversation.external_thread_id, text)
    } else if (conversation.channel === 'whatsapp') {
      await sendWhatsAppMessage(connection.external_account_id, conversation.external_thread_id, text, { accessToken })
    } else if (conversation.channel === 'instagram') {
      await sendDirectMessage(conversation.external_thread_id, text, {
        igUserId: connection.external_account_id,
        accessToken,
      })
    } else {
      return `неизвестный канал ${conversation.channel}`
    }
  } catch (err: any) {
    return String(err?.message || err)
  }

  await supabase.from('ai_agent_messages').insert({
    conversation_id: conversation.id,
    direction: 'outbound',
    text,
    is_ai_generated: false,
    status: 'sent',
  })
  return null
}
