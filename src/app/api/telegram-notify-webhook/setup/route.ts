import { NextRequest, NextResponse } from 'next/server'

// One-time (idempotent — re-running just overwrites Telegram's stored
// webhook config) registration call, run by the user after deploy. Mirrors
// src/app/api/instagram/setup-webhook/route.ts's shape exactly, for the new
// bot/webhook/secret instead of the admin-alerts one.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.TELEGRAM_NOTIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.CUSTOMER_TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'CUSTOMER_TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
  }

  // Must be the canonical host — the bare domain 307-redirects to www, and
  // Telegram treats a redirect as delivery failure rather than following it
  // (same gotcha the Instagram webhook setup already documents).
  const webhookUrl = 'https://www.invoices.kz/api/telegram-notify-webhook'
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_NOTIFY_WEBHOOK_SECRET,
      allowed_updates: ['message'],
    }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
