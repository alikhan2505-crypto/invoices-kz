import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { debitWalletForCommission } from '@/lib/kaspiPay/wallet'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Confirms ONE candidate out of an ambiguous set (multiple open invoices
// shared the same amount) -- the customer picks which invoice this
// operation actually paid. Commission is charged here, not at sync time,
// since an ambiguous match was never auto-confirmed or charged.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pendingMatchId } = await req.json()
  if (!pendingMatchId) return NextResponse.json({ error: 'pendingMatchId required' }, { status: 400 })

  const { data: pendingMatch } = await supabase
    .from('kaspi_pending_matches')
    .select('id, user_id, invoice_id, kaspi_operation_id, matched_amount')
    .eq('id', pendingMatchId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pendingMatch) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Atomic claim: deleting every sibling candidate for this SAME operation
  // FIRST (not after settling, as an earlier version of this route had it)
  // means two concurrent confirms of the same operation can't both pass —
  // only the caller whose delete actually removed rows proceeds; the loser
  // gets a clean "already resolved" response instead of double-settling.
  const { data: deleted, error: deleteError } = await supabase
    .from('kaspi_pending_matches')
    .delete()
    .eq('user_id', user.id)
    .eq('kaspi_operation_id', pendingMatch.kaspi_operation_id)
    .select('id')
  if (deleteError) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  if (!deleted || deleted.length === 0) return NextResponse.json({ error: 'already_resolved' }, { status: 409 })

  // The invoice may have been closed by an entirely different path (BCC,
  // Excel-import, a manual mark-paid) while this ambiguous match sat
  // pending — re-checked here, after winning the claim above, so this
  // route never re-marks an already-settled invoice or double-charges
  // commission for a payment already accounted for elsewhere.
  const { data: invoice } = await supabase.from('invoices').select('status').eq('id', pendingMatch.invoice_id).maybeSingle()
  if (!invoice || invoice.status === 'paid' || invoice.status === 'cancelled') {
    return NextResponse.json({ success: true, skipped: 'invoice_already_closed' })
  }

  await supabase.from('invoices').update({ status: 'paid' }).eq('id', pendingMatch.invoice_id)
  await supabase.from('invoice_logs').insert({ invoice_id: pendingMatch.invoice_id, status: 'paid' })
  await supabase.from('kaspi_operations')
    .update({ matched_invoice_id: pendingMatch.invoice_id, category: 'platform' })
    .eq('user_id', user.id)
    .eq('kaspi_operation_id', pendingMatch.kaspi_operation_id)

  try {
    await debitWalletForCommission(user.id, Number(pendingMatch.matched_amount), null, `kaspi_operation:${pendingMatch.kaspi_operation_id}`)
  } catch (e: any) {
    console.error('CRITICAL: commission debit failed on manual pending-match confirm for user', user.id, ':', e.message)
  }

  return NextResponse.json({ success: true })
}
