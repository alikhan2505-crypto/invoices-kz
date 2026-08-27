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

// Across ALL of the caller's stores (not just the currently active one) --
// a seller who switches active stores must still see every past storefront
// order, same reasoning as why publish state itself isn't tied to is_active.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connections, error: connError } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', user.id)
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 })
  const connectionIds = (connections || []).map(c => c.id)
  if (connectionIds.length === 0) return NextResponse.json({ orders: [] })

  const { data: rows, error: ordersError } = await supabase
    .from('kaspi_shop_orders')
    .select('id, product_name, price, buyer_name, buyer_phone, buyer_address, status, created_at')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: false })
  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 })

  const orders = (rows || []).map(r => ({
    id: r.id,
    productName: r.product_name,
    price: Number(r.price),
    buyerName: r.buyer_name,
    buyerPhone: r.buyer_phone,
    buyerAddress: r.buyer_address,
    status: r.status,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ orders })
}
