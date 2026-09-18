import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'
import { confirmBookingDraft } from '@/lib/aiAgent/bookingSend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: pending/error booking drafts for this planner's own salon (site_id
// comes from the signed cookie, never the client) -- same shape as the
// admin ai-agent/invoice-drafts route, scoped by site instead of by the
// caller's own agent ids since a planner login has no user_id at all.
export async function GET(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const { data: drafts, error } = await supabase
    .from('ai_agent_booking_drafts')
    .select('id, service_name, master_name, starts_at, duration_minutes, customer_name, customer_phone, notes, status, error_message, conversation_id, created_at')
    .eq('site_id', session.siteId)
    .in('status', ['pending_approval', 'error'])
    .order('created_at', { ascending: false })
  if (error) {
    console.error('planner booking-drafts GET failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить черновики' }, { status: 502 })
  }

  // Channel per draft (so the card can show "написали в WhatsApp" etc) --
  // a second small query rather than a join, same style as the invoice
  // drafts route.
  const convIds = Array.from(new Set((drafts || []).map(d => d.conversation_id)))
  const channelByConv: Record<string, string> = {}
  if (convIds.length > 0) {
    const { data: conversations } = await supabase.from('ai_agent_conversations').select('id, channel').in('id', convIds)
    for (const c of conversations || []) channelByConv[c.id] = c.channel
  }

  return NextResponse.json({
    drafts: (drafts || []).map(d => ({ ...d, channel: channelByConv[d.conversation_id] || null })),
  })
}

// POST { draftId, action: 'approve' | 'reject' } -- mirrors
// ai-agent/invoice-drafts/route.ts exactly, scoped by site_id instead of
// agent ownership. approve also serves as retry for status='error' drafts,
// same idempotency guarantee as confirmBookingDraft's atomic claim.
export async function POST(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const body = await req.json().catch(() => null)
  const draftId = typeof body?.draftId === 'string' ? body.draftId : null
  const action = body?.action
  if (!draftId || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'draftId и action обязательны' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('ai_agent_booking_drafts')
    .select('id, site_id, status')
    .eq('id', draftId)
    .single()
  if (!draft || draft.site_id !== session.siteId) {
    return NextResponse.json({ error: 'Черновик не найден' }, { status: 404 })
  }
  if (draft.status !== 'pending_approval' && draft.status !== 'error') {
    return NextResponse.json({ error: 'Черновик уже обработан' }, { status: 409 })
  }

  if (action === 'reject') {
    const { error } = await supabase.from('ai_agent_booking_drafts')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', draftId)
      .in('status', ['pending_approval', 'error'])
    if (error) return NextResponse.json({ error: 'Не удалось отклонить' }, { status: 502 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  const result = await confirmBookingDraft(supabase, draftId)
  if (!result.ok) {
    // 'draft already claimed' = a concurrent approve won the atomic claim
    // -- not a failure of this draft, just a duplicate click.
    const status = result.error === 'draft already claimed' ? 409 : 502
    return NextResponse.json({ error: status === 409 ? 'Черновик уже обрабатывается' : (result.error || 'Не удалось подтвердить запись') }, { status })
  }
  return NextResponse.json({ ok: true, status: 'confirmed' })
}
