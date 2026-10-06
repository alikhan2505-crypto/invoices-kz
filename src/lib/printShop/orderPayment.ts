import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
import { getWalletBalance, computeCommission } from '@/lib/kaspiPay/wallet'
import type { SettleableRequest } from '@/lib/kaspiPay/settlePayment'
import { getPrintShopOwnerUserId } from './ownerAccount'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiPrintOrderPayment extends SettleableRequest {
  qr_token: string | null
  payment_link: string | null
  status: string
}

const SETTLEABLE_COLUMNS = 'id, user_id, invoice_id, order_id, shop_order_id, print_order_id, amount, kaspi_operation_id, callback_url, expires_at, qr_token, payment_link, status'

const MINT_WINDOW_MS = 60_000
const MINT_LIMIT = 3
const CLOSED_STATUSES = new Set(['paid', 'failed'])

/**
 * Mirrors getOrCreateKaspiPaymentForInvoice (invoicePayment.ts) for a
 * print_orders row instead -- same mint-rate-limit and wallet-balance gate,
 * but user_id is always the shop owner (there's only one), never a
 * parameter.
 */
export async function getOrCreateKaspiPaymentForPrintOrder(order: {
  id: string
  price: number
  status: string
}): Promise<KaspiPrintOrderPayment | null> {
  const ownerId = getPrintShopOwnerUserId()

  const { data: existing, error } = await supabase
    .from('kaspi_payment_requests')
    .select(SETTLEABLE_COLUMNS)
    .eq('print_order_id', order.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`kaspi_payment_requests lookup for print order ${order.id} failed: ${error.message}`)

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing as KaspiPrintOrderPayment
  }

  if (CLOSED_STATUSES.has(order.status)) return null

  const balance = await getWalletBalance(ownerId)
  if (balance < computeCommission(order.price)) return null

  const { count: recentMints } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('print_order_id', order.id)
    .gte('created_at', new Date(Date.now() - MINT_WINDOW_MS).toISOString())
  if ((recentMints ?? 0) >= MINT_LIMIT) return null

  const connection = await loadConnectionByUserId(ownerId)
  if (!connection) return null

  const payment = await createPayment(connection, { amount: order.price, orderId: order.id })

  const { data: inserted, error: insertError } = await supabase
    .from('kaspi_payment_requests')
    .insert({
      user_id: ownerId,
      print_order_id: order.id,
      order_id: order.id,
      amount: order.price,
      kaspi_operation_id: payment.operationId,
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      status: 'pending',
      expires_at: payment.expiresAt,
    })
    .select(SETTLEABLE_COLUMNS)
    .single()
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: winner } = await supabase
        .from('kaspi_payment_requests')
        .select(SETTLEABLE_COLUMNS)
        .eq('print_order_id', order.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) return winner as KaspiPrintOrderPayment
    }
    console.error('Print shop: Kaspi payment created but failed to persist — order', order.id, 'operation', payment.operationId, ':', insertError.message)
    return null
  }

  return inserted as KaspiPrintOrderPayment
}
