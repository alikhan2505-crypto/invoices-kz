import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnectionById } from '@/lib/kaspiShop/connection'
import { generatePriceListXml } from '@/lib/kaspiShop/pricing'
import { ownerHasKaspiShopAccess } from '@/lib/kaspiShop/planGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public by necessity -- Kaspi's own crawler hits this URL directly with no
// session, on its own hourly schedule (see Task 2's pricing.ts comment).
// Not admin/session-gated, but the connectionId path segment is a random
// uuid (kaspi_shop_connections.id), not a predictable/sequential value, so
// it's not practically guessable.
export async function GET(req: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params
  const connection = await loadConnectionById(connectionId)
  if (!connection || connection.status !== 'active') {
    return new NextResponse('Not found', { status: 404 })
  }
  // Pro gate (founder decision 14.10.2026): the price list closes together
  // with Kaspi Bot when the owner is neither admin nor on an active Pro
  // plan, so Kaspi's crawler stops pulling prices. Same 404 as an unknown
  // connection; nothing is changed, renewing Pro reopens it by itself. A
  // failed plan read is a 503 (transient), not a 404 -- a paying seller's
  // feed shouldn't look gone because of one DB hiccup.
  let ownerHasAccess: boolean
  try {
    ownerHasAccess = await ownerHasKaspiShopAccess(connection.userId)
  } catch (err: any) {
    console.error('kaspi-shop pricelist: owner plan check failed for connection', connectionId, ':', err.message)
    return new NextResponse('Temporarily unavailable', { status: 503 })
  }
  if (!ownerHasAccess) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: products } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('kaspi_sku, product_name, brand, store_id, stock_count, own_current_price')
    .eq('connection_id', connectionId)
    .eq('enabled', true)

  const xml = generatePriceListXml({
    companyName: connection.companyName,
    merchantId: connection.merchantId,
    products: (products || []).map(p => ({
      sku: p.kaspi_sku,
      model: p.product_name,
      brand: p.brand,
      storeId: p.store_id,
      stockCount: p.stock_count,
      price: Number(p.own_current_price),
    })),
  })

  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
