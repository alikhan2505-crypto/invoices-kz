import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCfoDigest } from '@/lib/cfo/digestSend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MESSAGES: Record<string, string> = {
  no_company: 'Кабинет CFO ещё не создан',
  no_telegram: 'Telegram не подключён — подключите его в Профиль → Уведомления',
  no_accounts: 'Сначала добавьте счёт в кабинете',
}

// «Отправить сводку сейчас» из настроек кабинета — только себе: user берётся из
// токена, чужой id передать нельзя.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken ? await supabaseAuth.auth.getUser(accessToken) : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await sendCfoDigest(supabase, user.id)
    if (result !== 'sent') return NextResponse.json({ error: MESSAGES[result] }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('api/cfo/digest failed for user', user.id, ':', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Не удалось собрать сводку' }, { status: 500 })
  }
}
