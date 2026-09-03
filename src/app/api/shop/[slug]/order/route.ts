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

// Public, unauthenticated -- creates one order and mints its first Kaspi
// payment in a single call, mirroring how send-invoice mints an invoice's
// first payment link. The buyer never has an account; buyerName/Phone/
// Address is the only record of who placed the order (see Заказы витрины).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const productId = typeof body?.productId === 'string' ? body.productId : null
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName.trim() : ''
  const buyerAddress = typeof body?.buyerAddress === 'string' ? body.buyerAddress.trim() : ''
  const buyerPhone = normalizeKzPhone(typeof body?.buyerPhone === 'string' ? body.buyerPhone : '')
  if (!productId || !buyerName || !buyerAddress || !buyerPhone) {
    return NextResponse.json({ error: 'Заполните имя, телефон и адрес' }, { status: 400 })
  }

  const { count: recentOrders, error: rateError } = await supabase
    .from('kaspi_shop_orders')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', storefront.connectionId)
    .gte('created_at', new Date(Date.now() - ORDER_RATE_WINDOW_MS).toISOString())
  if (rateError) console.error('Storefront order: rate count failed for connection', storefront.connectionId, rateError.message)
  else if ((recentOrders ?? 0) >= ORDER_RATE_LIMIT) {
    return NextResponse.json({ error: 'Слишком много заказов подряд, попробуйте позже' }, { status: 429 })
  }

  // A storefront product can come from either source (Витрина → Каталог:
  // точечный выбор Kaspi-товаров + ручное добавление) -- try Kaspi first,
  // fall back to the manually-added table. Gates on exactly the same
  // conditions filterStorefrontProducts used to list it in the first place;
  // this used to only check `enabled` (repricer on) and only the Kaspi
  // table, a regression once the listing switched to available_for_sale: a
  // product visibly listed for sale would fail here with "Товар недоступен"
  // the moment a customer actually tried to order it.
  const { data: kaspiProduct, error: kaspiProductError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, own_current_price, available_for_sale, stock_count, show_on_storefront')
    .eq('id', productId)
    .eq('connection_id', storefront.connectionId)
    .maybeSingle()
  if (kaspiProductError) {
    console.error('Storefront order: Kaspi product lookup failed', kaspiProductError.message)
    return NextResponse.json({ error: 'Не удалось оформить заказ' }, { status: 500 })
  }

  let productName: string
  let price: number
  let trackedProductId: string | null = null
  let customProductId: string | null = null

  if (kaspiProduct) {
    if (!kaspiProduct.show_on_storefront || kaspiProduct.available_for_sale === false || (kaspiProduct.stock_count !== null && kaspiProduct.stock_count <= 0)) {
      return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })
    }
    price = Number(kaspiProduct.own_current_price) || 0
    if (price <= 0) return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })
    productName = kaspiProduct.product_name
    trackedProductId = kaspiProduct.id
  } else {
    const { data: customProduct, error: customProductError } = await supabase
      .from('kaspi_shop_custom_products')
      .select('id, name, price, stock_count')
      .eq('id', productId)
      .eq('connection_id', storefront.connectionId)
      .maybeSingle()
    if (customProductError) {
      console.error('Storefront order: custom product lookup failed', customProductError.message)
      return NextResponse.json({ error: 'Не удалось оформить заказ' }, { status: 500 })
    }
    if (!customProduct || (customProduct.stock_count !== null && customProduct.stock_count <= 0)) {
      return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })
    }
    price = Number(customProduct.price) || 0
    if (price <= 0) return NextResponse.json({ error: 'Товар недоступен' }, { status: 400 })
    productName = customProduct.name
    customProductId = customProduct.id
  }

  const { data: order, error: orderError } = await supabase
    .from('kaspi_shop_orders')
    .insert({
      connection_id: storefront.connectionId,
      tracked_product_id: trackedProductId,
      custom_product_id: customProductId,
      product_name: productName,
      price,
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
