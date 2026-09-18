import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'
import { resolveKzDateTime } from '@/lib/aiAgent/bookingDrafts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH { date, time } to reschedule -- updates starts_at on this SAME
// row/id, never cancel+recreate, so the linked conversation/message
// history stays attached (smooth-wishing-pumpkin.md's own stated
// reasoning). PATCH { status: 'cancelled' } to cancel. One action per
// call, matching the two the plan actually asks for.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })
  const { id } = await params

  const { data: booking } = await supabase.from('salon_bookings').select('id, site_id').eq('id', id).maybeSingle()
  if (!booking || booking.site_id !== session.siteId) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body?.status === 'cancelled') {
    update.status = 'cancelled'
  } else if (typeof body?.date === 'string' && typeof body?.time === 'string') {
    const startsAt = resolveKzDateTime(body.date, body.time)
    if (!startsAt) return NextResponse.json({ error: 'Некорректные дата или время' }, { status: 400 })
    update.starts_at = startsAt
  } else {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const { error } = await supabase.from('salon_bookings').update(update).eq('id', id)
  if (error) {
    console.error('planner bookings PATCH failed:', error.message)
    return NextResponse.json({ error: 'Не удалось обновить запись' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
