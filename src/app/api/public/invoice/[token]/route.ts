import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  INVOICE_SERVER_COLUMNS, PUBLIC_PROFILE_COLUMNS, PLAN_PROFILE_COLUMNS, PUBLIC_BANK_COLUMNS,
  toPublicInvoice, splitPublicProfile,
} from '@/lib/publicDocument'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Serves the PUBLIC invoice page (/view/[token]) from the server instead of
// letting the browser query Supabase directly with the anon key.
//
// Why this exists (2026-09-04): the previous design needed RLS policies that
// let anonymous clients SELECT invoices/profiles/bank_accounts, and the
// policy expressed that as `public_token IS NOT NULL` -- i.e. "this record
// has a share token" rather than "the caller presented the right token".
// Since RLS cannot see a query's filters, that made every such row readable
// by anyone with the (public, browser-shipped) anon key -- confirmed live by
// dumping real company names, БИН and phone numbers anonymously. Looking a
// record up by its token on the server is the only way to make knowing the
// token actually required, so those policies are dropped and this route is
// the sole public read path.
//
// Only the fields the payer's page renders are returned. Anything else on
// those rows (wallet balance, plan internals, the seller's email and user_id,
// other users' data) never leaves the server: explicit column lists live in
// src/lib/publicDocument.ts (audit 24.10, secrets-6/privacy-12).

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(INVOICE_SERVER_COLUMNS)
    .eq('public_token', token)
    .maybeSingle()
  if (error) {
    console.error('public invoice lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  // A wrong or revoked token is indistinguishable from a nonexistent one --
  // same 404 either way, so the endpoint can't be used to probe which tokens
  // are real.
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Plan columns and is_admin are fetched alongside the public fields (one
  // query) purely to compute showWatermark server-side -- an admin's own
  // watermark-free PDF generation already respects is_admin (src/lib/plan.ts),
  // but this public, unauthenticated page had no way to know that without the
  // plan dates / is_admin leaking into the JSON a random visitor with the link
  // can read. splitPublicProfile keeps only the public fields and a boolean.
  const [{ data: profileRow }, bank] = await Promise.all([
    supabase.from('profiles').select(`${PUBLIC_PROFILE_COLUMNS}, ${PLAN_PROFILE_COLUMNS}`).eq('id', invoice.user_id).maybeSingle(),
    invoice.bank_id
      ? supabase.from('bank_accounts').select(PUBLIC_BANK_COLUMNS).eq('id', invoice.bank_id).maybeSingle()
      : supabase.from('bank_accounts').select(PUBLIC_BANK_COLUMNS).eq('user_id', invoice.user_id).eq('is_main', true).maybeSingle(),
  ])

  const { profile, showWatermark } = splitPublicProfile(profileRow as Record<string, unknown> | null)

  // First open by the recipient flips sent -> viewed. This used to be
  // attempted from the browser, where RLS silently refused it (there is no
  // public UPDATE policy on invoices), so the status never actually moved
  // and the "клиент открыл счёт" notification never fired for anonymous
  // viewers. Doing it here fixes that as a side effect of moving server-side.
  if (invoice.status === 'sent') {
    await supabase
      .from('invoices')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', invoice.id)
    invoice.status = 'viewed'
  }

  return NextResponse.json({ invoice: toPublicInvoice(invoice), profile, bank: bank?.data || null, showWatermark })
}
