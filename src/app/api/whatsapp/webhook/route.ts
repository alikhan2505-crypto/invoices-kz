import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { loadWhatsAppConnection, handleWhatsAppIncoming } from '@/lib/aiAgent/whatsappWebhookHandler'
import { downloadWhatsAppMedia, sendWhatsAppMessage } from '@/lib/whatsapp'
import { transcribeAudio } from '@/lib/openaiWhisper'
import { isImageWithinLimits, isAudioWithinLimits, UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'

// Inbound WhatsApp Cloud API webhook for every connected customer number --
// mirrors src/app/api/instagram/webhook/route.ts's exact shape (GET verify
// challenge, POST HMAC-signed delivery), just against WhatsApp's payload
// shape instead of Instagram's.

// Meta's one-time verification handshake when the webhook URL is registered
// in the App dashboard -- echoes hub.challenge back once the verify token
// matches, proving we control this URL. Same handshake as the Instagram
// webhook, different verify-token env var (this callback URL is shared by
// every connected WhatsApp number, not per-tenant).
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// Copied from the Instagram webhook's verifySignature -- same timing-safe
// comparison pattern, just against WHATSAPP_APP_SECRET instead of
// INSTAGRAM_APP_SECRET (both are the same underlying Meta app secret, kept
// as separate env vars per-channel by convention, not a shared fallback).
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret || !signatureHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signatureHeader)
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

// Genuine CONTENT message types this pipeline is meant to eventually handle
// or explicitly decline with the polite fallback. Deliberately NOT a true
// else/catch-all: WhatsApp Cloud API delivers several non-content platform
// event kinds inside the same messages[] array with a real `from`/`id`
// (reaction, system, request_welcome, order, button, interactive, its own
// `unsupported` type, etc.) -- most commonly a customer reacting 👍 to the
// bot's own reply. None of those are a message a human is waiting on an
// answer to, so they're silently ignored below rather than answered with
// "can't handle this", matching how Telegram/Instagram already ignore their
// own equivalent non-content event shapes.
const WHATSAPP_CONTENT_TYPES = ['video', 'document', 'sticker', 'location', 'contacts']

interface WhatsAppValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: { profile?: { name?: string }; wa_id?: string }[]
  messages?: {
    from?: string
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    image?: { id?: string; mime_type?: string; caption?: string }
    audio?: { id?: string; mime_type?: string }
  }[]
  statuses?: unknown[]
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: { object?: string; entry?: { id: string; changes?: { field?: string; value?: WhatsAppValue }[] }[] }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true })
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue
      const value = change.value
      // No messages array -- a statuses-only delivery (sent/delivered/read
      // receipts) or some other metadata-only change. Silently skip, same
      // defensive-no-op spirit as every other webhook handler here.
      if (!value?.messages?.length) continue
      const phoneNumberId = value.metadata?.phone_number_id
      if (!phoneNumberId) continue

      const conn = await loadWhatsAppConnection(phoneNumberId)
      if (!conn) {
        console.error('whatsapp webhook: no tenant connection found for phone_number_id', phoneNumberId)
        continue // unknown number -- shouldn't happen, defensive skip
      }

      for (const msg of value.messages) {
        // Can't reply without knowing who to reply to -- defensive skip,
        // same as before this change.
        if (!msg.from || !msg.id) continue

        const contact = value.contacts?.find(c => c.wa_id === msg.from)
        const customerHandle = contact?.profile?.name || msg.from

        try {
          if (msg.type === 'text' && msg.text?.body) {
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: msg.text.body,
            })
            continue
          }

          if (msg.type === 'image' && msg.image?.id) {
            const { buffer, mimeType } = await downloadWhatsAppMedia(msg.image.id, conn.accessToken)
            if (!isImageWithinLimits(buffer.byteLength, mimeType)) {
              await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken })
              continue
            }
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: msg.image.caption?.trim() || '[Фото]',
              media: { kind: 'image', base64: buffer.toString('base64'), mediaType: mimeType.split(';')[0].trim().toLowerCase() },
            })
            continue
          }

          if (msg.type === 'audio' && msg.audio?.id) {
            const { buffer, mimeType } = await downloadWhatsAppMedia(msg.audio.id, conn.accessToken)
            if (!isAudioWithinLimits(buffer.byteLength)) {
              await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken })
              continue
            }
            const transcribedText = await transcribeAudio(buffer, mimeType)
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: transcribedText,
            })
            continue
          }

          // A genuine content type this pipeline doesn't handle yet (video,
          // document, sticker, location, contacts), or a text/image/audio
          // message missing the field it needs -- reply with the polite
          // fallback. Anything else (reaction, system, order, button,
          // interactive, unsupported, or any other event WhatsApp adds
          // later) is a non-content platform event, not a message a human
          // customer is waiting on an answer to -- silently ignored, see
          // WHATSAPP_CONTENT_TYPES above.
          if (msg.type && WHATSAPP_CONTENT_TYPES.includes(msg.type)) {
            await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken })
          }
        } catch (err: any) {
          // A thrown error anywhere above (download, transcription, AI
          // reply, send) must not abort the rest of this webhook delivery's
          // batch (other messages in the same payload) -- log it and try to
          // leave the customer with the same polite fallback rather than
          // silence. The fallback send itself is best-effort: if it also
          // fails (e.g. a dead token), swallow it rather than throw.
          console.error('whatsapp webhook: processing failed for', msg.id, ':', err.message)
          await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken }).catch(() => {})
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
