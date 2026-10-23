import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { escapeHtml } from '@/lib/htmlEscape'
import { hookSecretOk } from '@/lib/hooksGuard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Мгновенный пинг основателю о новой регистрации. Зовётся триггером БД
// notify_new_signup_trigger (pg_net) сразу после вставки строки profiles.
//
// Секрета у эндпоинта сознательно нет — вместо него три ограничителя,
// которых достаточно для «отправить одно уведомление»:
//  1. нужен настоящий uuid существующего профиля (неугадываем);
//  2. профиль должен быть моложе часа — старыми id спамить нельзя;
//  3. атомарный claim по signup_notified_at: один профиль = один пинг,
//     сколько бы раз эндпоинт ни дёрнули.
// Если в окружении задан HOOKS_PG_NET_SECRET, то дополнительно нужен заголовок
// x-internal-secret (его должен слать SQL-триггер, см. hooksGuard).
export async function POST(req: NextRequest) {
  if (!hookSecretOk(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const userId = typeof body?.user_id === 'string' ? body.user_id : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'bad user_id' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, created_at, signup_notified_at')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (profile.signup_notified_at) return NextResponse.json({ ok: true, already: true })
  if (Date.now() - new Date(profile.created_at).getTime() > 3600_000) {
    return NextResponse.json({ error: 'too old' }, { status: 409 })
  }

  // Атомарный захват: при гонке двух вызовов пинг уйдёт один раз.
  const { data: claimed } = await supabase
    .from('profiles')
    .update({ signup_notified_at: new Date().toISOString() })
    .eq('id', userId)
    .is('signup_notified_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, already: true })

  const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })

  const { data: admins } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('is_admin', true)
    .not('telegram_chat_id', 'is', null)
  for (const a of admins ?? []) {
    try {
      await sendTelegramNotification(
        String(a.telegram_chat_id),
        `🆕 Новая регистрация: ${escapeHtml(profile.email) || 'без email'}${count ? ` (№${count})` : ''}`,
      )
    } catch (e) {
      console.error('hooks/new-signup: telegram failed:', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: true })
}
