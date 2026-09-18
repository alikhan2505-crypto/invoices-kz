import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'
import { sendIntoConversation } from '@/lib/aiAgent/channelSend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  const { data: booking } = await supabase.from('salon_bookings').select('id, site_id, conversation_id').eq('id', id).maybeSingle()
  if (!booking || booking.site_id !== session.siteId) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })
  if (!booking.conversation_id) return NextResponse.json({ error: 'У этой записи нет переписки с клиентом' }, { status: 400 })

  const { data: conversation } = await supabase
    .from('ai_agent_conversations')
    .select('id, agent_id, channel, external_thread_id, paused_for_human')
    .eq('id', booking.conversation_id)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Переписка не найдена' }, { status: 404 })

  if (!conversation.paused_for_human) {
    await supabase.from('ai_agent_conversations').update({ paused_for_human: true }).eq('id', conversation.id)
  }

  const sendError = await sendIntoConversation(supabase, conversation, text)
  if (sendError) return NextResponse.json({ error: sendError }, { status: 502 })
  return NextResponse.json({ ok: true })
}
