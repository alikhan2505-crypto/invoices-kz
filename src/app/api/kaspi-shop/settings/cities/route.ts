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

// Kaspi's own list is 200+ entries (confirmed live: 320 distinct city_code
// values on the ABIL-SISTERS account). The design doc calls for a seller-
// picked "subset of important cities," and nothing previously enforced
// that -- a seller could click through the entire list, and each tracked
// city means a real per-cycle fetch + potential push (final-review
// finding I3). 15 comfortably covers "major cities + a few extras" while
// keeping a single product's worst-case per-cycle fetch loop bounded.
const MAX_TRACKED_CITIES = 15

// city_lookup_cache can be empty (never seeded, e.g. the account connected
// before this cache existed) even though the store already has real
// per-city data -- kaspi_shop_product_city_prices is populated at connect
// time regardless of whether the name lookup ever ran. Used as the
// design-doc-promised raw-code fallback so the picker is never just empty:
// sampling a handful of products is enough, since Kaspi's per-product
// allCityPrices covers the same national city list for every product
// (confirmed live: a single product already carries all 320 distinct
// codes for this connection) -- no need to scan all ~44k rows.
async function fallbackCityCodes(connectionId: string): Promise<string[]> {
  const { data: products } = await supabase
    .from('kaspi_shop_tracked_products')
    .select('id')
    .eq('connection_id', connectionId)
    .limit(3)
  const productIds = (products || []).map((p: any) => p.id)
  if (productIds.length === 0) return []
  const { data: rows } = await supabase
    .from('kaspi_shop_product_city_prices')
    .select('city_code')
    .in('tracked_product_id', productIds)
    .limit(2000)
  return Array.from(new Set((rows || []).map((r: any) => r.city_code as string)))
}

// Reads the picker's source of truth: real names from city_lookup_cache
// when available, lazily seeding it on-demand when it's empty (covers any
// account connected before finalizeConnection seeded this cache on
// connect -- e.g. the live ABIL-SISTERS account, which will not be
// reconnected just to backfill this), and falling back to raw city codes
// (final-review finding C1) when no names can be obtained at all -- e.g.
// no session_cookies, or Kaspi's name lookup fails/returns nothing. Never
// blocks: worst case the picker shows codes instead of names.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connection, error } = await supabase
    .from('kaspi_shop_connections')
    .select('id, merchant_id, session_cookies, city_lookup_cache')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 404 })

  let names: Record<string, string> = connection.city_lookup_cache || {}

  if (Object.keys(names).length === 0 && connection.session_cookies) {
    try {
      const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')
      const fetched = await fetchCityNames(sessionCookies, connection.merchant_id)
      if (Object.keys(fetched).length > 0) {
        names = fetched
        await supabase.from('kaspi_shop_connections').update({ city_lookup_cache: names }).eq('id', connection.id)
      }
    } catch (err: any) {
      console.error('kaspi-shop settings/cities GET: on-demand cache refresh failed (non-fatal)', err.message)
    }
  }

  let cities: { code: string; name: string }[]
  if (Object.keys(names).length > 0) {
    cities = Object.entries(names).map(([code, name]) => ({ code, name: String(name) }))
  } else {
    const codes = await fallbackCityCodes(connection.id)
    cities = codes.map(code => ({ code, name: code }))
  }
  cities.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return NextResponse.json({ cities })
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
  if (trackedCityCodes.length > MAX_TRACKED_CITIES) {
    return NextResponse.json({ error: `trackedCityCodes: maximum ${MAX_TRACKED_CITIES} cities allowed` }, { status: 400 })
  }

  const { data: connection, error } = await supabase
    .from('kaspi_shop_connections')
    .update({ tracked_city_codes: trackedCityCodes })
    .eq('user_id', user.id)
    .select('id, merchant_id, session_cookies')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 404 })

  if (connection.session_cookies) {
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
