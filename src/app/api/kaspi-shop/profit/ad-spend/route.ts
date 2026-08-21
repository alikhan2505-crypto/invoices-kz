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

const VALID_DAYS = [7, 30, 90]

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const days = Number(body?.days)
  const amount = Number(body?.amount)
  // «Прочие расходы» периода (аренда, электроэнергия, упаковка…) --
  // optional so the legacy ad-only callers keep working; omitted = 0.
  const otherAmount = body?.otherAmount === undefined ? 0 : Number(body?.otherAmount)
  if (!VALID_DAYS.includes(days) || !(amount >= 0) || !(otherAmount >= 0)) {
    return NextResponse.json({ error: 'days (7/30/90) и корректные amount/otherAmount обязательны' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })

  const { error } = await supabase
    .from('kaspi_shop_ad_spend')
    .upsert({ connection_id: connection.id, days, amount, other_amount: otherAmount, updated_at: new Date().toISOString() }, { onConflict: 'connection_id,days' })
  if (error) return NextResponse.json({ error: 'Не удалось сохранить расходы' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
