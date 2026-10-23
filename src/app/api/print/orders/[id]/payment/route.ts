// src/app/api/print/orders/[id]/payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateKaspiPaymentForPrintOrder } from '@/lib/printShop/orderPayment'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'
import { clientIp } from '@/lib/toolQuota'
import { paymentRequestRateLimited } from '@/lib/printShop/rateLimit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors /api/shop/[slug]/order-status exactly -- the checkout page polls
// this every few seconds while payment is pending.
//
// Аудит 24.10.2026 (abuse-cost-8): публичный GET по id заказа выпускает настоящий
// платёж Kaspi на кассе основателя, поэтому (1) частота запросов с IP ограничена
// (опрос раз в 3 с = 20/мин, потолок 60/мин; ответ той же формы {payment: null},
// клиент считает его пустым опросом), (2) НОВЫЙ платёж выпускается только
// pending-заказу не старше пары часов, с лимитами на IP и общим в час — см.
// getOrCreateKaspiPaymentForPrintOrder. Уже выпущенный платёж отдаётся как раньше.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ip = clientIp(req.headers)

  if (paymentRequestRateLimited(ip)) {
    return NextResponse.json({ payment: null, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } })
  }

  const { data: order } = await supabase
    .from('print_orders')
    .select('id, price, status, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!order) return NextResponse.json({ payment: null })

  try {
    const payment = await getOrCreateKaspiPaymentForPrintOrder({ id: order.id, price: order.price, status: order.status, created_at: order.created_at }, { ip })
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
