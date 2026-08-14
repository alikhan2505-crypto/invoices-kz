import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchCityNames } from '@/lib/kaspiShop/cabinetApi'
import { getKey } from '@/lib/kaspiShop/connection'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Saves the store-wide tracked_city_codes list (the seller's city picker,
// Task 6) and opportunistically refreshes city_lookup_cache from the real
// Kaspi cabinet so the picker can show names instead of raw codes. The cache
// refresh is strictly best-effort: it runs only when session_cookies exist,
// is wrapped so any failure (expired session, upstream error) is logged and
// swallowed, and never affects the response -- the seller's city selection
// must save successfully regardless of whether Kaspi's name lookup works.
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const trackedCityCodes = body?.trackedCityCodes
  if (!Array.isArray(trackedCityCodes) || !trackedCityCodes.every((c: unknown) => typeof c === 'string')) {
    return NextResponse.json({ error: 'trackedCityCodes (string[]) required' }, { status: 400 })
  }

  const { data: connection, error } = await supabase
    .from('kaspi_shop_connections')
    .update({ tracked_city_codes: trackedCityCodes })
    .eq('user_id', user.id)
    .select('id, merchant_id, session_cookies')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (connection?.session_cookies) {
    try {
      const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
      const names = await fetchCityNames(sessionCookies, connection.merchant_id)
      if (Object.keys(names).length > 0) {
        await supabase.from('kaspi_shop_connections').update({ city_lookup_cache: names }).eq('id', connection.id)
      }
    } catch (err: any) {
      console.error('kaspi-shop settings: city name cache refresh failed (non-fatal)', err.message)
    }
  }

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
  return NextResponse.json({ ok: true })
}
