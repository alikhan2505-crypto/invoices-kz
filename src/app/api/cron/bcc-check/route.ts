import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { findMatches, OpenInvoice } from '@/lib/acquiringMatch'
import { mapBccTransactions } from '@/lib/bccStatement'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE, BCC_BUSINESS_ACCOUNT_BASE } from '@/lib/bccAuth'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

// Thrown only when BCC has actually rejected this user's credentials — a
// refused refresh_token, or a refreshed/still-valid token the statement call
// answers with 401/403. That means the user's consent is gone and reconnecting
// is the only fix, so the connection is parked at status='error'. Every OTHER
// failure (network, timeout, 5xx, malformed body) is transient and must leave
// the connection 'active' so tomorrow's run simply retries.
class BccConsentError extends Error {}

async function refreshAccessToken(appToken: string, refreshToken: string) {
  const res = await fetch(`${BCC_AUTH_CLIENT_BASE}/token`, {
    method: 'POST',
    headers: {
      // Same endpoint as the callback route's code exchange — confirmed live
      // that BCC rejects a JSON body here ("Missing form parameter").
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${appToken}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_secret: process.env.BCC_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }).toString(),
  })
  if (!res.ok) {
    const body = await res.text()
    // Only 400/401 mean the token itself was refused (Keycloak answers a dead
    // refresh_token with 400 invalid_grant) — that's the same precision as the
    // statement-call check below. Everything else, including 429/408, is
    // transient (rate-limit or timeout) and must not permanently park a
    // connection that would have worked again tomorrow.
    if (res.status === 400 || res.status === 401) throw new BccConsentError(`refresh rejected: ${res.status} ${body}`)
    throw new Error(`refresh failed: ${res.status} ${body}`)
  }
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
      // The Pro gate is re-checked on every run, not just at connect time:
      // otherwise a user who connects and then lets Pro lapse keeps having
      // their real bank statement pulled daily (and keeps getting the
      // "N payments found" emails) forever. Skipped silently — a lapsed plan
      // is not a broken connection, so the status stays 'active' and picks
      // back up by itself the day they resubscribe.
      const { data: ownerProfile, error: profileError } = await supabase
        .from('profiles')
        .select('email, plan, plan_expires_at, bonus_expires_at, trial_expires_at')
        .eq('id', conn.user_id)
        .single()
      if (profileError) console.error('BCC cron: profile fetch failed for connection', conn.id, profileError.message)
      if (!getActivePlan(ownerProfile).canAcquiring) continue

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
      const statementUrl = `${BCC_BUSINESS_ACCOUNT_BASE}/accounts/${encodeURIComponent(conn.iban)}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}&currency=${encodeURIComponent(conn.currency)}`
      const statementRes = await fetch(statementUrl, {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'x-client-token': clientToken,
          'accept': 'application/json',
        },
      })
      if (!statementRes.ok) {
        const body = await statementRes.text()
        // 401/403 on the statement call = the per-user token was refused even
        // though it was fresh (consent revoked from the bank's side); anything
        // else is transient.
        if (statementRes.status === 401 || statementRes.status === 403) {
          throw new BccConsentError(`statement rejected token: ${statementRes.status} ${body}`)
        }
        throw new Error(`statement fetch failed: ${statementRes.status} ${body}`)
      }
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
      if (e instanceof BccConsentError) {
        // Terminal: only a fresh OAuth consent can fix this, so park the
        // connection (the page surfaces status='error' with a reconnect hint).
        console.error('BCC cron: consent lost for connection', conn.id, e.message)
        await supabase.from('bcc_connections').update({ status: 'error' }).eq('id', conn.id)
      } else {
        // Transient: leave the status alone so tomorrow's run retries. A single
        // timeout or 5xx used to permanently kill a working connection here,
        // and nothing ever selects status='error' again.
        console.error('BCC cron: transient error for connection', conn.id, '— skipping today:', e.message)
      }
    }
  }

  return NextResponse.json({ ok: true, checked, notified })
}
