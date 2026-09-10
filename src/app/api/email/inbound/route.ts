import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractInboundEmail, isReceivedEvent } from '@/lib/inboundEmail'

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
// x-internal-secret. Resend signs its webhooks (Svix) and verifying that
// signature would be stronger; it is not done here because it needs the svix
// verifier as a dependency and the shared secret already makes the endpoint
// unguessable. Worth revisiting if this ever carries anything but replies.
export async function POST(req: NextRequest) {
  const expected = process.env.INBOUND_EMAIL_SECRET
  if (!expected) {
    console.error('email/inbound: INBOUND_EMAIL_SECRET is not set')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }
  if (req.nextUrl.searchParams.get('token') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
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
    // Still 200: a retry would deliver the same unusable payload. The raw body
    // is logged so the shape can be read off the runtime logs and the
    // extractor taught the missing key name.
    console.error('email/inbound: no id in payload:', JSON.stringify(payload).slice(0, 2000))
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, stored: true })
}
