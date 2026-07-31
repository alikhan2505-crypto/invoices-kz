import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { loadConnectionByUserId } from '@/lib/kaspiPay/connection'
import { checkStatus } from '@/lib/kaspiPay/client'
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

  for (const reqRow of (requests || []) as any[]) {
    try {
      if (reqRow.expires_at && new Date(reqRow.expires_at) <= new Date()) {
        await supabase.from('kaspi_payment_requests').update({ status: 'expired' }).eq('id', reqRow.id)
        continue
      }

      const connection = await loadConnectionByUserId(reqRow.user_id)
      if (!connection) continue // connection was disconnected after the request was created

      const result = await checkStatus(connection, reqRow.kaspi_operation_id)
      if (result.status !== 'paid') continue

      await supabase.from('kaspi_payment_requests').update({ status: 'paid' }).eq('id', reqRow.id)
      paid++

      if (reqRow.invoice_id) {
        await supabase.from('invoices').update({ status: 'paid' }).eq('id', reqRow.invoice_id)
        await supabase.from('invoice_logs').insert({ invoice_id: reqRow.invoice_id, status: 'paid' })
      }

      if (reqRow.callback_url) {
        if (!(await isSafeWebhookUrl(reqRow.callback_url))) {
          console.error('Kaspi webhook skipped for', reqRow.id, '— unsafe callback_url:', reqRow.callback_url)
        } else {
          const secret = process.env.KASPI_SESSION_ENCRYPTION_KEY! // reuse: no separate per-customer webhook secret in v1
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
      console.error('Kaspi poll error for request', reqRow.id, e.message)
    }
  }

  return NextResponse.json({ ok: true, paid })
}
