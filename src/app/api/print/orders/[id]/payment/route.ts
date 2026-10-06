// src/app/api/print/orders/[id]/payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateKaspiPaymentForPrintOrder } from '@/lib/printShop/orderPayment'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors /api/shop/[slug]/order-status exactly -- the checkout page polls
// this every few seconds while payment is pending.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: order } = await supabase
    .from('print_orders')
    .select('id, price, status')
    .eq('id', id)
    .maybeSingle()
  if (!order) return NextResponse.json({ payment: null })

  try {
    const payment = await getOrCreateKaspiPaymentForPrintOrder({ id: order.id, price: order.price, status: order.status })
    if (!payment) return NextResponse.json({ payment: null })

    if (payment.status === 'pending') {
      try {
        const outcome = await checkAndSettleKaspiPayment(payment)
        if (outcome === 'paid') payment.status = 'paid'
        else if (outcome === 'expired') return NextResponse.json({ payment: null })
      } catch (e: any) {
        console.error('Print order live status check failed for', order.id, e.message)
      }
    }

    return NextResponse.json({ payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    console.error('Print order payment lookup failed for', order.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
