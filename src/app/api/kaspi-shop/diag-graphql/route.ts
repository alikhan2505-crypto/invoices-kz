// TEMPORARY DIAGNOSTIC -- checking whether the Order GraphQL type carries a
// destination/city field cheaply, for the orders-list "по городу" grouping
// feature. Removed once confirmed either way.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/kaspiShop/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { data: connection } = await supabase
    .from('kaspi_shop_connections')
    .select('merchant_id, session_cookies')
    .not('session_cookies', 'is', null)
    .limit(1)
    .maybeSingle()
  if (!connection?.session_cookies) return NextResponse.json({ error: 'no connection with session_cookies' }, { status: 400 })
  const sessionCookies = decryptAtRest(connection.session_cookies, getKey()).toString('utf8')

  const opName = body?.opName ? `?opName=${encodeURIComponent(body.opName)}` : ''
  const res = await fetch(`https://mc.shop.kaspi.kz/mc/facade/graphql${opName}`, {
    method: 'POST',
    headers: {
      'x-auth-version': '3',
      'content-type': 'application/json',
      origin: 'https://kaspi.kz',
      referer: 'https://kaspi.kz/',
      cookie: sessionCookies,
    },
    body: JSON.stringify({
      operationName: body?.operationName ?? null,
      variables: body?.variables ?? {},
      query: body?.query,
    }),
  })
  const text = await res.text()
  return NextResponse.json({ status: res.status, merchantId: connection.merchant_id, body: text.slice(0, 8000) })
}
