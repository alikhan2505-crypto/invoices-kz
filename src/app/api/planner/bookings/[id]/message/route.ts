import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'
import { sendIntoConversation } from '@/lib/aiAgent/channelSend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Shared by GET and POST below: resolves the booking's own conversation,
// scoped to this planner session's site_id (never the client). A booking
// with no conversation_id (a manual entry) is a 400, not a 404 -- the
// booking itself is real, it just has no chat behind it, which is a
// different, client-facing-distinguishable case than "doesn't exist".
async function resolveBookingConversation(id: string, siteId: string) {
  const { data: booking } = await supabase.from('salon_bookings').select('id, site_id, conversation_id').eq('id', id).maybeSingle()
  if (!booking || booking.site_id !== siteId) return { error: 'Запись не найдена', status: 404 } as const
  if (!booking.conversation_id) return { error: 'У этой записи нет переписки с клиентом', status: 400 } as const

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id, paused_for_human')
    .eq('id', booking.conversation_id)
    .maybeSingle()
  if (!conversation) return { error: 'Переписка не найдена', status: 404 } as const
  return { conversation }
}

// GET: the full message history for this booking's conversation, so the
// owner sees what was already said before replying -- founder's own ask
// right after the message modal shipped. Same shape as the admin
// ai-agent/dialogs/messages route, scoped by site_id instead of agent
// ownership.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })
  const { id } = await params

  const resolved = await resolveBookingConversation(id, session.siteId)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { data: messages, error } = await supabase
    .from('ai_agent_messages')
    .select('id, direction, text, is_ai_generated, created_at')
    .eq('conversation_id', resolved.conversation.id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    console.error('planner booking message GET failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить переписку' }, { status: 502 })
  }

  return NextResponse.json({
    messages: (messages || []).map(m => ({
      id: m.id, direction: m.direction, text: m.text, isAiGenerated: m.is_ai_generated, createdAt: m.created_at,
    })),
  })
}

// Thin wrapper over sendIntoConversation, same "sending IS the takeover"
// contract as the admin ai-agent/dialogs/reply route -- pauses the AI on
// this conversation so it doesn't talk over the owner's own message.
// Planner-cookie auth instead of Bearer; reached through the booking's
// own conversation_id rather than the conversation id directly, since the
// planner UI only ever knows about bookings.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })
  const { id } = await params

  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text обязателен' }, { status: 400 })

  const resolved = await resolveBookingConversation(id, session.siteId)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const { conversation } = resolved

  if (!conversation.paused_for_human) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversation.id)
  }

  const sendError = await sendIntoConversation(supabase, conversation, text)
  if (sendError) return NextResponse.json({ error: sendError }, { status: 502 })
  return NextResponse.json({ ok: true })
}
