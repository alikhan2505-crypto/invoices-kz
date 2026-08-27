import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveStorefrontBySlug } from '@/lib/kaspiShop/storefront'
import { getOrCreateKaspiPaymentForShopOrder } from '@/lib/kaspiPay/shopOrderPayment'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors /api/kaspi/invoice-payment exactly -- the storefront checkout page
// polls this every few seconds while payment is pending, and a live Kaspi
// check right here is what makes confirmation instant and click-free on
// this project's once-daily cron plan (see settlePayment.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ payment: null })

  const { data: order } = await supabase
    .from('kaspi_shop_orders')
    .select('id, price, status')
    .eq('id', orderId)
    .eq('connection_id', storefront.connectionId)
    .maybeSingle()
  if (!order) return NextResponse.json({ payment: null })

  try {
    const payment = await getOrCreateKaspiPaymentForShopOrder({
      id: order.id, connectionOwnerId: storefront.userId, amount: order.price, status: order.status,
    })
    if (!payment) return NextResponse.json({ payment: null })

    if (payment.status === 'pending') {
      try {
        const outcome = await checkAndSettleKaspiPayment(payment)
        if (outcome === 'paid') payment.status = 'paid'
        else if (outcome === 'expired') return NextResponse.json({ payment: null })
      } catch (e: any) {
        console.error('Storefront order live status check failed for order', order.id, e.message)
      }
    }

    return NextResponse.json({ payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    console.error('Storefront order-status lookup failed for order', order.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
