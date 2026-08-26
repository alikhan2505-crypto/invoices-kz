import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { getRefundDetails } from '@/lib/kaspiShop/refunds'

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

// Kaspi's own detail endpoint requires both the refundId (Mongo-style id)
// and the human applicationNumber ("code") together -- passed as a query
// param here since the applicationNumber contains a hyphen+suffix
// ("906725811-1") that would be awkward as a second path segment.
export async function GET(req: NextRequest, { params }: { params: Promise<{ refundId: string }> }) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { refundId } = await params
  const applicationNumber = req.nextUrl.searchParams.get('applicationNumber')?.trim() || ''
  if (!refundId || !applicationNumber) {
    return NextResponse.json({ error: 'refundId и applicationNumber обязательны' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const result = await getRefundDetails(connection.sessionCookies, connection.merchantId, refundId, applicationNumber)
  if (result.sessionExpired) {
    await markSessionExpired(connection.id)
    return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
  }
  if (!result.detail) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }
  return NextResponse.json({ detail: result.detail })
}
