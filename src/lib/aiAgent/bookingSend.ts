import type { SupabaseClient } from '@supabase/supabase-js'
import { sendIntoConversation } from './channelSend'
import { validateBookingInput, normalizeBookingToolInput, resolveAgainstList, type BookingToolInput } from './bookingDrafts'
import { createNotification } from '@/lib/notifications'
import { sendTelegramNotification } from '@/lib/telegramNotify'

// The create_booking_draft executor a salon-linked agent passes to
// generateAiReply's bookingTool param -- one shared implementation,
// mirroring buildInvoiceToolExecutor's shape (invoiceSend.ts).
//
// Deliberate, permanent divergence from the invoice pattern: there is NO
// autonomy/auto-send path here at all. Every draft always lands
// pending_approval, per the founder's explicit choice for the planner
// (see smooth-wishing-pumpkin.md) -- an AI-proposed booking must never
// block a real calendar slot until a human confirms it, no matter how
// many prior drafts the owner has approved.
export function buildBookingToolExecutor(
  supabase: SupabaseClient,
  agent: { id: string },
  conversationId: string,
  salonInfo: { siteId: string; services: string[]; masters: string[] },
) {
  return {
    execute: async (raw: BookingToolInput) => {
      const validated = validateBookingInput(raw)
      if (!validated.ok) return { outcome: 'draft_pending' as const, error: validated.error }

      const { data: conv } = await supabase
        .from('ai_agent_conversations')
        .select('collected_name, collected_phone')
        .eq('id', conversationId)
        .single()
      const norm = normalizeBookingToolInput(raw, { name: conv?.collected_name, phone: conv?.collected_phone })
      const missing: ('customer_name' | 'customer_phone')[] = []
      if (!norm.customerName) missing.push('customer_name')
      if (!norm.customerPhone) missing.push('customer_phone')
      if (missing.length > 0) return { outcome: 'draft_pending' as const, missing }

      const serviceName = resolveAgainstList(validated.serviceName, salonInfo.services)
      const masterName = validated.masterName ? resolveAgainstList(validated.masterName, salonInfo.masters) : undefined

      const draftId = await createBookingDraft(supabase, {
        agentId: agent.id,
        conversationId,
        siteId: salonInfo.siteId,
        serviceName,
        masterName,
        startsAt: validated.startsAt,
        customerName: norm.customerName,
        customerPhone: norm.customerPhone,
        notes: norm.notes,
      })
      return { outcome: 'draft_pending' as const, draftId }
    },
  }
}

export async function createBookingDraft(supabase: SupabaseClient, args: {
  agentId: string
  conversationId: string
  siteId: string
  serviceName: string
  masterName?: string
  startsAt: string
  customerName: string
  customerPhone: string
  notes?: string
}): Promise<string> {
  const { data: draft, error } = await supabase.from('ai_agent_booking_drafts').insert({
    agent_id: args.agentId,
    conversation_id: args.conversationId,
    site_id: args.siteId,
    service_name: args.serviceName,
    master_name: args.masterName || null,
    starts_at: args.startsAt,
    customer_name: args.customerName,
    customer_phone: args.customerPhone,
    notes: args.notes || null,
    status: 'pending_approval',
  }).select('id').single()
  if (error || !draft) throw new Error(`booking draft insert failed: ${error?.message}`)

  // Best-effort owner nudge on both channels a planner-only owner might
  // actually see: the in-app bell (createNotification, same precedent as
  // the invoice draft) AND a direct Telegram push -- an owner reached only
  // through the planner's Telegram-QR login (plannerAuth.ts) has no
  // ordinary logged-in dashboard session to notice the bell in at all.
  try {
    const { data: site } = await supabase
      .from('salon_sites')
      .select('slug, owner_profile_id, salon')
      .eq('id', args.siteId)
      .maybeSingle()
    const salonName = site?.salon && typeof site.salon === 'object' && !Array.isArray(site.salon)
      ? (site.salon as Record<string, unknown>).name
      : undefined

    const { data: agent } = await supabase.from('ai_agents').select('user_id').eq('id', args.agentId).single()
    if (agent) {
      await createNotification(
        agent.user_id,
        'Новая запись ждёт подтверждения',
        `${args.customerName || 'Клиент'} — ${args.serviceName}`,
        site?.slug ? `/planner/${site.slug}` : '/ai-agent/review',
      )
    }

    if (site?.owner_profile_id) {
      const { data: owner } = await supabase
        .from('profiles')
        .select('telegram_chat_id, notify_telegram')
        .eq('id', site.owner_profile_id)
        .maybeSingle()
      if (owner?.notify_telegram && owner.telegram_chat_id && site.slug) {
        const label = typeof salonName === 'string' && salonName ? ` — ${salonName}` : ''
        await sendTelegramNotification(
          owner.telegram_chat_id,
          `Новая запись на подтверждении${label}: ${args.customerName || 'клиент'}, ${args.serviceName}. https://invoices.kz/planner/${site.slug}`,
        )
      }
    }
  } catch (err: any) {
    console.error('ai-agent booking draft: owner notification failed:', err?.message || err)
  }

  return draft.id
}

// Turns an approved draft into a real salon_bookings row -- called from
// the planner's approve action (Stage 4), not from here. Mirrors
// sendInvoiceForDraft's atomic-claim shape exactly (invoiceSend.ts):
// only the request that flips the row to 'confirming' does the work,
// idempotent on retry via the persisted booking_id.
export async function confirmBookingDraft(
  supabase: SupabaseClient,
  draftId: string,
): Promise<{ ok: boolean; error?: string; bookingId?: string }> {
  const fail = async (msg: string) => {
    await supabase
      .from('ai_agent_booking_drafts')
      .update({ status: 'error', error_message: msg, decided_at: new Date().toISOString() })
      .eq('id', draftId)
    return { ok: false, error: msg }
  }
  try {
    const { data: claimed } = await supabase
      .from('ai_agent_booking_drafts')
      .update({ status: 'confirming' })
      .eq('id', draftId)
      .in('status', ['pending_approval', 'error'])
      .select('id')
    if (!claimed || claimed.length === 0) return { ok: false, error: 'draft already claimed' }

    const { data: draft } = await supabase.from('ai_agent_booking_drafts').select('*').eq('id', draftId).single()
    if (!draft) return fail('черновик не найден')

    let bookingId: string | null = draft.booking_id
    if (!bookingId) {
      const { data: booking, error: bookingError } = await supabase.from('salon_bookings').insert({
        site_id: draft.site_id,
        master_name: draft.master_name,
        service_name: draft.service_name,
        client_name: draft.customer_name,
        client_phone: draft.customer_phone,
        starts_at: draft.starts_at,
        duration_minutes: draft.duration_minutes,
        conversation_id: draft.conversation_id,
        source: 'ai_draft',
      }).select('id').single()
      if (bookingError || !booking) return fail(`создание брони: ${bookingError?.message}`)
      bookingId = booking.id
      // Persist BEFORE messaging the customer, same reasoning as
      // sendInvoiceForDraft: without booking_id on the draft, a retry
      // after a crash would create a second real booking instead of
      // re-sending the confirmation for this one.
      const { error: persistError } = await supabase
        .from('ai_agent_booking_drafts')
        .update({ booking_id: bookingId })
        .eq('id', draftId)
      if (persistError) return fail(`сохранение ссылки на бронь: ${persistError.message}`)
    }

    const { data: conversation } = await supabase
      .from('ai_agent_conversations')
      .select('id, channel, external_thread_id, agent_id')
      .eq('id', draft.conversation_id)
      .maybeSingle()
    if (conversation) {
      const when = new Date(draft.starts_at).toLocaleString('ru-KZ', { timeZone: 'Asia/Almaty', dateStyle: 'long', timeStyle: 'short' })
      const text = `Вы записаны: ${draft.service_name}${draft.master_name ? ` (${draft.master_name})` : ''}, ${when}. Ждём вас!`
      const sendError = await sendIntoConversation(supabase, conversation, text)
      if (sendError) console.error('confirmBookingDraft: customer notify failed (non-fatal):', sendError)
    }

    const { error: finalError } = await supabase
      .from('ai_agent_booking_drafts')
      .update({ status: 'confirmed', decided_at: new Date().toISOString() })
      .eq('id', draftId)
    if (finalError) {
      // The booking already exists and the customer was already told --
      // returning ok so the review card doesn't invite a retry that
      // would try to re-message the customer over a stale status.
      console.error('confirmBookingDraft: final status update failed:', finalError.message)
    }
    return { ok: true, bookingId: bookingId ?? undefined }
  } catch (err: any) {
    return fail(String(err?.message || err))
  }
}
