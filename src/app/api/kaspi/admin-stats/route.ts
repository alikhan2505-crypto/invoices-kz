import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// Platform-wide Kaspi Pay Cashier stats for /admin. kaspi_connections and
// kaspi_payment_requests have no client-facing RLS policy (service-role
// only, by design -- see the Kaspi Pay Cashier feature's final review), so
// this can't be a direct client query like most of /admin's other data --
// it has to go through a service-role route.
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count: activeConnections } = await supabase
    .from('kaspi_connections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  const { data: rows } = await supabase
    .from('kaspi_payment_requests')
    .select('amount, status')

  const all = rows || []
  const paid = all.filter(r => r.status === 'paid')
  const expired = all.filter(r => r.status === 'expired')
  const resolved = paid.length + expired.length

  return NextResponse.json({
    activeConnections: activeConnections || 0,
    totalRequests: all.length,
    paidCount: paid.length,
    paidAmount: paid.reduce((sum, r) => sum + Number(r.amount), 0),
    conversionRate: resolved > 0 ? paid.length / resolved : null,
  })
}
