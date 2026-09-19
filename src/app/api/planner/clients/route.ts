import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Visit count (cancelled bookings don't count -- a cancellation means they
// didn't actually show up that time) from which a client reads as
// "Постоянный" (regular/loyal) -- founder's own ask 19.09.2026: assess
// return rate/loyalty from real visit history. A plain, adjustable
// threshold, not a manually-set flag -- it's meant to reflect behavior,
// not an opinion the owner has to remember to update.
const REGULAR_VISIT_THRESHOLD = 3

// GET: every client this salon has ever booked, grouped by phone (the one
// reasonably stable identifier -- names get mistyped/vary, phone numbers
// don't). Deliberately NOT scoped to the same -90/+60 day window
// /api/planner/bookings uses for the calendar -- a loyalty read needs the
// client's whole history, not just a recent slice, or a client who's been
// coming for a year would undercount as new.
export async function GET(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const { data: bookings, error } = await supabase
    .from('salon_bookings')
    .select('id, client_name, client_phone, service_name, master_name, starts_at, status')
    .eq('site_id', session.siteId)
    .not('client_phone', 'is', null)
    .order('starts_at', { ascending: false })
  if (error) {
    console.error('planner clients GET failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить клиентов' }, { status: 502 })
  }

  const byPhone = new Map<string, typeof bookings>()
  for (const b of bookings || []) {
    if (!b.client_phone) continue
    if (!byPhone.has(b.client_phone)) byPhone.set(b.client_phone, [])
    byPhone.get(b.client_phone)!.push(b)
  }

  // Rows already sorted starts_at desc, so list[0] is each client's most
  // recent booking -- used for their display name (a client's name can
  // drift in spelling between visits; the latest one is the best guess).
  const clients = Array.from(byPhone.entries()).map(([phone, list]) => {
    const visits = list.filter((b) => b.status !== 'cancelled')
    return {
      phone,
      name: list[0]?.client_name || null,
      visitCount: visits.length,
      lastVisitAt: visits[0]?.starts_at || null,
      isRegular: visits.length >= REGULAR_VISIT_THRESHOLD,
      history: list.map((b) => ({
        id: b.id,
        serviceName: b.service_name,
        masterName: b.master_name,
        startsAt: b.starts_at,
        status: b.status,
      })),
    }
  }).sort((a, b) => (b.lastVisitAt || '').localeCompare(a.lastVisitAt || ''))

  return NextResponse.json({ clients })
}
