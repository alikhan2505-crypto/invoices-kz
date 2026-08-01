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

const DAY_MS = 24 * 60 * 60 * 1000

// Everything /profile/kaspi-pay's dashboard needs in one round trip: the
// connection's own details, rollup stats, and a recent-activity list. Stats
// are computed in JS off a bounded recent-rows fetch (Supabase's REST client
// has no server-side sum()) rather than a dedicated Postgres view/RPC — this
// connection is one customer's own traffic, not a cross-tenant report, so a
// 500-row window is far more than any real usage needs for v1.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conn } = await supabase
    .from('kaspi_connections')
    .select('status, phone_number, created_at, default_webhook_url, last_used_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conn) return NextResponse.json({ connected: false })

  const { data: rows } = await supabase
    .from('kaspi_payment_requests')
    .select('order_id, invoice_id, amount, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500)

  const all = rows || []
  const now = Date.now()
  const since24h = now - DAY_MS
  const since30d = now - 30 * DAY_MS

  function rollup(cutoffMs: number | null) {
    const set = cutoffMs ? all.filter(r => new Date(r.created_at).getTime() >= cutoffMs) : all
    const paid = set.filter(r => r.status === 'paid')
    return { count: paid.length, amount: paid.reduce((sum, r) => sum + Number(r.amount), 0) }
  }

  return NextResponse.json({
    connected: true,
    status: conn.status,
    phoneNumber: conn.phone_number,
    connectedSince: conn.created_at,
    defaultWebhookUrl: conn.default_webhook_url,
    lastUsedAt: conn.last_used_at,
    stats: {
      last24h: rollup(since24h),
      last30d: rollup(since30d),
      allTime: rollup(null),
    },
    recentPayments: all.slice(0, 20).map(r => ({
      orderId: r.order_id,
      amount: Number(r.amount),
      status: r.status,
      createdAt: r.created_at,
      source: r.invoice_id ? 'invoice' : 'api',
    })),
  })
}
