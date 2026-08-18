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

const TYPE_LABELS: Record<string, string> = {
  topup: 'Пополнение',
  commission: 'Комиссия за оплату счёта',
  kaspi_shop_check: 'Kaspi Магазин: проверка цены',
  ai_agent_reply: 'ИИ-агент: ответ',
}

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('type, amount, note, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries = (data || []).map(row => ({
    label: row.note || TYPE_LABELS[row.type] || row.type,
    amount: Number(row.amount),
    createdAt: row.created_at,
  }))

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('wallet_ledger')
    .select('type, amount')
    .eq('user_id', user.id)
    .gte('created_at', since)
  const breakdown: Record<string, number> = { topup: 0, commission: 0, kaspi_shop_check: 0, ai_agent_reply: 0 }
  for (const row of recent || []) {
    if (row.type in breakdown) breakdown[row.type] += Math.abs(Number(row.amount))
  }
  return NextResponse.json({ entries, breakdown })
}
