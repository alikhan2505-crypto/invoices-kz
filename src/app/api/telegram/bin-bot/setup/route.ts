import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Одноразовая настройка бота «Проверка БИН» (30.10.2026), по образцу /api/instagram/setup-webhook:
// токен бота живёт только в окружении сервера и не попадает ни в чат, ни в файлы. Защита:
// заголовок x-internal-secret = IG_AUTOMATION_SECRET.
//   GET  - показывает, на кого настроен бот и какой вебхук сейчас стоит (getMe + getWebhookInfo);
//   POST - регистрирует вебхук на /api/telegram/bin-bot с secret_token = TELEGRAM_BIN_BOT_SECRET,
//          только сообщения (allowed_updates), и ставит описание и команды бота.

export const dynamic = 'force-dynamic'

const WEBHOOK_URL = 'https://invoices.kz/api/telegram/bin-bot'

function authorized(req: NextRequest): boolean {
  const given = req.headers.get('x-internal-secret')
  const expected = process.env.IG_AUTOMATION_SECRET
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function tg(token: string, method: string, body?: unknown): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = process.env.TELEGRAM_BIN_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'TELEGRAM_BIN_BOT_TOKEN is not set' }, { status: 503 })
  const [me, info] = await Promise.all([tg(token, 'getMe'), tg(token, 'getWebhookInfo')])
  const webhook = info.result as { url?: string; pending_update_count?: number; last_error_message?: string } | undefined
  return NextResponse.json({
    bot: me.ok ? (me.result as { username?: string }).username : null,
    secretSet: Boolean(process.env.TELEGRAM_BIN_BOT_SECRET),
    webhookUrl: webhook?.url ?? null,
    pending: webhook?.pending_update_count ?? null,
    lastError: webhook?.last_error_message ?? null,
  })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = process.env.TELEGRAM_BIN_BOT_TOKEN
  const secret = process.env.TELEGRAM_BIN_BOT_SECRET
  if (!token || !secret) return NextResponse.json({ error: 'TELEGRAM_BIN_BOT_TOKEN and TELEGRAM_BIN_BOT_SECRET must be set' }, { status: 503 })

  const hook = await tg(token, 'setWebhook', { url: WEBHOOK_URL, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true })
  if (!hook.ok) return NextResponse.json({ error: 'setWebhook failed', description: hook.description }, { status: 502 })

  // Описание и команды: необязательно, сбой не мешает вебхуку.
  const desc = await tg(token, 'setMyDescription', {
    description: 'Проверка контрагента по БИН: пришлите 12 цифр, и я проверю компанию по открытым реестрам КГД и Минюста. 3 проверки в квартал бесплатно.',
  })
  const cmds = await tg(token, 'setMyCommands', {
    commands: [{ command: 'start', description: 'Как пользоваться' }, { command: 'help', description: 'Подсказка' }],
  })
  return NextResponse.json({ ok: true, webhook: WEBHOOK_URL, description: desc.ok, commands: cmds.ok })
}
