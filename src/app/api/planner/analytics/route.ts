import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'
import { buildAnalyticsSummary } from '@/lib/planner/analytics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Stage 5 of the salon booking planner plan -- weekly booking counts,
// per-master counts, and cancellation rate, over the last 8 weeks. Reads
// ALL bookings for the site (not just the ±window /api/planner/bookings
// uses for the calendar) and lets buildAnalyticsSummary do the windowing,
// so the cutoff logic lives in one tested place.
export async function GET(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const { data: bookings, error } = await supabase
    .from('salon_bookings')
    .select('starts_at, status, master_name')
    .eq('site_id', session.siteId)
  if (error) {
    console.error('planner analytics GET failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить аналитику' }, { status: 502 })
  }

  return NextResponse.json(buildAnalyticsSummary(bookings || []))
}
