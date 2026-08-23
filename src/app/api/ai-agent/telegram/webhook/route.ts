import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { parseTelegramUpdate, telegramDedupKey, sendTelegramBotMessage, downloadTelegramMedia } from '@/lib/aiAgent/telegram'
import { loadTelegramConnectionBySecret, handleTelegramIncoming } from '@/lib/aiAgent/telegramWebhookHandler'
import { transcribeAudio } from '@/lib/openaiWhisper'
import { isImageWithinLimits, isAudioWithinLimits, UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'

// Inbound Telegram updates for every connected customer bot. Authenticity
// is verified TWO ways, both against the per-connection webhook_secret
// generated at connect time: the ?secret= query param locates the
// connection row (so the URL itself is unguessable), and the
// X-Telegram-Bot-Api-Secret-Token header -- which Telegram echoes from the
// secret_token we registered via setWebhook and which nobody else can set
// on a genuine Telegram delivery -- must timingSafeEqual the same stored
// secret. Either missing or mismatched -> 401, mirroring the Instagram
// webhook's signature check.

function secretsMatch(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export async function POST(req: NextRequest) {
  const querySecret = req.nextUrl.searchParams.get('secret')
  const headerSecret = req.headers.get('x-telegram-bot-api-secret-token')
  if (!querySecret || !headerSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conn = await loadTelegramConnectionBySecret(querySecret)
  if (!conn || !secretsMatch(headerSecret, conn.webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: unknown
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Same shape as the Instagram webhook: the pipeline is awaited to
  // completion, then 200 -- one text message is one AI reply, well within a
  // route handler's budget. Errors are caught so Telegram always gets its
  // 2xx: a non-2xx makes Telegram redeliver the same update in a retry
  // loop, and dedup would drop the retries anyway once the inbound row is
  // claimed.
  const parsed = parseTelegramUpdate(update)
  try {
    if (parsed.kind === 'start') {
      // /start is a chat-opening handshake, not a question -- a short
      // static greeting, no AI call, no logging, no debit. The agent's real
      // business greeting comes from the AI on the first actual message.
      await sendTelegramBotMessage(conn.botToken, parsed.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    } else if (parsed.kind === 'text') {
      await handleTelegramIncoming(conn, {
        externalId: telegramDedupKey(conn.botId, parsed.updateId),
        chatId: parsed.chatId,
        fromHandle: parsed.fromHandle,
        incomingText: parsed.text,
      })
    } else if (parsed.kind === 'photo') {
      try {
        const buffer = await downloadTelegramMedia(parsed.fileId, conn.botToken)
        // Telegram Bot API always re-encodes photos as JPEG.
        if (!isImageWithinLimits(buffer.byteLength, 'image/jpeg')) {
          await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT)
        } else {
          await handleTelegramIncoming(conn, {
            externalId: telegramDedupKey(conn.botId, parsed.updateId),
            chatId: parsed.chatId,
            fromHandle: parsed.fromHandle,
            incomingText: parsed.caption || '[Фото]',
            media: { kind: 'image', base64: buffer.toString('base64'), mediaType: 'image/jpeg' },
          })
        }
      } catch (mediaErr: any) {
        console.error('ai-agent telegram webhook: photo processing failed:', mediaErr.message)
        await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT).catch(() => {})
      }
    } else if (parsed.kind === 'voice') {
      try {
        const buffer = await downloadTelegramMedia(parsed.fileId, conn.botToken)
        if (!isAudioWithinLimits(buffer.byteLength)) {
          await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT)
        } else {
          // Telegram voice notes are always ogg/opus.
          const transcribedText = await transcribeAudio(buffer, 'audio/ogg')
          await handleTelegramIncoming(conn, {
            externalId: telegramDedupKey(conn.botId, parsed.updateId),
            chatId: parsed.chatId,
            fromHandle: parsed.fromHandle,
            incomingText: transcribedText,
          })
        }
      } catch (mediaErr: any) {
        console.error('ai-agent telegram webhook: voice processing failed:', mediaErr.message)
        await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT).catch(() => {})
      }
    } else if (parsed.kind === 'unsupported') {
      await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT)
    }
    // kind 'ignore' (edits, other bots, other commands): no-op, unchanged.
  } catch (err: any) {
    console.error('ai-agent telegram webhook: processing failed:', err.message)
  }

  return NextResponse.json({ ok: true })
}
