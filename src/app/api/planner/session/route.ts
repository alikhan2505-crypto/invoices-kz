import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlannerSession } from '@/lib/plannerAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Проверка "уже залогинен?" при монтировании страницы планировщика.
export async function GET(req: NextRequest) {
  const session = await requirePlannerSession(req)
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status })

  const { data: site } = await supabase
    .from('salon_sites')
    .select('slug, salon')
    .eq('id', session.siteId)
    .maybeSingle()
  if (!site) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const salonName = site.salon && typeof site.salon === 'object' && !Array.isArray(site.salon)
    ? (site.salon as Record<string, unknown>).name
    : undefined

  return NextResponse.json({
    siteSlug: site.slug,
    salonName: typeof salonName === 'string' ? salonName : site.slug,
  })
}
