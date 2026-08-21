import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { importCatalogProducts } from '@/lib/kaspiShop/finalizeConnection'

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

// On-demand catalog re-import for the ACTIVE store -- the same dedup-safe
// import finalizeConnection runs at connect time, without a fresh phone/SMS
// login. Origin (2026-08-21): a product restored to sale after connect-time
// import was invisible in Демпинг until a full reconnect.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Kaspi Магазин не подключён' }, { status: 400 })
  if (!connection.sessionCookies) return NextResponse.json({ error: 'Сессия кабинета Kaspi не активна — переподключитесь' }, { status: 400 })

  const imported = await importCatalogProducts(connection.id, user.id, connection.sessionCookies, connection.merchantId)
  return NextResponse.json({ ok: true, imported })
}
