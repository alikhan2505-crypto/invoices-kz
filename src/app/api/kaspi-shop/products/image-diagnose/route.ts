import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { searchCatalogProducts } from '@/lib/kaspiShop/addProduct'
import { imageSearchQueries, pickCatalogImage } from '@/lib/kaspiShop/productImages'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Why the photo backfill finds nothing for one shop and everything for
// another. Temporary, admin-only, read-only.
//
// The backfill reports "не найдено в каталоге" without saying what Kaspi
// actually answered, so there is no way to tell apart "the search returned
// nothing" from "it returned cards but none whose id matches the master SKU
// we hold" — and those need opposite fixes. This runs the same two queries
// the backfill runs for a handful of products and shows the raw result.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const connection = await loadConnection(user.id)
  if (!connection?.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const { data: products } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('kaspi_master_sku, product_name')
    .eq('connection_id', connection.id)
    .is('image_url', null)
    .limit(3)

  const report = []
  for (const product of products || []) {
    const queries = imageSearchQueries({
      masterSku: product.kaspi_master_sku,
      productName: product.product_name || '',
    })
    const attempts = []
    for (const query of queries) {
      const result = await searchCatalogProducts(connection.sessionCookies, connection.merchantId, query)
      attempts.push({
        запрос: query,
        сессияИстекла: result.sessionExpired,
        всегоНайдено: result.total,
        первыеКарточки: result.products.slice(0, 3).map(p => ({ id: p.id, название: p.title.slice(0, 45) })),
        совпалоПоАртикулу: pickCatalogImage(product.kaspi_master_sku, result.products) !== null,
      })
    }
    report.push({ артикул: product.kaspi_master_sku, название: product.product_name, попытки: attempts })
  }

  return NextResponse.json({ магазин: connection.companyName, проверено: report.length, report }, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
