import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchKaspiOperations } from '@/lib/kaspiPay/operationsQuery'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const direction = req.nextUrl.searchParams.get('direction') || 'all'
  const category = req.nextUrl.searchParams.get('category') || 'all'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  const { data: connection } = await supabase
    .from('kaspi_connections')
    .select('last_history_sync_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const operations = await fetchKaspiOperations(user.id, { direction, category, from, to, limit: 200 })

  const { data: pending } = await supabase
    .from('kaspi_pending_matches')
    .select('id, kaspi_operation_id, invoice_id, matched_amount, matched_date, client_name, invoices(number, client_name)')
    .eq('user_id', user.id)

  return NextResponse.json({
    lastSyncedAt: connection?.last_history_sync_at ?? null,
    operations,
    pendingMatches: (pending || []).map((p: any) => ({
      id: p.id,
      kaspiOperationId: p.kaspi_operation_id,
      invoiceId: p.invoice_id,
      invoiceNumber: p.invoices?.number ?? null,
      // clientName is the Kaspi payer's own name (from the operation itself,
      // the same for every candidate of one operation); invoiceClientName is
      // the candidate INVOICE's own client name -- shown side by side so the
      // user can eyeball-match by name when Kaspi's API gives us no BIN to
      // match on automatically, without the platform auto-picking a
      // candidate based on a fuzzy name comparison it can't be sure about.
      clientName: p.client_name,
      invoiceClientName: p.invoices?.client_name ?? null,
      matchedAmount: Number(p.matched_amount),
      matchedDate: p.matched_date,
    })),
  })
}
