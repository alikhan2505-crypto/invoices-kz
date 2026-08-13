import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { suggestPricingRule } from '@/lib/kaspiShop/suggestPricingRule'

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

// Returns a suggestion only -- never writes it. The seller applies it
// explicitly via the existing PATCH /api/kaspi-shop/products path.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { productId, ownCost } = body
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 })

  const { data: product, error: productError } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('product_name, kaspi_category, brand')
    .eq('id', productId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })

  const { data: cityPrices, error: cityPricesError } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('last_competitor_price')
    .eq('tracked_product_id', productId)
  if (cityPricesError) return NextResponse.json({ error: cityPricesError.message }, { status: 500 })

  const competitorPrices = (cityPrices || [])
    .map(r => Number(r.last_competitor_price))
    .filter(n => Number.isFinite(n) && n > 0)

  try {
    const suggestion = await suggestPricingRule({
      productTitle: product.product_name,
      category: product.kaspi_category || product.brand || 'общая категория',
      competitorPrices,
      ownCost: ownCost != null ? Number(ownCost) : undefined,
    })
    return NextResponse.json(suggestion)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
