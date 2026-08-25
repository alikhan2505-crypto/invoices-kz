import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from './connection'
import { sendTelegramBotMessage } from './telegram'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendDirectMessage } from '@/lib/instagram'
import type { DraftItem } from './invoiceDrafts'

// Phase 3 «счёт из чата» core: turns an approved (or auto-approved)
// draft into a REAL invoices.kz счёт and sends the /view link into the
// draft's conversation. Invoice creation mirrors the canonical
// server-side path in src/app/api/cron/recurring/route.ts (RPC
// claim_invoice_number + invoices insert + public_token link). The
// /view/[token] page then does the rest on its own: Kaspi payment link
// auto-mint for Pro owners with a connected Кассир, live paid-polling --
// zero payment code here by design (see the spec).

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
  if (!args.autoSend) return { draftId: draft.id, sent: false }
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
      await supabase.from('ai_agent_invoice_drafts').update({ invoice_id: invoiceId }).eq('id', draftId)
    }

    const link = `https://www.invoices.kz/view/${publicToken}`
    const text = `Ваш счёт №${invoiceNumber} на ${Number(draft.total).toLocaleString('ru-KZ')} ₸ готов: ${link}`
    const sendError = await sendIntoConversation(supabase, conversation, text)
    if (sendError) return fail(`отправка в чат: ${sendError}`)

    await supabase.from('ai_agent_invoice_drafts').update({
      status: opts.auto ? 'auto_sent' : 'approved_sent',
      decided_at: new Date().toISOString(),
    }).eq('id', draftId)
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
