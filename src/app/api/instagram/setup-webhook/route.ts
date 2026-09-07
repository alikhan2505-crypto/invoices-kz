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

  // Must be the canonical host, and the canonical host is the APEX. Telegram
  // treats a redirect as a delivery failure rather than following it, so a URL
  // on the wrong side of the redirect silently drops every update.
  //
  // This used to point at www, with a comment stating the bare domain
  // redirected there. That was true when it was written; the canonical host was
  // switched to the apex on 2026-09-05 (www now 308s to it), which inverted the
  // redirect and killed every button press on an Instagram draft without a
  // single error anywhere. Found 2026-09-07 after the identical trap in the
  // Instagram webhook subscription.
  const webhookUrl = 'https://invoices.kz/api/instagram/telegram-webhook'
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.IG_AUTOMATION_SECRET,
      allowed_updates: ['callback_query', 'message'],
    }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
