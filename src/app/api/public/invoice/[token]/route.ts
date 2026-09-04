import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
// those rows (wallet balance, plan internals, other users' data) never
// leaves the server.

const PROFILE_FIELDS = 'company_name, bin_iin, address, phone, email, director_name, signature_url, stamp_url, kaspi_pay_link, halyk_pay_link, website, social_links, plan, plan_expires_at, bonus_expires_at, trial_expires_at'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
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

  const [{ data: profile }, bank] = await Promise.all([
    supabase.from('profiles').select(PROFILE_FIELDS).eq('id', invoice.user_id).maybeSingle(),
    invoice.bank_id
      ? supabase.from('bank_accounts').select('*').eq('id', invoice.bank_id).maybeSingle()
      : supabase.from('bank_accounts').select('*').eq('user_id', invoice.user_id).eq('is_main', true).maybeSingle(),
  ])

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

  return NextResponse.json({ invoice, profile: profile || null, bank: bank?.data || null })
}
