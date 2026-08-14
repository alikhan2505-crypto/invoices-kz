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

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const commissionRatePercent = body?.commissionRatePercent === null ? null : Number(body?.commissionRatePercent)
  if (commissionRatePercent !== null && !(commissionRatePercent >= 0 && commissionRatePercent <= 100)) {
    return NextResponse.json({ error: 'Ставка комиссии должна быть от 0 до 100' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })

  const { error } = await supabase
    .from('kaspi_shop_connections')
    .update({ commission_rate_percent: commissionRatePercent })
    .eq('id', connection.id)
  if (error) return NextResponse.json({ error: 'Не удалось сохранить комиссию' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
