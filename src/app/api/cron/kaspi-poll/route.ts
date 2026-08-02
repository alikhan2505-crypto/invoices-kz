import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KaspiConnectionSecretsError } from '@/lib/kaspiPay/connection'
import { KaspiAuthError } from '@/lib/kaspiPay/client'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'
import { checkAndSettlePlanPayment } from '@/lib/kaspiPay/settlePlanPayment'
import { checkAndSettleWalletTopup } from '@/lib/kaspiPay/wallet'
import { syncKaspiHistory } from '@/lib/kaspiPay/historySync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// This cron is no longer the primary confirmation path -- the payer's own
// page (/view/[token]) and the public pay-status API check live while
// someone is actually watching, which is both faster and works within
// Vercel Hobby's once-a-day cron limit. This run is now the safety net for
// what nothing else ever polls: an external API customer who never checks
// their own operation_id, a payer who closes the tab right after paying,
// and general expiry/reconciliation.
//
// Phase 2's per-connection history sync added a real Kaspi HTTP round trip
// (plus several Supabase writes) per active connection to this same run --
// extended past Vercel's short serverless default so a growing connection
// count doesn't start silently truncating the loop before it reaches every
// customer (each connection's own sync is independently idempotent, so a
// truncated run is still safe to simply retry next time, just slower to
// reach connections late in the list).
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Systemic, not per-connection: without the key NOTHING can be decrypted,
  // and letting the loop run would raise a decrypt failure on every single
  // row. Aborting the whole run instead is the same call the BCC cron makes
  // when its app-level token endpoint is down — one bad deploy must not park
  // every customer's connection at status='error'.
  if (!process.env.KASPI_SESSION_ENCRYPTION_KEY) {
    console.error('Kaspi poll: KASPI_SESSION_ENCRYPTION_KEY is not configured, aborting run')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const { data: requests, error: requestsError } = await supabase
    .from('kaspi_payment_requests')
    .select('*')
    .eq('status', 'pending')

  // Still the only confirmation path for a payment nothing ever polls live —
  // a persistent failure here (bad service-role key, RLS misconfig, Supabase
  // outage) must not silently report {ok:true, paid:0} forever with no
  // signal anywhere.
  if (requestsError) {
    console.error('Kaspi poll: failed to fetch pending requests:', requestsError.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }

  let paid = 0
  let expired = 0
  let statusChecksOk = 0
  const secretsErrorUserIds = new Set<string>()

  for (const reqRow of (requests || []) as any[]) {
    try {
      const outcome = await checkAndSettleKaspiPayment(reqRow)
      if (outcome === 'no_connection') continue
      statusChecksOk++
      if (outcome === 'paid') paid++
      else if (outcome === 'expired') expired++
    } catch (e: any) {
      // Terminal vs transient, same split as the BCC cron. Terminal means the
      // connection itself is dead and no retry can revive it: Kaspi refused
      // its credentials (device unpaired / Cashier role revoked), or its
      // stored secrets no longer decrypt. EVERYTHING else — network errors,
      // timeouts, Kaspi 5xx, a Supabase hiccup — leaves the connection
      // 'active' so the next run simply retries it.
      if (e instanceof KaspiAuthError) {
        console.error('Kaspi poll: connection dead for user', reqRow.user_id, '— parking at status=error:', e.message)
        await supabase.from('kaspi_connections')
          .update({ status: 'error' })
          .eq('user_id', reqRow.user_id)
          .eq('status', 'active')
      } else if (e instanceof KaspiConnectionSecretsError) {
        // Decided after the loop, not here: a decrypt failure is only
        // evidence the connection's OWN row is corrupt if other rows this
        // run decrypted fine. If every row fails to decrypt, the far more
        // likely cause is a bad KASPI_SESSION_ENCRYPTION_KEY deploy — and
        // parking every customer at status=error for that would be exactly
        // the mass-lockout this split was meant to prevent.
        secretsErrorUserIds.add(reqRow.user_id)
      } else {
        console.error('Kaspi poll: transient error for request', reqRow.id, '— retrying next run:', e.message)
      }
    }
  }

  if (secretsErrorUserIds.size > 0) {
    const looksSystemic = statusChecksOk === 0 && secretsErrorUserIds.size >= 2
    if (looksSystemic) {
      console.error(
        'Kaspi poll:', secretsErrorUserIds.size, 'connections failed to decrypt and zero succeeded this run —',
        'this looks like a bad KASPI_SESSION_ENCRYPTION_KEY rather than per-row corruption.',
        'Leaving all of them active for retry instead of parking every customer at status=error.'
      )
    } else {
      for (const userId of secretsErrorUserIds) {
        console.error('Kaspi poll: connection dead for user', userId, '— parking at status=error: secrets no longer decrypt')
        await supabase.from('kaspi_connections')
          .update({ status: 'error' })
          .eq('user_id', userId)
          .eq('status', 'active')
      }
    }
  }

  const { data: pendingPlans } = await supabase
    .from('payment_requests')
    .select('id, user_id, plan, amount, qr_operation_id, created_at')
    .eq('status', 'pending')
  let plansPaid = 0
  let plansExpired = 0
  for (const row of (pendingPlans || []) as any[]) {
    try {
      const outcome = await checkAndSettlePlanPayment(row)
      if (outcome === 'paid') plansPaid++
      else if (outcome === 'expired') plansExpired++
    } catch (e: any) {
      console.error('Kaspi poll: plan payment check failed for', row.id, '— retrying next run:', e.message)
    }
  }

  const { data: pendingTopups } = await supabase
    .from('kaspi_wallet_topups')
    .select('id, user_id, amount, kaspi_operation_id, status, expires_at')
    .eq('status', 'pending')
  let topupsPaid = 0
  let topupsExpired = 0
  for (const row of (pendingTopups || []) as any[]) {
    try {
      const outcome = await checkAndSettleWalletTopup(row)
      if (outcome === 'paid') topupsPaid++
      else if (outcome === 'expired') topupsExpired++
    } catch (e: any) {
      console.error('Kaspi poll: wallet topup check failed for', row.id, '— retrying next run:', e.message)
    }
  }

  const { data: activeConnections } = await supabase
    .from('kaspi_connections')
    .select('user_id')
    .eq('status', 'active')
  let historySynced = 0
  let historyAutoConfirmed = 0
  for (const { user_id } of (activeConnections || []) as any[]) {
    try {
      const result = await syncKaspiHistory(user_id)
      historySynced += result.synced
      historyAutoConfirmed += result.autoConfirmed
    } catch (e: any) {
      console.error('Kaspi poll: history sync failed for user', user_id, '— retrying next run:', e.message)
    }
  }

  return NextResponse.json({ ok: true, paid, expired, plansPaid, plansExpired, topupsPaid, topupsExpired, historySynced, historyAutoConfirmed })
}
