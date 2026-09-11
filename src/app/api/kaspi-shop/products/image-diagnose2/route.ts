import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { fetchOfferDetails, listCatalogWithStatus } from '@/lib/kaspiShop/cabinetApi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Round two of the same question: does Kaspi's SELLER'S OWN catalog carry a
// photo, as opposed to the marketplace-wide search image-diagnose used.
//
// That first diagnosis found the real fault: searchCatalogProducts hits
// `mc/product/view/mc/products`, which is a marketplace-wide search (millions
// of results for a generic title), not the merchant's own listings -- its ids
// come back in a different namespace ("16511150b") than our own master SKUs
// (pure digits), so an exact-id match can never succeed for Abil-Sisters no
// matter how the query is phrased. This checks whether the endpoint this
// codebase already uses to import a seller's OWN catalog
// (offers/api/v1/offer/details, via fetchOfferDetails/listCatalogWithStatus)
// carries an image field at all -- if it does, the backfill can be rebuilt on
// it instead of the marketplace search.
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
    .select('kaspi_sku, kaspi_master_sku, product_name')
    .eq('connection_id', connection.id)
    .is('image_url', null)
    .limit(3)

  const details = []
  for (const product of products || []) {
    const raw = await fetchOfferDetails(connection.sessionCookies, connection.merchantId, product.kaspi_sku)
    const keys = raw ? Object.keys(raw) : []
    const imageish = keys.filter(k => /image|photo|picture|pic|media/i.test(k))
    details.push({
      sku: product.kaspi_sku,
      название: product.product_name,
      найденоВОтвете: !!raw,
      всеПоля: keys,
      похожиеНаФото: Object.fromEntries(imageish.map(k => [k, raw![k]])),
    })
  }

  // Same question against the OTHER own-catalog endpoint (the one that
  // imports the whole catalog on connect), one page.
  const { offers, sessionExpired } = await listCatalogWithStatus(connection.sessionCookies, connection.merchantId)
  const sample = offers[0] as unknown as Record<string, unknown> | undefined

  return NextResponse.json({
    магазин: connection.companyName,
    offerDetails: details,
    listCatalog: {
      сессияИстекла: sessionExpired,
      всегоНашлось: offers.length,
      полейВПервомТоваре: sample ? Object.keys(sample) : [],
    },
  }, { headers: { 'content-type': 'application/json; charset=utf-8' } })
}
