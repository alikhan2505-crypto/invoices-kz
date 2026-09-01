import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TYPE_LABELS: Record<string, string> = {
  topup: 'Пополнение',
  commission: 'Комиссия за оплату счёта',
  kaspi_shop_check: 'Kaspi Bot: проверка цены',
  ai_agent_reply: 'ИИ-агент: ответ',
}

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('type, amount, note, created_at, kaspi_payment_request_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A commission debit's `note` is the internal 'kaspi_operation:<id>' join
  // key the Выписка statement's commission column matches on (see
  // operationsQuery.ts) -- never meant to be shown to a person. Before the
  // note existed, this fell through to TYPE_LABELS.commission; once it was
  // added (2026-09-01, to fix that same Выписка join), it started winning
  // the `row.note || ...` fallback below and leaking as a raw label like
  // "kaspi_operation:17345177604" (founder repro). Build a real label from
  // the linked payment request/invoice instead, one batched lookup for the
  // whole page rather than N+1.
  const reqIds = [...new Set((data || [])
    .filter(row => row.type === 'commission' && row.kaspi_payment_request_id)
    .map(row => row.kaspi_payment_request_id as string))]
  const reqById = new Map<string, { orderId: string | null; invoiceId: string | null }>()
  if (reqIds.length > 0) {
    const { data: reqs } = await supabase
      .from('kaspi_payment_requests')
      .select('id, order_id, invoice_id')
      .in('id', reqIds)
    for (const r of reqs || []) reqById.set(r.id, { orderId: r.order_id, invoiceId: r.invoice_id })
  }
  const invoiceIds = [...new Set([...reqById.values()].map(r => r.invoiceId).filter((id): id is string => !!id))]
  const invoiceNumberById = new Map<string, string>()
  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase.from('invoices').select('id, number').in('id', invoiceIds)
    for (const inv of invoices || []) invoiceNumberById.set(inv.id, inv.number)
  }

  function commissionLabel(kaspiPaymentRequestId: string | null): string {
    const req = kaspiPaymentRequestId ? reqById.get(kaspiPaymentRequestId) : undefined
    const invoiceNumber = req?.invoiceId ? invoiceNumberById.get(req.invoiceId) : undefined
    if (invoiceNumber) return `Комиссия: счёт №${invoiceNumber}`
    if (req?.orderId) return `Комиссия: заказ ${req.orderId}`
    return TYPE_LABELS.commission
  }

  const entries = (data || []).map(row => ({
    label: row.type === 'commission' ? commissionLabel(row.kaspi_payment_request_id) : (row.note || TYPE_LABELS[row.type] || row.type),
    amount: Number(row.amount),
    createdAt: row.created_at,
  }))

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('wallet_ledger')
    .select('type, amount')
    .eq('user_id', user.id)
    .gte('created_at', since)
  const breakdown: Record<string, number> = { topup: 0, commission: 0, kaspi_shop_check: 0, ai_agent_reply: 0 }
  for (const row of recent || []) {
    if (row.type in breakdown) breakdown[row.type] += Math.abs(Number(row.amount))
  }
  return NextResponse.json({ entries, breakdown })
}
