import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnectionById } from '@/lib/kaspiShop/connection'
import { generatePriceListXml } from '@/lib/kaspiShop/pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public by necessity -- Kaspi's own crawler hits this URL directly with no
// session, on its own hourly schedule (see Task 2's pricing.ts comment).
// Not admin/session-gated, but the connectionId path segment is a random
// uuid (kaspi_shop_connections.id), not a predictable/sequential value, so
// it's not practically guessable.
export async function GET(req: NextRequest, { params }: { params: { connectionId: string } }) {
  const connection = await loadConnectionById(params.connectionId)
  if (!connection || connection.status !== 'active') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: products } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('kaspi_sku, product_name, brand, store_id, stock_count, own_current_price')
    .eq('connection_id', params.connectionId)
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
