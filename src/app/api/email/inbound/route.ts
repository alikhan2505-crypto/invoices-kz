import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractInboundEmail, isReceivedEvent, inboundNotificationText } from '@/lib/inboundEmail'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { secretEquals } from '@/lib/secretEquals'
import { verifySvixSignature } from '@/lib/svixSignature'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Receives Resend's email.received webhook and stores the reply.
//
// Why this exists at all: Resend can retrieve a received email by id but has no
// endpoint that lists them, so the id only ever arrives here. Without this
// route a customer's reply is visible in the Resend dashboard and nowhere a
// query can reach.
//
// Authenticated by a token in the query string rather than a header, because a
// webhook endpoint is configured as a bare URL -- there is nowhere to put an
// x-internal-secret. On top of that, when RESEND_WEBHOOK_SECRET is set (the
// signing secret of this webhook in the Resend dashboard, `whsec_...`) the Svix
// signature is verified too (svixSignature.ts). Without the variable only the
// token guards the endpoint, as before; a warning is logged so the gap is visible.
export async function POST(req: NextRequest) {
  const expected = process.env.INBOUND_EMAIL_SECRET
  if (!expected) {
    console.error('email/inbound: INBOUND_EMAIL_SECRET is not set')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }
  if (!secretEquals(req.nextUrl.searchParams.get('token'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Тело читаем строкой: подпись считается по точным байтам, не по разобранному JSON.
  const rawBody = await req.text()
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET
  if (signingSecret) {
    if (!verifySvixSignature(req.headers, rawBody, signingSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.error('email/inbound: RESEND_WEBHOOK_SECRET is not set, the webhook signature is not verified')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Acknowledged, not stored. Returning an error for an event we simply do not
  // want would make Resend retry it indefinitely.
  if (!isReceivedEvent(payload)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const fields = extractInboundEmail(payload)
  if (!fields.resendId) {
    // Still 200: a retry would deliver the same unusable payload. Only the key
    // names are logged (never values: the body is a customer's email), which is
    // enough to read the shape off the runtime logs and teach the extractor the
    // missing key name.
    const keys = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o as object).join(',') : '')
    const inner = (payload as { data?: unknown } | null)?.data
    console.error('email/inbound: no id in payload; keys:', keys(payload), '; data keys:', keys(inner))
    return NextResponse.json({ ok: true, stored: false })
  }

  const { error } = await supabase.from('inbound_emails').upsert({
    resend_id: fields.resendId,
    from_address: fields.from,
    to_address: fields.to,
    subject: fields.subject,
    text_body: fields.text,
    received_at: fields.receivedAt,
    raw: payload as object,
  }, { onConflict: 'resend_id' })

  if (error) {
    // A real failure, so let Resend retry -- it holds the message either way.
    console.error('email/inbound: insert failed:', error.message)
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 })
  }

  // Told immediately rather than on a schedule. The reply IS the event, and
  // Vercel's Hobby plan runs a cron at most once a day -- which would have
  // meant hearing about a customer's answer up to 24 hours late for no
  // reason. Upsert ran first, so a Telegram failure cannot lose the message.
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (chatId) {
    await sendTelegramNotification(chatId, inboundNotificationText(fields))
  } else {
    console.error('email/inbound: TELEGRAM_CHAT_ID is not set, reply stored without a notification')
  }

  return NextResponse.json({ ok: true, stored: true })
}
