import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Еженедельная сводка по всей платформе для основателя: понедельник
// 04:00 UTC = 09:00 в Алматы. Вся воронка одним сообщением в Telegram,
// без захода в админку: регистрации, счета, бесплатные инструменты,
// диалоги ИИ, заказы Kaspi Shop. Получатели — админы с привязанным
// Telegram (на практике это основатель; у тестового админа chat_id нет).
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const sinceDay = since.slice(0, 10)

  // Каждая метрика независима: сбой одной не должен ронять всю сводку,
  // поэтому любые ошибки превращаются в «н/д», а не в 500.
  const count = async (table: string, filter?: (q: any) => any): Promise<number | null> => {
    try {
      let q: any = supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', since)
      if (filter) q = filter(q)
      const { count: n, error } = await q
      return error ? null : n ?? 0
    } catch { return null }
  }

  const [signups, invoicesNew, invoicesPaid, leads, dialogs, orders] = await Promise.all([
    count('profiles'),
    count('invoices'),
    count('invoices', q => q.eq('status', 'paid')),
    count('tool_leads'),
    count('ai_agent_conversations'),
    count('kaspi_shop_orders'),
  ])

  // Сумма новых счетов и проверки контрагента — отдельными запросами:
  // им нужны данные, а не только счётчик строк.
  let invoiceSum: number | null = null
  try {
    const { data, error } = await supabase.from('invoices').select('amount').gte('created_at', since)
    invoiceSum = error ? null : (data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  } catch { /* н/д */ }

  let kontragentChecks: number | null = null
  try {
    // С 14.10 в той же таблице живут и другие счётчики /tools — КП (kp:) и
    // поиск названия по БИН (lookup:, до него kp-lookup:). У всех них видимый
    // префикс с двоеточием, а ключ проверки контрагента — голый sha256 без
    // двоеточия (src/lib/toolQuota.ts), поэтому считаем только ключи без «:».
    const { data, error } = await supabase.from('tool_kontragent_checks').select('count').gte('day', sinceDay)
      .not('key', 'like', '%:%')
    kontragentChecks = error ? null : (data ?? []).reduce((s, r) => s + (Number(r.count) || 0), 0)
  } catch { /* н/д */ }

  const fmt = (n: number | null) => (n === null ? 'н/д' : String(n))
  const tenge = (n: number | null) => (n === null ? 'н/д' : `${Math.round(n).toLocaleString('ru-RU')} ₸`)

  const text = [
    '📊 invoices.kz — неделя одним взглядом',
    '',
    `👤 Регистрации: ${fmt(signups)}`,
    `🧾 Счета: ${fmt(invoicesNew)} новых на ${tenge(invoiceSum)}, оплачено ${fmt(invoicesPaid)}`,
    `🔎 Проверка контрагента: ${fmt(kontragentChecks)} проверок`,
    `🧲 Лиды из инструментов: ${fmt(leads)}`,
    `🤖 Новые диалоги ИИ-агента: ${fmt(dialogs)}`,
    `📦 Заказы Kaspi Shop: ${fmt(orders)}`,
    '',
    'Детали — в /admin.',
  ].join('\n')

  const { data: admins, error } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('is_admin', true)
    .not('telegram_chat_id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  for (const a of admins ?? []) {
    try {
      await sendTelegramNotification(String(a.telegram_chat_id), text)
      sent++
    } catch (e) {
      console.error('cron/weekly-digest: send failed:', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ success: true, sent })
}
