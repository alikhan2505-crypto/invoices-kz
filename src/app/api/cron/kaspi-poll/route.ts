import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadConnectionByUserId, KaspiConnectionSecretsError } from '@/lib/kaspiPay/connection'
import { checkStatus, KaspiAuthError } from '@/lib/kaspiPay/client'
import { isSafeWebhookUrl } from '@/lib/kaspiPay/webhookSafety'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function signWebhookPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

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

  // This cron is the sole confirmation path for every pending Kaspi
  // payment across all customers — a persistent failure here (bad
  // service-role key, RLS misconfig, Supabase outage) must not silently
  // report {ok:true, paid:0} forever with no signal anywhere.
  if (requestsError) {
    console.error('Kaspi poll: failed to fetch pending requests:', requestsError.message)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }

  let paid = 0
  let expired = 0

  for (const reqRow of (requests || []) as any[]) {
    try {
      const connection = await loadConnectionByUserId(reqRow.user_id)
      if (!connection) continue // connection was disconnected after the request was created

      // Deliberately BEFORE any expiry handling. Expiring first (the previous
      // behaviour) permanently lost every payment that completed during the
      // last poll interval before expires_at: the row went straight to
      // 'expired', the invoice was never marked paid and the customer's
      // webhook never fired, even though the money had actually moved.
      const result = await checkStatus(connection, reqRow.kaspi_operation_id)

      if (result.status !== 'paid') {
        // Only now is expiry safe to write: Kaspi itself has confirmed this
        // operation is not paid. 'failed' rows (cancelled by the payer,
        // insufficient funds, …) are deliberately left pending until their
        // own expires_at passes — some of those Kaspi statuses are reachable
        // while a QR is still usable for another attempt, and we would rather
        // re-poll a dead QR than kill a live one.
        const expiredOnKaspi = result.status === 'expired'
        const pastExpiry = !!reqRow.expires_at && new Date(reqRow.expires_at) <= new Date()
        if (expiredOnKaspi || pastExpiry) {
          const { error: expireError } = await supabase
            .from('kaspi_payment_requests')
            .update({ status: 'expired' })
            .eq('id', reqRow.id)
            .eq('status', 'pending')
          if (expireError) console.error('Kaspi poll: failed to expire request', reqRow.id, expireError.message)
          else expired++
        }
        continue
      }

      // Vercel does not guarantee cron invocations never overlap, and the
      // side effects below (marking the invoice paid, POSTing the customer's
      // webhook) are not idempotent. The status='pending' predicate turns the
      // update into an atomic claim: whichever run flips the row gets the
      // returned id and does the work; a concurrent run matches zero rows and
      // bails out here.
      const { data: claimed, error: claimError } = await supabase
        .from('kaspi_payment_requests')
        .update({ status: 'paid' })
        .eq('id', reqRow.id)
        .eq('status', 'pending')
        .select('id')
      if (claimError) throw new Error(`failed to claim paid request: ${claimError.message}`)
      if (!claimed || claimed.length === 0) continue // already claimed by an overlapping run

      paid++

      if (reqRow.invoice_id) {
        await supabase.from('invoices').update({ status: 'paid' }).eq('id', reqRow.invoice_id)
        await supabase.from('invoice_logs').insert({ invoice_id: reqRow.invoice_id, status: 'paid' })
      }

      if (reqRow.callback_url) {
        // Its own secret, NOT KASPI_SESSION_ENCRYPTION_KEY. That key decrypts
        // every customer's Kaspi identity, and this one is meant to be handed
        // to external customers so they can verify our signature — sharing
        // one value for both would mean giving a single customer the ability
        // to decrypt every other customer's stored private key.
        const secret = process.env.KASPI_WEBHOOK_SECRET
        if (!secret) {
          console.error('Kaspi webhook skipped for', reqRow.id, '— KASPI_WEBHOOK_SECRET is not configured')
        } else if (!(await isSafeWebhookUrl(reqRow.callback_url))) {
          console.error('Kaspi webhook skipped for', reqRow.id, '— unsafe callback_url:', reqRow.callback_url)
        } else {
          const payload = JSON.stringify({
            event: 'payment.success',
            order_id: reqRow.order_id,
            amount: reqRow.amount,
            operation_id: reqRow.kaspi_operation_id,
          })
          // A non-responding customer endpoint must not stall the rest of
          // this run's rows — bounded with a timeout, same as any other
          // outbound call to a third party we don't control.
          await fetch(reqRow.callback_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Kaspi-Pay-Signature': signWebhookPayload(payload, secret),
            },
            body: payload,
            signal: AbortSignal.timeout(5000),
          }).catch((e) => console.error('Kaspi webhook delivery failed for', reqRow.id, e.message))
        }
      }
    } catch (e: any) {
      // Terminal vs transient, same split as the BCC cron. Terminal means the
      // connection itself is dead and no retry can revive it: Kaspi refused
      // its credentials (device unpaired / Cashier role revoked), or its
      // stored secrets no longer decrypt. Those park the connection at
      // status='error', which the Kaspi Pay page surfaces as a reconnect
      // hint. EVERYTHING else — network errors, timeouts, Kaspi 5xx, a
      // Supabase hiccup — leaves the connection 'active' so the next run
      // simply retries it.
      if (e instanceof KaspiAuthError || e instanceof KaspiConnectionSecretsError) {
        console.error('Kaspi poll: connection dead for user', reqRow.user_id, '— parking at status=error:', e.message)
        await supabase.from('kaspi_connections')
          .update({ status: 'error' })
          .eq('user_id', reqRow.user_id)
          .eq('status', 'active')
      } else {
        console.error('Kaspi poll: transient error for request', reqRow.id, '— retrying next run:', e.message)
      }
    }
  }

  return NextResponse.json({ ok: true, paid, expired })
}
