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

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { paused } = body
  if (typeof paused !== 'boolean') return NextResponse.json({ error: 'paused (boolean) required' }, { status: 400 })

  const { error } = await supabase
    .from('kaspi_shop_connections')
    .update({ paused })
    .eq('user_id', user.id)
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Full disconnect -- removes the connection and everything scoped to it
// (tracked products, per-city prices) rather than just clearing session
// cookies, so a later reconnect starts from a clean re-import instead of
// resurrecting settings tied to a cabinet the seller may have deliberately
// walked away from. Deleted explicitly in dependency order rather than
// relying on an assumed ON DELETE CASCADE.
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!connection) return NextResponse.json({ ok: true })

  const { data: products } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id')
    .eq('connection_id', connection.id)
  const productIds = (products || []).map(p => p.id)

  if (productIds.length > 0) {
    await supabase.from('kaspi_shop_product_city_prices').delete().in('tracked_product_id', productIds)
    await supabase.from('kaspi_shop_tracked_products').delete().eq('connection_id', connection.id)
  }
  const { error } = await supabase.from('kaspi_shop_connections').delete().eq('id', connection.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Disconnecting the active store must not leave the user with zero active
  // stores while another one of theirs still exists -- fall back to their
  // oldest remaining connection rather than stranding them.
  const { data: remaining } = await supabase
    .from('kaspi_shop_connections')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (remaining) await supabase.from('kaspi_shop_connections').update({ is_active: true }).eq('id', remaining.id)

  return NextResponse.json({ ok: true })
}
