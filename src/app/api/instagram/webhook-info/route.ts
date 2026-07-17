import { NextRequest, NextResponse } from 'next/server'

// Diagnostic-only: reports Telegram's current webhook registration (URL,
// allowed_updates, last delivery error) so misconfiguration can be spotted
// without guessing.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
  const data = await res.json()
  return NextResponse.json(data)
}
