import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { searchCatalogProducts } from '@/lib/kaspiShop/addProduct'
import { pickCatalogImage, imageSearchQueries } from '@/lib/kaspiShop/productImages'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// One call handles this many products. Kaspi's cabinet search is a real
// endpoint behind a session, not a bulk API, so a 194-product catalogue is
// walked over several calls rather than one long request that would sit past
// the serverless timeout and hammer Kaspi in a burst.
const BATCH = 20

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Fills image_url on tracked products from Kaspi's own catalogue cards.
//
// The existing backfill reads photos off ORDER ITEMS, so a product only gets
// one after it has sold — 11 of 194 on the live account. That leaves the AI
// agent with nothing to attach for most of a catalogue. Kaspi's cabinet search
// returns previewImages for any card, sold or not.
//
// Idempotent: only rows with no image are touched, so re-running costs nothing
// and picks up whatever the previous call did not reach.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const { data: products, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, product_name, kaspi_master_sku')
    .eq('connection_id', connection.id)
    .is('image_url', null)
    .limit(BATCH)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count: remainingBefore } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', connection.id)
    .is('image_url', null)

  let filled = 0
  let notFound = 0

  for (const product of products || []) {
    const queries = imageSearchQueries({
      masterSku: product.kaspi_master_sku,
      productName: product.product_name || '',
    })
    let imageUrl: string | null = null

    for (const query of queries) {
      const result = await searchCatalogProducts(connection.sessionCookies, connection.merchantId, query)
      if (result.sessionExpired) {
        // Stop rather than burn the rest of the batch against a dead session,
        // and surface it the same way every other Kaspi Shop route does.
        await markSessionExpired(connection.id)
        return NextResponse.json({
          error: 'Сессия Kaspi истекла — переподключите кабинет',
          filled,
          notFound,
        }, { status: 400 })
      }
      imageUrl = pickCatalogImage(product.kaspi_master_sku, result.products)
      if (imageUrl) break
    }

    if (!imageUrl) {
      notFound++
      continue
    }
    const { error: updateError } = await supabase
      .from('kaspi_shop_tracked_products')
      .update({ image_url: imageUrl })
      .eq('id', product.id)
    if (updateError) {
      console.error('kaspi-shop backfill-images: update failed for', product.id, ':', updateError.message)
      continue
    }
    filled++
  }

  return NextResponse.json({
    processed: (products || []).length,
    filled,
    // Cards Kaspi's search did not return under either query, most often
    // because the card was removed from the catalogue after the seller listed
    // against it. Re-running will not help these.
    notFound,
    remaining: Math.max(0, (remainingBefore || 0) - filled),
  })
}
