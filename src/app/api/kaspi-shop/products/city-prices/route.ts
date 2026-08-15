import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Only shows the store's tracked_city_codes, not all ~150+ imported city
// rows -- those are the only cities this feature actively manages, so
// they're the only ones worth showing the seller.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trackedProductId = req.nextUrl.searchParams.get('id')
  if (!trackedProductId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: product, error: productError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id, connection_id, kaspi_shop_connections(tracked_city_codes, city_lookup_cache)')
    .eq('id', trackedProductId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: 'Не удалось загрузить цены по городам' }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  const connection: any = product.kaspi_shop_connections
  const trackedCityCodes: string[] = connection?.tracked_city_codes || []
  const cityNames: Record<string, string> = connection?.city_lookup_cache || {}

  const { data: cityRows, error: cityError } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('city_code, own_current_price, last_competitor_price, market_position, market_offer_count')
    .eq('tracked_product_id', trackedProductId)
    .in('city_code', trackedCityCodes)
  if (cityError) return NextResponse.json({ error: 'Не удалось загрузить цены по городам' }, { status: 500 })

  const cities = (cityRows || []).map(c => ({
    cityCode: c.city_code,
    cityName: cityNames[c.city_code] || c.city_code,
    ownPrice: Number(c.own_current_price),
    competitorPrice: c.last_competitor_price !== null ? Number(c.last_competitor_price) : null,
    marketPosition: c.market_position !== null ? Number(c.market_position) : null,
    marketOfferCount: c.market_offer_count !== null ? Number(c.market_offer_count) : null,
  }))

  return NextResponse.json({ cities })
}
