import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { TELEGRAM_TEST_INTERVAL_MS } from '@/lib/notificationPrefs'
import { isMissingSchemaError } from '@/lib/notificationPrefsServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TEXTS = {
  ru: '✅ Тестовое сообщение от invoices.kz. Telegram подключён — уведомления будут приходить сюда. Что именно присылать, настраивается в Профиль → Уведомления.',
  kk: '✅ invoices.kz сынақ хабарламасы. Telegram қосылды — хабарландырулар осында келеді. Нені алатыныңызды Профиль → Хабарландырулар бөлімінде таңдайсыз.',
  en: '✅ Test message from invoices.kz. Telegram is connected — notifications will arrive here. Choose what to receive in Profile → Notifications.',
} as const

// До миграции (нет profiles.telegram_test_sent_at) — ограничение в памяти
// процесса: слабее (у каждого инстанса своё), но лучше, чем никакого.
const memoryLastSent = new Map<string, number>()

// Атомарный захват: из параллельных нажатий отправит только одно, и не
// чаще раза в TELEGRAM_TEST_INTERVAL_MS на аккаунт. 'error' — сбой базы:
// это не «подождите 30 с», а ошибка сервера (страница покажет свою).
async function claimTestSlot(userId: string): Promise<'ok' | 'limited' | 'error'> {
  const now = new Date()
  const since = new Date(now.getTime() - TELEGRAM_TEST_INTERVAL_MS).toISOString()
  const { data, error } = await supabase
    .from('profiles')
    .update({ telegram_test_sent_at: now.toISOString() })
    .eq('id', userId)
    .or(`telegram_test_sent_at.is.null,telegram_test_sent_at.lt."${since}"`)
    .select('id')
  if (!error) return (data?.length ?? 0) > 0 ? 'ok' : 'limited'
  if (!isMissingSchemaError(error, 'telegram_test_sent_at')) {
    console.error('telegram-connect/test: rate-limit claim failed for user', userId, ':', error.message)
    return 'error'
  }
  const last = memoryLastSent.get(userId) ?? 0
  if (now.getTime() - last < TELEGRAM_TEST_INTERVAL_MS) return 'limited'
  memoryLastSent.set(userId, now.getTime())
  return 'ok'
}

// Кнопка «Отправить тестовое сообщение» на странице уведомлений: шлёт в
// УЖЕ привязанный чат владельца (адрес берётся только из его профиля —
// получателя из запроса не принимаем).
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let lang: keyof typeof TEXTS = 'ru'
  try {
    const body = await req.json()
    if (body && (body.lang === 'kk' || body.lang === 'en' || body.lang === 'ru')) lang = body.lang
  } catch { /* пустое тело — по-русски */ }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  if (!profile?.telegram_chat_id) return NextResponse.json({ error: 'not_connected' }, { status: 409 })

  const slot = await claimTestSlot(user.id)
  if (slot === 'error') return NextResponse.json({ error: 'rate_limit_check_failed' }, { status: 500 })
  if (slot === 'limited') {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSeconds: Math.ceil(TELEGRAM_TEST_INTERVAL_MS / 1000) },
      { status: 429 },
    )
  }

  const sent = await sendTelegramNotification(profile.telegram_chat_id, TEXTS[lang], { timeoutMs: 8000 })
  // Telegram отказал (например, бот заблокирован в чате) — честно говорим,
  // чтобы страница предложила переподключить бота.
  if (!sent) return NextResponse.json({ error: 'send_failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
