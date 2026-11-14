import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { performBinLookup } from '@/lib/binLookupServer'
import { almatyQuarter, claimQuotaSlot, registryLoadToday, REGISTRY_DAILY_GLOBAL, releaseCounterSlot, sha256Hex } from '@/lib/toolQuota'
import {
  BOT_FREE_PER_QUARTER, BOT_TOOL_LINK, BUSY_TEXT, HELP_TEXT, NOT_A_BIN_TEXT, NOT_FOUND_TEXT, START_TEXT,
  UNAVAILABLE_TEXT, formatCheckReply, limitText, parseBotInput,
} from '@/lib/binBot/format'
import { parseStartSource } from '@/lib/binBot/links'

// Telegram-бот «Проверка БИН» (30.10.2026): присылаешь 12 цифр, получаешь короткий результат из
// открытых реестров, как на /tools/kontragent. Нужны два секрета в окружении (Vercel):
//   TELEGRAM_BIN_BOT_TOKEN  - токен бота от BotFather;
//   TELEGRAM_BIN_BOT_SECRET - случайная строка, её же передаём в setWebhook как secret_token.
// Пока их нет, маршрут отвечает 503 и ничего не делает. Лимит: BOT_FREE_PER_QUARTER проверок
// на человека (Telegram id) в квартал, плюс общий дневной предохранитель квоты реестров,
// общий с сайтом. Ответ отправляется ПОСЛЕ ответа Telegram (after), чтобы он не повторял доставку.

export const dynamic = 'force-dynamic'
// Литерал: Next 16 не раскрывает импортированную константу (ловушка из src/lib/binWatch/config.ts).
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

async function send(token: string, chatId: number, text: string, withButton = false): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(withButton ? { reply_markup: { inline_keyboard: [[{ text: 'Полная проверка и слежение за БИН', url: BOT_TOOL_LINK }]] } } : {}),
      }),
    })
  } catch (err) {
    console.error('bin-bot: sendMessage failed:', err instanceof Error ? err.message : err)
  }
}

// Своя аналитика (tool_events): проверка из бота считается документом инструмента с меткой tg_bot.
async function logCheck(): Promise<void> {
  const { error } = await supabase.from('tool_events').insert({
    event: 'doc', tool: 'kontragent', lang: 'ru', internal: false,
    utm_source: 'tg_bot', utm_medium: 'bot', utm_campaign: 'kontragent_bot', device: 'mobile',
  })
  if (error) console.error('bin-bot: tool_events insert failed:', error.message)
}

// Откуда пришёл человек (метка из t.me/<бот>?start=<метка>): место показа бота для отчёта.
async function logStart(source: string): Promise<void> {
  const { error } = await supabase.from('tool_events').insert({
    event: 'view', tool: 'kontragent', lang: 'ru', internal: false,
    utm_source: 'tg_bot', utm_medium: 'start', utm_campaign: source, device: 'mobile',
  })
  if (error) console.error('bin-bot: tool_events start insert failed:', error.message)
}

async function handle(token: string, chatId: number, fromId: number, text: unknown): Promise<void> {
  const input = parseBotInput(text)
  if (input.kind === 'start') {
    const source = parseStartSource(text)
    if (source) await logStart(source)
    return send(token, chatId, START_TEXT)
  }
  if (input.kind === 'help') return send(token, chatId, HELP_TEXT)
  if (input.kind === 'other') return send(token, chatId, NOT_A_BIN_TEXT)

  // Ключ без двоеточия, как у проверки на сайте: такие проверки считает дневной предохранитель реестров.
  const key = sha256Hex(`tgbot|${fromId}|${almatyQuarter()}`)
  // Дневной предохранитель смотрим ДО слота: на загруженный день попытка не тратится.
  if ((await registryLoadToday(supabase)) >= REGISTRY_DAILY_GLOBAL) return send(token, chatId, BUSY_TEXT)

  // Слот занимаем ДО похода в реестры и атомарно (compare-and-swap): ответы идут из
  // after(), и человек, быстро шлющий БИН за БИНом, иначе проходит всей пачкой по
  // одному и тому же used=0 и выжигает квоту реестров. Не читается счётчик — отказ.
  const claim = await claimQuotaSlot(supabase, key, BOT_FREE_PER_QUARTER)
  if (!claim.ok) return send(token, chatId, claim.reason === 'limit' ? limitText() : UNAVAILABLE_TEXT)
  const used = claim.used

  const result = await performBinLookup(supabase, input.bin, { extras: true, rnu: true })
  // Реестры не ответили: это не «не найдено», попытку не списываем: слот возвращаем.
  if (!result.found && result.unavailable) {
    await releaseCounterSlot(supabase, key, used + 1)
    return send(token, chatId, UNAVAILABLE_TEXT)
  }

  await logCheck()
  if (!result.found) return send(token, chatId, NOT_FOUND_TEXT)
  const remaining = Math.max(0, BOT_FREE_PER_QUARTER - used - 1)
  return send(token, chatId, formatCheckReply(result.company, remaining), true)
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BIN_BOT_TOKEN
  const expected = process.env.TELEGRAM_BIN_BOT_SECRET
  if (!token || !expected) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const given = req.headers.get('x-telegram-bot-api-secret-token')
  if (!given || !secretsMatch(given, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const update = await req.json().catch(() => null) as {
    message?: { text?: unknown; chat?: { id?: unknown; type?: unknown }; from?: { id?: unknown; is_bot?: boolean } }
  } | null
  const m = update?.message
  const chatId = m?.chat?.id
  const fromId = m?.from?.id
  // Только личные чаты и живые люди; всё остальное (группы, каналы, боты) молча принимаем.
  if (!m || m.chat?.type !== 'private' || m.from?.is_bot || typeof chatId !== 'number' || typeof fromId !== 'number') {
    return NextResponse.json({ ok: true })
  }

  after(async () => {
    try {
      await handle(token, chatId, fromId, m.text)
    } catch (err) {
      console.error('bin-bot: handler failed:', err instanceof Error ? err.message : err)
    }
  })
  return NextResponse.json({ ok: true })
}
