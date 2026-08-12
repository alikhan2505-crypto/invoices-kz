import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'

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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Shop не подключён' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { kaspiSku, productName, brand, storeId, stockCount, ownCurrentPrice, floorPrice, undercutStep, checkFrequencyMinutes } = body
  if (!kaspiSku || !productName || !brand || !storeId || ownCurrentPrice == null || floorPrice == null || undercutStep == null) {
    return NextResponse.json({ error: 'kaspiSku, productName, brand, storeId, ownCurrentPrice, floorPrice и undercutStep обязательны' }, { status: 400 })
  }
  // Number(...) first, then validate the RESULT is a real finite number
  // above zero -- validating the raw input and inserting it unconverted
  // (the brief's original shape) let a non-numeric floorPrice like "abc"
  // slip past `Number("abc") <= 0` (false, since NaN compares false to
  // everything) straight into the insert, defeating the one check this
  // field exists for.
  const floorPriceNum = Number(floorPrice)
  if (!Number.isFinite(floorPriceNum) || floorPriceNum <= 0) {
    return NextResponse.json({ error: 'floorPrice должен быть числом больше нуля' }, { status: 400 })
  }

  const { data, error } = await supabase.from('kaspi_shop_tracked_products').insert({
    connection_id: connection.id,
    user_id: user.id,
    kaspi_sku: kaspiSku,
    product_name: productName,
    brand,
    store_id: storeId,
    stock_count: stockCount ?? 0,
    own_current_price: ownCurrentPrice,
    floor_price: floorPriceNum,
    undercut_step: undercutStep,
    check_frequency_minutes: checkFrequencyMinutes ?? 15,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['floor_price', 'undercut_step', 'check_frequency_minutes', 'enabled', 'stock_count']
  const patch: Record<string, any> = {}
  for (const key of allowed) if (key in updates) patch[key] = updates[key]
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 })

  const { error } = await supabase
    .from('kaspi_shop_tracked_products')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('kaspi_shop_tracked_products').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
