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

// Лёгкий опрос для страницы уведомлений: пока открыт шаг «Нажмите Start»,
// страница раз в ~3 с спрашивает, привязался ли чат (вебхук бота пишет
// telegram_chat_id), и показывает «Подключено» без перезагрузки.
// Только свой профиль; сам chat id наружу не отдаётся.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('telegram_chat_id, telegram_connect_token')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })

  return NextResponse.json(
    {
      connected: !!data?.telegram_chat_id,
      // Ссылка подключения выдана и ещё не использована (ждём Start).
      pending: !data?.telegram_chat_id && !!data?.telegram_connect_token,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
