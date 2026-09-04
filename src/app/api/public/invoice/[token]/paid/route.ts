import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// «Я оплатил» on the public invoice page. Keyed by the share TOKEN, never by
// invoice id: the token is the thing the payer had to be given, so requiring
// it is what makes this safe to expose anonymously.
//
// Previously the page did this write straight from the browser with the anon
// key, which RLS refused (invoices has no public UPDATE policy) -- the button
// appeared to work and silently changed nothing. This route makes it real.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Only ever moves an unpaid invoice to paid. Without the status guard a
  // replayed request could walk a cancelled or already-settled invoice back
  // into 'paid'.
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('public_token', token)
    .in('status', ['sent', 'viewed', 'overdue'])
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('public invoice mark-paid failed:', error.message)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ ok: true, invoiceId: data.id })
}
