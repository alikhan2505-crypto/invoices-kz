import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import dns from 'dns/promises'
import { loadConnectionByUserId } from '@/lib/kaspiPay/connection'
import { checkStatus } from '@/lib/kaspiPay/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function signWebhookPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

// Task 7's review flagged callback_url as a caller-controlled-webhook SSRF
// vector: any customer's own API-token request can set it to an arbitrary
// URL, and this cron is what actually fires the request from invoices.kz's
// own infrastructure. Require https, and resolve the hostname to reject
// loopback/private/link-local targets (a literal IP or a hostname that
// resolves to one) before ever calling fetch() on it.
function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return false
  const [a, b] = parts
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0
}

async function isSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.hostname === 'localhost') return false
  try {
    const { address } = await dns.lookup(url.hostname)
    return !isPrivateIp(address)
  } catch {
    return false // unresolvable hostname — fail closed
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: requests } = await supabase
    .from('kaspi_payment_requests')
    .select('*')
    .eq('status', 'pending')

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
          await fetch(reqRow.callback_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Kaspi-Pay-Signature': signWebhookPayload(payload, secret),
            },
            body: payload,
          }).catch((e) => console.error('Kaspi webhook delivery failed for', reqRow.id, e.message))
        }
      }
    } catch (e: any) {
      console.error('Kaspi poll error for request', reqRow.id, e.message)
    }
  }

  return NextResponse.json({ ok: true, paid })
}
