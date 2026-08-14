import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { listPendingProducts, getPendingCount } from '@/lib/kaspiShop/pendingProducts'

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

  const pageParam = Number(req.nextUrl.searchParams.get('page')) || 1
  const page = pageParam < 1 ? 1 : pageParam

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const [{ products, hasMore, sessionExpired: listExpired }, { count, sessionExpired: countExpired }] = await Promise.all([
    listPendingProducts(connection.sessionCookies, connection.merchantId, page),
    getPendingCount(connection.sessionCookies, connection.merchantId),
  ])
  const sessionExpired = listExpired || countExpired
  if (sessionExpired) await markSessionExpired(connection.id)

  return NextResponse.json({ products, hasMore, count, sessionExpired })
}
