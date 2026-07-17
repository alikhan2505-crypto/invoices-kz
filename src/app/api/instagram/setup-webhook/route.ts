import { NextRequest, NextResponse } from 'next/server'

// One-time setup call: registers our webhook URL with Telegram so button
// presses on post drafts reach /api/instagram/telegram-webhook. Re-running
// this is harmless — Telegram just overwrites the existing webhook config.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
  }

  const webhookUrl = 'https://invoices.kz/api/instagram/telegram-webhook'
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.IG_AUTOMATION_SECRET,
      allowed_updates: ['callback_query'],
    }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
