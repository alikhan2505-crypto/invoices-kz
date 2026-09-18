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

  // Must be the canonical host, and the canonical host is the APEX (www now
  // 308s to it, since the 2026-09-05 SEO canonicalization -- this file's own
  // comment used to say the opposite, which was true before that date and
  // silently wrong after it). Telegram treats a redirect as delivery
  // failure rather than following it, so a URL on the wrong side of the
  // redirect drops every update with zero errors anywhere -- the exact same
  // trap already found and fixed twice in the Instagram webhook setup
  // routes (2026-09-07). Found here 2026-09-18 while the planner's Telegram
  // QR login produced complete silence with no logged request at all.
  const webhookUrl = 'https://invoices.kz/api/telegram-notify-webhook'
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
