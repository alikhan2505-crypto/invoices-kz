import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'
import { resolveKzDateTime } from '@/lib/aiAgent/bookingDrafts'
import { loadAgentSalonInfo } from '@/lib/aiAgent/salonContext'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Same 14-day horizon as buildSalonBlock's own lookup table
// (salonContext.ts) -- one consistent "how far ahead this feature looks"
// window across the whole booking planner.
const AGENDA_WINDOW_DAYS = 14

// GET: agenda from the start of today (Almaty time, fixed +05:00 -- same
// convention as the rest of this feature) through the window. Every
// status included, cancelled rows too -- the client greys them out rather
// than this route silently hiding history the owner might want to see.
export async function GET(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const almatyNow = new Date(Date.now() + 5 * 60 * 60 * 1000)
  almatyNow.setUTCHours(0, 0, 0, 0)
  const from = new Date(almatyNow.getTime() - 5 * 60 * 60 * 1000)
  const to = new Date(from.getTime() + AGENDA_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const { data: bookings, error } = await supabase
    .from('salon_bookings')
    .select('id, master_name, service_name, client_name, client_phone, starts_at, duration_minutes, status, conversation_id, source')
    .eq('site_id', session.siteId)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at', { ascending: true })
  if (error) {
    console.error('planner bookings GET failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить расписание' }, { status: 502 })
  }

  // The salon's own configured master roster -- so the agenda's grid can
  // show a column for every real member of staff, not just whoever
  // happens to already have a booking that day (the whole point of a
  // resource-style grid is seeing who's free, per founder's own framing).
  // Best-effort: loadAgentSalonInfo never throws, an empty list just
  // collapses the grid to whatever master_names the bookings carry.
  const salonInfo = await loadAgentSalonInfo(supabase, session.siteId)

  return NextResponse.json({ bookings: bookings || [], masters: salonInfo?.masters || [] })
}

// POST: manual booking entry (source: 'manual') -- the form the founder
// asked to have from v1, not deferred. No conversation_id (there is no
// chat behind a manual entry), so "написать клиенту" stays disabled for
// it client-side. Deliberately no past-time rejection: see
// resolveKzDateTime's own comment -- an owner logging a walk-in or a
// same-day visit after the fact is legitimate, unlike an AI-proposed slot
// for someone who isn't there.
export async function POST(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const body = await req.json().catch(() => null)
  const serviceName = typeof body?.serviceName === 'string' ? body.serviceName.trim().slice(0, 200) : ''
  const masterName = typeof body?.masterName === 'string' && body.masterName.trim() ? body.masterName.trim().slice(0, 100) : null
  const clientName = typeof body?.clientName === 'string' && body.clientName.trim() ? body.clientName.trim().slice(0, 200) : null
  const clientPhone = typeof body?.clientPhone === 'string' && body.clientPhone.trim() ? body.clientPhone.trim().slice(0, 40) : null
  const date = typeof body?.date === 'string' ? body.date.trim() : ''
  const time = typeof body?.time === 'string' ? body.time.trim() : ''
  const durationMinutes = Number.isInteger(body?.durationMinutes) && body.durationMinutes > 0 ? body.durationMinutes : null

  if (!serviceName) return NextResponse.json({ error: 'Укажите услугу' }, { status: 400 })
  const startsAt = resolveKzDateTime(date, time)
  if (!startsAt) return NextResponse.json({ error: 'Некорректные дата или время' }, { status: 400 })

  const { data: booking, error } = await supabase.from('salon_bookings').insert({
    site_id: session.siteId,
    master_name: masterName,
    service_name: serviceName,
    client_name: clientName,
    client_phone: clientPhone,
    starts_at: startsAt,
    duration_minutes: durationMinutes,
    source: 'manual',
  }).select('id').single()
  if (error || !booking) {
    console.error('planner bookings POST failed:', error?.message)
    return NextResponse.json({ error: 'Не удалось создать запись' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: booking.id })
}
