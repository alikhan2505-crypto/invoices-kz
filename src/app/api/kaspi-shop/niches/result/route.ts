import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getNicheCheck } from '@/lib/kaspiShop/nicheChecks'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// checkId is an opaque identifier with no owner column -- requiring
// is_admin (not just any authenticated user) prevents any logged-in
// invoices.kz customer from polling another user's niche-check result.
// Matches src/app/api/kaspi/admin-stats/route.ts's requireAdmin pattern.
async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
  return (profile?.is_admin || getActivePlan(profile).canKaspiShop) ? user : null
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const checkId = req.nextUrl.searchParams.get('checkId')
  if (!checkId) return NextResponse.json({ error: 'checkId обязателен' }, { status: 400 })

  const check = await getNicheCheck(checkId)
  if (!check) return NextResponse.json({ error: 'Проверка не найдена' }, { status: 404 })

  return NextResponse.json(check)
}
