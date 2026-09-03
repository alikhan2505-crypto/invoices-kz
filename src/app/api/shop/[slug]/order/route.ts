import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveStorefrontBySlug } from '@/lib/kaspiShop/storefront'
import { getOrCreateKaspiPaymentForShopOrder } from '@/lib/kaspiPay/shopOrderPayment'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Anonymous, unauthenticated caller can create as many orders as they like
// unless capped here -- each one mints a real Kaspi payment against the
// seller's live Cashier connection (createPayment is a genuine Kaspi API
// call, not a local operation). getOrCreateKaspiPaymentForShopOrder's own
// MINT_LIMIT only throttles re-mints for a single already-created order; it
// does nothing to stop a script from just creating a fresh order every time
// to get a fresh mint. This caps genuinely new orders per storefront.
const ORDER_RATE_WINDOW_MS = 10 * 60 * 1000
const ORDER_RATE_LIMIT = 10
const MAX_CART_LINES = 20
const MAX_LINE_QTY = 99

function pluralizeTovar(n: number): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'товар'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'товара'
  return 'товаров'
}

interface ResolvedLine { name: string; price: number; qty: number }

// Re-validates and re-prices ONE cart line against live data, exactly the
// same gates the storefront listing itself applies (filterStorefrontProducts
// / filterCustomStorefrontProducts) -- never trusts a client-supplied price
// or name. A storefront product can come from either source (Витрина →
// Каталог: точечный выбор Kaspi-товаров + ручное добавление), so this tries
// Kaspi first and falls back to the manually-added table, same as the
// pre-cart single-product version of this route did. Returns null if the
// line can't be fulfilled right now (gone, opted out, out of stock).
async function resolveLine(connectionId: string, productId: string, qty: number): Promise<ResolvedLine | null> {
  const { data: kaspiProduct, error: kaspiProductError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, own_current_price, available_for_sale, stock_count, show_on_storefront')
    .eq('id', productId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (kaspiProductError) throw new Error(`Kaspi product lookup failed: ${kaspiProductError.message}`)

  if (kaspiProduct) {
    if (!kaspiProduct.show_on_storefront || kaspiProduct.available_for_sale === false || (kaspiProduct.stock_count !== null && kaspiProduct.stock_count < qty)) return null
    const price = Number(kaspiProduct.own_current_price) || 0
    if (price <= 0) return null
    return { name: kaspiProduct.product_name, price, qty }
  }

  const { data: customProduct, error: customProductError } = await supabase
    .from('kaspi_shop_custom_products')
    .select('id, name, price, stock_count')
    .eq('id', productId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (customProductError) throw new Error(`Custom product lookup failed: ${customProductError.message}`)
  if (!customProduct || (customProduct.stock_count !== null && customProduct.stock_count < qty)) return null
  const price = Number(customProduct.price) || 0
  if (price <= 0) return null
  return { name: customProduct.name, price, qty }
}

// Public, unauthenticated -- creates one order for the buyer's whole cart and
// mints its first Kaspi payment in a single call, mirroring how send-invoice
// mints an invoice's first payment link. The buyer never has an account;
// buyerName/Phone/Address is the only record of who placed the order (see
// Заказы витрины). One order row per checkout regardless of cart size --
// cart_items carries the server-resolved line list, product_name becomes a
// short summary, price becomes the cart total.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const rawItems = Array.isArray(body?.items) ? body.items : []
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName.trim() : ''
  const buyerAddress = typeof body?.buyerAddress === 'string' ? body.buyerAddress.trim() : ''
  const buyerPhone = normalizeKzPhone(typeof body?.buyerPhone === 'string' ? body.buyerPhone : '')
  if (!buyerName || !buyerAddress || !buyerPhone) {
    return NextResponse.json({ error: 'Заполните имя, телефон и адрес' }, { status: 400 })
  }

  const items = rawItems
    .filter((it: any) => typeof it?.id === 'string' && Number.isInteger(it?.qty) && it.qty > 0 && it.qty <= MAX_LINE_QTY)
    .slice(0, MAX_CART_LINES)
    .map((it: any) => ({ id: it.id as string, qty: it.qty as number }))
  if (items.length === 0) return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 })

  const { count: recentOrders, error: rateError } = await supabase
    .from('kaspi_shop_orders')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', storefront.connectionId)
    .gte('created_at', new Date(Date.now() - ORDER_RATE_WINDOW_MS).toISOString())
  if (rateError) console.error('Storefront order: rate count failed for connection', storefront.connectionId, rateError.message)
  else if ((recentOrders ?? 0) >= ORDER_RATE_LIMIT) {
    return NextResponse.json({ error: 'Слишком много заказов подряд, попробуйте позже' }, { status: 429 })
  }

  let lines: (ResolvedLine | null)[]
  try {
    lines = await Promise.all(items.map((it: { id: string; qty: number }) => resolveLine(storefront.connectionId, it.id, it.qty)))
  } catch (e: any) {
    console.error('Storefront order: line resolution failed', e.message)
    return NextResponse.json({ error: 'Не удалось оформить заказ' }, { status: 500 })
  }
  // All-or-nothing: a partially-fulfillable cart is rejected outright rather
  // than silently dropping lines the buyer can't see happen.
  if (lines.some(l => l === null)) {
    return NextResponse.json({ error: 'Часть товаров в корзине уже недоступна, обновите страницу' }, { status: 400 })
  }

  const resolvedLines = lines as ResolvedLine[]
  const total = resolvedLines.reduce((sum, l) => sum + l.price * l.qty, 0)
  if (total <= 0) return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })

  const totalQty = resolvedLines.reduce((sum, l) => sum + l.qty, 0)
  const productName = resolvedLines.length === 1 && resolvedLines[0].qty === 1
    ? resolvedLines[0].name
    : `Корзина: ${resolvedLines.length} ${pluralizeTovar(resolvedLines.length)} (${totalQty} шт.)`

  const { data: order, error: orderError } = await supabase
    .from('kaspi_shop_orders')
    .insert({
      connection_id: storefront.connectionId,
      cart_items: resolvedLines,
      product_name: productName,
      price: total,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      buyer_address: buyerAddress,
      status: 'pending_payment',
    })
    .select('id, price, status')
    .single()
  if (orderError) {
    console.error('Storefront order: insert failed', orderError.message)
    return NextResponse.json({ error: 'Не удалось оформить заказ' }, { status: 500 })
  }

  try {
    const payment = await getOrCreateKaspiPaymentForShopOrder({
      id: order.id, connectionOwnerId: storefront.userId, amount: order.price, status: order.status,
    })
    if (!payment) return NextResponse.json({ orderId: order.id, payment: null })
    return NextResponse.json({ orderId: order.id, payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    console.error('Storefront order payment mint failed for order', order.id, e.message)
    return NextResponse.json({ orderId: order.id, payment: null })
  }
}
