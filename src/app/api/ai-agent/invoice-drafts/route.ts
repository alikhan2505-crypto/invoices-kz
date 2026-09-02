import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInvoiceForDraft } from '@/lib/aiAgent/invoiceSend'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Same auth shape as the sibling review route: requireUser + admin gate
// (AI-агент is admin-only for now), drafts scoped to the caller's own
// agents on every read/write.
async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

async function userAgentIds(userId: string): Promise<string[]> {
  const { data: agents } = await supabase.from('ai_agents').select('id').eq('user_id', userId)
  return (agents || []).map(a => a.id)
}

// GET: ?id={draftId} -> that one draft (used by /create?agentDraft
// prefill); no id -> all pending_approval + error drafts across the
// user's agents, newest first, with conversation channel/handle meta.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const agentIds = await userAgentIds(user.id)
  if (agentIds.length === 0) return NextResponse.json({ drafts: [] })

  const id = req.nextUrl.searchParams.get('id')
  let query = supabase
    .from('ai_agent_invoice_drafts')
    .select('id, agent_id, conversation_id, customer_name, customer_phone, items, total, source, status, error_message, created_at')
    .in('agent_id', agentIds)
  // 'sending' rows appear too (rendered as a disabled "Отправляется…"
  // card): a hard crash mid-send must not make a claimed draft invisible.
  query = id ? query.eq('id', id) : query.in('status', ['pending_approval', 'error', 'sending']).order('created_at', { ascending: false })

  const { data: drafts, error } = await query
  if (error) {
    console.error('ai-agent invoice-drafts GET failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить черновики' }, { status: 502 })
  }

  const convIds = Array.from(new Set((drafts || []).map(d => d.conversation_id)))
  const conversationMeta: Record<string, { handle: string; channel: string }> = {}
  if (convIds.length > 0) {
    const { data: conversations } = await supabase
      .from('ai_agent_conversations')
      .select('id, customer_handle, channel')
      .in('id', convIds)
    for (const c of conversations || []) conversationMeta[c.id] = { handle: c.customer_handle || 'клиент', channel: c.channel || 'instagram' }
  }

  return NextResponse.json({
    drafts: (drafts || []).map(d => ({
      ...d,
      customerHandle: conversationMeta[d.conversation_id]?.handle || 'клиент',
      channel: conversationMeta[d.conversation_id]?.channel || 'instagram',
    })),
  })
}

// POST { draftId, action: 'approve' | 'reject' }. approve also serves as
// retry for status='error' drafts -- sendInvoiceForDraft's idempotency
// guard (invoice_id already set -> re-send only) makes that safe.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const draftId = typeof body?.draftId === 'string' ? body.draftId : null
  const action = body?.action
  if (!draftId || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'draftId и action обязательны' }, { status: 400 })
  }

  const agentIds = await userAgentIds(user.id)
  const { data: draft } = await supabase
    .from('ai_agent_invoice_drafts')
    .select('id, agent_id, status')
    .eq('id', draftId)
    .single()
  if (!draft || !agentIds.includes(draft.agent_id)) {
    return NextResponse.json({ error: 'Черновик не найден' }, { status: 404 })
  }
  if (draft.status !== 'pending_approval' && draft.status !== 'error') {
    return NextResponse.json({ error: 'Черновик уже обработан' }, { status: 409 })
  }

  if (action === 'reject') {
    const { error } = await supabase.from('ai_agent_invoice_drafts')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', draftId)
      .in('status', ['pending_approval', 'error'])
    if (error) return NextResponse.json({ error: 'Не удалось отклонить' }, { status: 502 })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  const result = await sendInvoiceForDraft(supabase, draftId)
  if (!result.ok) {
    // 'already claimed' = a concurrent approve won the atomic claim --
    // not a failure of THIS draft, just a duplicate click.
    const status = result.error === 'draft already claimed' ? 409 : 502
    return NextResponse.json({ error: status === 409 ? 'Черновик уже обрабатывается' : (result.error || 'Не удалось отправить счёт') }, { status })
  }
  return NextResponse.json({ ok: true, status: 'approved_sent' })
}
