import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { findMatches, OpenInvoice } from '@/lib/acquiringMatch'
import { mapBccTransactions } from '@/lib/bccStatement'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE, BCC_BUSINESS_ACCOUNT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

async function refreshAccessToken(appToken: string, refreshToken: string) {
  const res = await fetch(`${BCC_AUTH_CLIENT_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appToken}`,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_secret: process.env.BCC_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string, refresh_token: string, expires_in: number }>
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: connections } = await supabase
    .from('bcc_connections')
    .select('*')
    .eq('status', 'active')

  // Minted once for the whole run, not per-connection: if BCC's app-level
  // token endpoint itself is down, that's a systemic failure that should
  // abort the run and retry tomorrow with every connection left 'active' —
  // not something that should flip every single user's connection to
  // 'error' just because the app-wide token call failed once.
  let appToken: string
  try {
    appToken = await getBccAppToken()
  } catch (e: any) {
    console.error('BCC cron: app token error, aborting run:', e.message)
    return NextResponse.json({ error: 'bcc_unavailable' }, { status: 502 })
  }

  let checked = 0
  let notified = 0

  for (const conn of (connections || []) as any[]) {
    try {
      let clientToken = conn.access_token
      if (new Date(conn.expires_at) <= new Date()) {
        const refreshed = await refreshAccessToken(appToken, conn.refresh_token)
        clientToken = refreshed.access_token
        await supabase.from('bcc_connections').update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('id', conn.id)
      }

      const dateFrom = formatDate(new Date(conn.last_checked_at))
      const dateTo = formatDate(new Date())
      const statementUrl = `${BCC_BUSINESS_ACCOUNT_BASE}/accounts/${conn.iban}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}&currency=${conn.currency}`
      const statementRes = await fetch(statementUrl, {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'x-client-token': clientToken,
          'accept': 'application/json',
        },
      })
      if (!statementRes.ok) throw new Error(`statement fetch failed: ${statementRes.status} ${await statementRes.text()}`)
      const statement = await statementRes.json()
      const rows = mapBccTransactions(statement.transactions || [])

      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, client_name, client_bin, amount')
        .eq('user_id', conn.user_id)
        .not('status', 'in', '(paid,cancelled)')
        .not('client_bin', 'is', null)
      const openInvoices = (invoices || []) as OpenInvoice[]
      const openInvoiceIds = new Set(openInvoices.map(i => i.id))

      const { data: existingPending } = await supabase
        .from('bcc_pending_matches')
        .select('id, invoice_id, matched_amount, matched_date')
        .eq('user_id', conn.user_id)

      // Drop stale pending matches for invoices settled through some other
      // route (manual Excel import, direct edit) since the last check —
      // otherwise they'd sit here forever as dead, unconfirmable entries.
      for (const pending of (existingPending || []) as any[]) {
        if (!openInvoiceIds.has(pending.invoice_id)) {
          await supabase.from('bcc_pending_matches').delete().eq('id', pending.id)
        }
      }

      const matches = findMatches(rows, openInvoices)
      // Seed with the pre-existing snapshot, then grow as we insert below —
      // otherwise two distinct transactions in this same statement pull that
      // both match the same invoice/amount/date (e.g. an accidental double
      // payment) would both pass the check and get inserted as duplicates.
      const pendingSnapshot = [...(existingPending || [])] as any[]
      let newMatches = 0
      for (const match of matches) {
        const alreadyPending = pendingSnapshot.some((p: any) =>
          p.invoice_id === match.invoice.id &&
          Number(p.matched_amount) === Number(match.row.amount) &&
          p.matched_date === match.row.date
        )
        if (alreadyPending) continue
        await supabase.from('bcc_pending_matches').insert({
          user_id: conn.user_id,
          invoice_id: match.invoice.id,
          matched_amount: match.row.amount,
          matched_date: match.row.date,
          matched_description: match.row.description,
        })
        pendingSnapshot.push({
          invoice_id: match.invoice.id,
          matched_amount: match.row.amount,
          matched_date: match.row.date,
        })
        newMatches++
      }

      await supabase.from('bcc_connections').update({ last_checked_at: new Date().toISOString() }).eq('id', conn.id)
      checked++

      if (newMatches > 0) {
        const { data: ownerProfile } = await supabase.from('profiles').select('email').eq('id', conn.user_id).single()
        if (ownerProfile?.email) {
          await resend.emails.send({
            from: 'invoices.kz <mail@invoices.kz>',
            to: ownerProfile.email,
            subject: `Найдено ${newMatches} возможных оплат`,
            html: `<p>По вашему подключённому счёту BCC найдено ${newMatches} операций, совпадающих по БИН и сумме с вашими открытыми счетами. Проверьте и подтвердите их в разделе <a href="https://www.invoices.kz/profile/acquiring">Эквайринг</a>.</p>`,
          })
          notified++
        }
      }
    } catch (e: any) {
      console.error('BCC cron error for connection', conn.id, e.message)
      await supabase.from('bcc_connections').update({ status: 'error' }).eq('id', conn.id)
    }
  }

  return NextResponse.json({ ok: true, checked, notified })
}
