import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from './connection'
import { createPayment } from './client'
import { getWalletBalance, computeCommission } from './wallet'
import type { SettleableRequest } from './settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiShopOrderPayment extends SettleableRequest {
  qr_token: string | null
  payment_link: string | null
  status: string
}

const SETTLEABLE_COLUMNS = 'id, user_id, invoice_id, order_id, shop_order_id, amount, kaspi_operation_id, callback_url, expires_at, qr_token, payment_link, status'

const MINT_WINDOW_MS = 60_000
const MINT_LIMIT = 3

const CLOSED_ORDER_STATUSES = new Set(['paid', 'expired'])

/**
 * Returns a storefront order's currently-valid Kaspi payment, minting one on
 * demand if none exists or the previous link expired -- same shape as
 * getOrCreateKaspiPaymentForInvoice (invoicePayment.ts), for a
 * kaspi_shop_orders row instead of an invoice. Reachable from the PUBLIC
 * /shop/[slug] checkout, so the same per-order mint rate limit and
 * wallet-balance-covers-commission gate apply before minting anything NEW
 * (an already-live link keeps working regardless of balance).
 */
export async function getOrCreateKaspiPaymentForShopOrder(order: {
  id: string
  connectionOwnerId: string
  amount: number | string
  status?: string | null
}): Promise<KaspiShopOrderPayment | null> {
  const { data: existing, error } = await supabase
    .from('kaspi_payment_requests')
    .select(SETTLEABLE_COLUMNS)
    .eq('shop_order_id', order.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`kaspi_payment_requests lookup for shop order ${order.id} failed: ${error.message}`)

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing as KaspiShopOrderPayment
  }

  if (order.status && CLOSED_ORDER_STATUSES.has(order.status)) return null

  const balance = await getWalletBalance(order.connectionOwnerId)
  if (balance < computeCommission(Number(order.amount))) return null

  const { count: recentMints, error: rateError } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('shop_order_id', order.id)
    .gte('created_at', new Date(Date.now() - MINT_WINDOW_MS).toISOString())
  if (rateError) console.error('Kaspi shop order payment: mint rate count failed for order', order.id, rateError.message)
  else if ((recentMints ?? 0) >= MINT_LIMIT) {
    console.error('Kaspi shop order payment: mint rate limit hit for order', order.id)
    return null
  }

  const connection = await loadConnectionByUserId(order.connectionOwnerId)
  if (!connection) return null

  const payment = await createPayment(connection, { amount: Number(order.amount), orderId: order.id })

  const { data: inserted, error: insertError } = await supabase
    .from('kaspi_payment_requests')
    .insert({
      user_id: order.connectionOwnerId,
      shop_order_id: order.id,
      order_id: order.id,
      amount: order.amount,
      kaspi_operation_id: payment.operationId,
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      status: 'pending',
      expires_at: payment.expiresAt,
    })
    .select(SETTLEABLE_COLUMNS)
    .single()
  if (insertError) {
    // Unique violation on kaspi_payment_requests_shop_order_pending_idx --
    // same concurrent-caller race as getOrCreateKaspiPaymentForInvoice's
    // identical handling: the other call's insert won, hand back its row.
    if (insertError.code === '23505') {
      const { data: winner } = await supabase
        .from('kaspi_payment_requests')
        .select(SETTLEABLE_COLUMNS)
        .eq('shop_order_id', order.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) return winner as KaspiShopOrderPayment
    }
    console.error('Kaspi payment created but failed to persist for tracking — shop order', order.id, 'operation', payment.operationId, ':', insertError.message)
    return null
  }

  return inserted as KaspiShopOrderPayment
}
