import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncKaspiHistory } from '@/lib/kaspiPay/historySync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// The daily cron (src/app/api/cron/kaspi-poll) is the only OTHER caller of
// syncKaspiHistory, and on Vercel Hobby it runs at most once a day -- far
// too slow for a customer who just connected or made a Kaspi sale and wants
// to see it reflected right away. This lets them pull it on demand instead
// of waiting. A 30s minimum interval (not a request-count window like the
// wallet-topup route's) is enough to stop a double-click or a runaway retry
// loop from hammering this customer's own Kaspi connection with repeated
// live history calls, without needing a request-count table.
const MIN_SYNC_INTERVAL_MS = 30_000

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('kaspi_connections')
    .select('status, last_manual_sync_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!connection || connection.status !== 'active') {
    return NextResponse.json({ error: 'not_connected' }, { status: 400 })
  }
  if (connection.last_manual_sync_at && Date.now() - new Date(connection.last_manual_sync_at).getTime() < MIN_SYNC_INTERVAL_MS) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  await supabase.from('kaspi_connections').update({ last_manual_sync_at: new Date().toISOString() }).eq('user_id', user.id)

  try {
    const result = await syncKaspiHistory(user.id)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('Kaspi manual sync failed for user', user.id, ':', e.message)
    return NextResponse.json({ error: 'sync_failed' }, { status: 502 })
  }
}
