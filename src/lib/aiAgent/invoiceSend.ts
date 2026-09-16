import type { SupabaseClient } from '@supabase/supabase-js'
import { sendIntoConversation } from './channelSend'
import { validateDraftInput, normalizeToolInput, canAutoSend, checkCatalogPricing, type DraftItem, type InvoiceToolInput } from './invoiceDrafts'
import { loadAgentCatalog } from './catalogContext'
import { pickProductPhoto } from './productPhoto'
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

      // The customer is an untrusted party in this conversation, and the
      // model can be talked into a price. Re-check every line against the
      // owner's own catalog -- the same list the prompt was given -- so a
      // "мы же договорились по 1 ₸" cannot become a real invoice. Items
      // absent from the catalog pass through; see checkCatalogPricing.
      const { data: agentOwner } = await supabase.from('ai_agents').select('user_id, kaspi_shop_connection_id').eq('id', agent.id).maybeSingle()
      if (agentOwner?.user_id) {
        const catalog = await loadAgentCatalog(supabase, agentOwner.user_id, agentOwner.kaspi_shop_connection_id)
        const priced = checkCatalogPricing(validated.items, catalog)
        if (!priced.ok) return { outcome: 'draft_pending' as const, error: priced.error }
      }
      const missing: ('customer_name' | 'customer_phone')[] = []
      if (!norm.customerName) missing.push('customer_name')
      if (!norm.customerPhone) missing.push('customer_phone')
      if (missing.length > 0) return { outcome: 'draft_pending' as const, missing }
      const { count } = await supabase.from('ai_agent_invoice_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('status', 'approved_sent')
      const auto = canAutoSend(agent.status, count || 0, validated.total)
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

    const { data: agent } = await supabase.from('ai_agents').select('id, user_id, name, kaspi_shop_connection_id').eq('id', draft.agent_id).single()
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
    // Line-by-line breakdown (founder request 2026-09-16: name/qty/price per
    // item, e.g. a "Доставка" line the model added as a plain item shows up
    // here the same as any product) instead of only the bare total.
    const items = draft.items as DraftItem[]
    const itemLines = items
      .map(i => `• ${i.name} × ${i.qty} — ${(i.qty * i.unitPrice).toLocaleString('ru-KZ')} ₸`)
      .join('\n')
    const summary = `Ваш счёт №${invoiceNumber}:\n${itemLines}\n\nИтого: ${Number(draft.total).toLocaleString('ru-KZ')} ₸`
    // Full text (with the raw link) is what gets stored in ai_agent_messages
    // history and what any channel without a real button falls back to --
    // WhatsApp's own body (below, via ctaBodyText) drops the link since the
    // "Оплатить счёт" button already carries it (founder feedback
    // 2026-09-16: showing both read as one link too many).
    const text = `${summary}\n\nСсылка на оплату: ${link}`

    // Same rule as every other place a product photo is offered
    // (productPhoto.ts): only when the catalog has an unambiguous
    // image match for the item names actually in the message, never a guess.
    let photoUrl: string | null = null
    try {
      const catalog = await loadAgentCatalog(supabase, agent.user_id, agent.kaspi_shop_connection_id)
      photoUrl = pickProductPhoto(itemLines, catalog)
    } catch (e: any) {
      console.error('ai-agent invoice draft: catalog photo lookup failed (non-fatal):', e?.message || e)
    }

    // WhatsApp gets a tappable "Оплатить счёт" button (+ the matched product
    // photo as the message's header, if any) instead of a bare pasted link --
    // ctaBodyText (no link line, the button already carries it) is what
    // actually renders there. Every other channel falls back to the full
    // `text`, and the history row below always stores that same full text
    // regardless of channel.
    const sendError = await sendIntoConversation(supabase, conversation, text, {
      cta: { label: 'Оплатить счёт', url: link },
      ctaBodyText: summary,
      headerImageUrl: photoUrl,
    })
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

// Fired the moment an invoice actually settles -- either Kaspi Cashier
// confirms real payment (settlePayment.ts, both the webhook and the
// cron/on-demand poll go through there) or the payer self-reports via «Я
// оплатил» on the public /view/[token] page (that route calls this too).
// If this invoice came from an AI-agent chat draft, tells the SAME customer
// in the SAME conversation what happened -- founder request 2026-09-16, so a
// WhatsApp/Instagram/Telegram customer who paid gets a reply instead of
// silence. Every invoice NOT created this way (the overwhelming majority)
// has no matching draft row, so this is a no-op for them: one lookup, done.
export async function notifyInvoicePaidInConversation(
  supabase: SupabaseClient,
  invoiceId: string,
  kind: 'confirmed' | 'self_reported',
): Promise<void> {
  const { data: draft } = await supabase.from('ai_agent_invoice_drafts')
    .select('conversation_id')
    .eq('invoice_id', invoiceId)
    .maybeSingle()
  if (!draft) return

  const { data: conversation } = await supabase.from('ai_agent_conversations')
    .select('id, channel, external_thread_id, agent_id')
    .eq('id', draft.conversation_id)
    .maybeSingle()
  if (!conversation) return

  // 'confirmed' is Kaspi itself telling us the money moved -- safe to thank
  // the customer outright. 'self_reported' is only the payer's own claim
  // (the button writes straight to invoices.status with no Kaspi check
  // behind it, see the /paid route's own comment) -- the reply says so
  // plainly rather than confirming a payment nobody has actually verified.
  const text = kind === 'confirmed'
    ? 'Вы провели оплату через Kaspi, благодарим вас! 🙏'
    : 'Вы нажали, что оплатили — мы проверим и вернёмся к вам.'
  const sendError = await sendIntoConversation(supabase, conversation, text)
  if (sendError) console.error('notifyInvoicePaidInConversation: send failed for invoice', invoiceId, sendError)
}
