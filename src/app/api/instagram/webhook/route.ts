import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { findMatchingTemplate } from '@/lib/instagramReplyMatch'
import { replyToComment, sendDirectMessage } from '@/lib/instagram'
import { generateAiReply } from '@/lib/instagramAiReply'
import { loadTenantConnection, handleTenantIncoming, handleInstagramFlowButtonClick } from '@/lib/aiAgent/webhookHandler'
import { transcribeAudio } from '@/lib/openaiWhisper'
import { isImageWithinLimits, isAudioWithinLimits, sniffImageMimeType, UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Meta's one-time verification handshake when the webhook URL is registered
// in the App dashboard (see Task 8) — echoes hub.challenge back once the
// verify token matches, proving we control this URL.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.IG_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// fromUsername/incomingText come straight from the Instagram commenter/DM
// sender — untrusted. Telegram's HTML parse_mode renders <a>/<b>/etc., so an
// unescaped value could show the admin a phishing link disguised as part of
// this bot's own message.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appSecret || !signatureHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signatureHeader)
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

async function handleIncoming(params: {
  source: 'comment' | 'dm'
  externalId: string
  fromUsername: string
  incomingText: string
  postCaption?: string
  // Where the reply goes: a comment ID for comments, a sender's IG-scoped
  // user ID for DMs.
  replyTarget: string
}) {
  // Dedup first — Meta can redeliver the same event.
  const { data: existing } = await supabase
    .from('instagram_auto_replies')
    .select('id')
    .eq('external_id', params.externalId)
    .maybeSingle()
  if (existing) return

  const { data: settings } = await supabase
    .from('instagram_autoreply_settings')
    .select('paused')
    .single()

  if (settings?.paused) {
    await supabase.from('instagram_auto_replies').insert({
      source: params.source,
      external_id: params.externalId,
      reply_target: params.replyTarget,
      from_username: params.fromUsername,
      incoming_text: params.incomingText,
      reply_type: 'template',
      status: 'paused',
    })
    return
  }

  // channel NULL applies to both comments and DMs; 'dm'/'comment' scopes a
  // template to only that channel -- a detailed DM template with a link
  // shouldn't fire as a public comment reply, and vice versa (see the
  // comment-brevity fix above). Ordered for a deterministic winner if two
  // templates' trigger_words could both match the same message.
  const { data: templates } = await supabase
    .from('instagram_reply_templates')
    .select('id, trigger_words, reply_text')
    .or(`channel.is.null,channel.eq.${params.source}`)
    .order('created_at', { ascending: true })

  const match = findMatchingTemplate(params.incomingText, templates || [])

  if (match) {
    // Claim the external_id via the unique constraint BEFORE sending —
    // sending first and logging after left a window where a redelivered
    // webhook (the exact case the dedup check exists for) could resend the
    // same reply to a real customer if the log insert failed after a
    // successful send. A concurrent delivery losing the race here hits a
    // 23505 unique violation, which is expected, not an error.
    const { data: claimed, error: claimError } = await supabase
      .from('instagram_auto_replies')
      .insert({
        source: params.source,
        external_id: params.externalId,
        reply_target: params.replyTarget,
        from_username: params.fromUsername,
        incoming_text: params.incomingText,
        reply_text: match.reply_text,
        reply_type: 'template',
        template_id: match.id,
        status: 'sent',
        resolved_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (claimError) {
      if (claimError.code !== '23505') {
        console.error('instagram webhook: failed to claim template-match row for', params.externalId, ':', claimError.message)
      }
      return
    }
    if (!claimed) return

    try {
      if (params.source === 'comment') {
        await replyToComment(params.replyTarget, match.reply_text)
      } else {
        await sendDirectMessage(params.replyTarget, match.reply_text)
      }
    } catch (err: any) {
      // A thrown send error here must not abort the rest of this webhook
      // delivery's batch (other comments/DMs in the same payload) the way
      // an uncaught throw would. The row is already claimed 'sent' even
      // though delivery failed -- logged for investigation, not retried,
      // since a retry risks the double-send this claim was built to avoid.
      console.error('instagram webhook: template reply send failed for', params.externalId, ':', err.message)
    }
    return
  }

  // For DMs, pull prior sent exchanges with this same sender so the AI
  // doesn't re-greet someone mid-conversation. Only replies that actually
  // went out to the customer count as "already said" -- a skipped draft
  // was never seen by them. Comments aren't a continuous conversation the
  // same way, so no history is fetched for them.
  let conversationHistory: { incoming: string; reply: string }[] | undefined
  if (params.source === 'dm') {
    const { data: history } = await supabase
      .from('instagram_auto_replies')
      .select('incoming_text, reply_text')
      .eq('source', 'dm')
      .eq('reply_target', params.replyTarget)
      .in('status', ['sent', 'sent_after_review'])
      .order('created_at', { ascending: true })
      .limit(5)
    conversationHistory = (history || [])
      .filter((h): h is { incoming_text: string; reply_text: string } => !!h.reply_text)
      .map(h => ({ incoming: h.incoming_text, reply: h.reply_text }))
  }

  // No template — draft with AI, send to Telegram for approval. Never
  // published automatically. generateAiReply doesn't catch its own errors
  // (by design, see Task 4) — a transient Anthropic failure must not crash
  // this handler or the rest of the batch, so it's caught here. Nothing is
  // inserted on failure, so Meta's webhook redelivery will retry it.
  let draftReply: string
  let urgent: boolean
  try {
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      postCaption: params.postCaption,
      source: params.source,
      conversationHistory,
      businessContextLine: 'Ты отвечаешь от имени бизнес-аккаунта в Instagram (invoices.kz — сервис для выставления счетов в Казахстане).',
    })
    draftReply = result.replyText
    urgent = result.urgent
  } catch (err: any) {
    console.error('instagram webhook: AI reply generation failed for', params.externalId, ':', err.message)
    return
  }

  const { data: inserted } = await supabase
    .from('instagram_auto_replies')
    .insert({
      source: params.source,
      external_id: params.externalId,
      reply_target: params.replyTarget,
      from_username: params.fromUsername,
      incoming_text: params.incomingText,
      reply_text: draftReply,
      reply_type: 'ai',
      status: 'pending_review',
      is_urgent: urgent,
    })
    .select()
    .single()
  if (!inserted) return

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const sourceLabel = params.source === 'comment' ? 'комментарий' : 'сообщение (DM)'
  const urgentPrefix = urgent ? '🔴 СРОЧНО — похоже на жалобу/негатив, лучше ответить самому\n\n' : ''
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${urgentPrefix}💬 Новый ${sourceLabel} от <b>${escapeHtml(params.fromUsername)}</b>:\n"${escapeHtml(params.incomingText)}"\n\n<b>Черновик ответа:</b>\n${escapeHtml(draftReply)}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Отправить', callback_data: `ig_reply_send:${inserted.id}` },
          { text: '❌ Пропустить', callback_data: `ig_reply_skip:${inserted.id}` },
        ]],
      },
    }),
  })
  const tgData = await tgRes.json()
  if (tgData.ok) {
    await supabase
      .from('instagram_auto_replies')
      .update({ telegram_chat_id: String(chatId), telegram_message_id: tgData.result.message_id })
      .eq('id', inserted.id)
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  for (const entry of payload.entry || []) {
    // entry.id is the Instagram-scoped account id the event occurred on --
    // a Meta app has exactly one webhook callback URL per subscribed
    // object, so every connected account's events (the single-tenant
    // invoices.kz one AND every multi-tenant customer's one) arrive here.
    const accountId = entry.id
    const isLegacyAccount = accountId === process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

    let tenantConnection: Awaited<ReturnType<typeof loadTenantConnection>> = null
    if (!isLegacyAccount) {
      tenantConnection = await loadTenantConnection(accountId)
      if (!tenantConnection) {
        console.error('instagram webhook: no tenant connection found for entry.id', accountId)
        continue // unknown account -- shouldn't happen, defensive skip
      }
    }
    const ownAccountId = isLegacyAccount ? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID : tenantConnection!.externalAccountId

    for (const change of entry.changes || []) {
      if (change.field !== 'comments') continue
      const value = change.value
      if (!value?.id || !value?.text) continue
      // Self-reply-loop guard, now per-account instead of a single global
      // env var -- see the 2026-08-11 incident in this feature's own
      // history for why this check exists at all.
      if (value.from?.id && value.from.id === ownAccountId) continue

      if (isLegacyAccount) {
        await handleIncoming({
          source: 'comment',
          externalId: value.id,
          fromUsername: value.from?.username || 'unknown',
          incomingText: value.text,
          replyTarget: value.id,
        })
      } else {
        await handleTenantIncoming(tenantConnection!, {
          source: 'comment',
          externalId: value.id,
          fromUsername: value.from?.username || 'unknown',
          incomingText: value.text,
          replyTarget: value.id,
        })
      }
    }

    for (const messaging of entry.messaging || []) {
      const msg = messaging.message
      if (!msg?.mid || msg.is_echo) continue

      const fromUsername = messaging.sender?.id || 'unknown'
      const replyTarget = messaging.sender?.id

      const quickReplyPayload = msg.quick_reply?.payload
      if (quickReplyPayload && replyTarget && !isLegacyAccount) {
        await handleInstagramFlowButtonClick(tenantConnection!, { externalId: msg.mid, replyTarget, clickedPayload: quickReplyPayload })
        continue
      }

      if (isLegacyAccount) {
        // Legacy single-tenant bot -- explicitly out of scope for photo/
        // voice support (see the design spec's "Явно не входит в объём").
        // Text-only, unchanged from before this change.
        if (!msg.text) continue
        await handleIncoming({
          source: 'dm',
          externalId: msg.mid,
          fromUsername,
          incomingText: msg.text,
          replyTarget,
        })
        continue
      }

      if (typeof msg.text === 'string' && msg.text) {
        await handleTenantIncoming(tenantConnection!, {
          source: 'dm',
          externalId: msg.mid,
          fromUsername,
          incomingText: msg.text,
          replyTarget,
        })
        continue
      }

      // No text -- check for a photo/audio attachment. Can't reply without
      // a sender id or a fetchable attachment url -- defensive skip.
      const attachment = Array.isArray(msg.attachments) ? msg.attachments[0] : undefined
      if (!replyTarget || !attachment?.payload?.url) continue

      try {
        if (attachment.type === 'image') {
          const res = await fetch(attachment.payload.url)
          if (!res.ok) throw new Error(`attachment fetch failed (HTTP ${res.status})`)
          const buffer = Buffer.from(await res.arrayBuffer())
          const mimeType = sniffImageMimeType(buffer)
          if (!mimeType || !isImageWithinLimits(buffer.byteLength, mimeType)) {
            await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken })
          } else {
            await handleTenantIncoming(tenantConnection!, {
              source: 'dm',
              externalId: msg.mid,
              fromUsername,
              incomingText: '[Фото]',
              replyTarget,
              media: { kind: 'image', base64: buffer.toString('base64'), mediaType: mimeType },
            })
          }
        } else if (attachment.type === 'audio') {
          const res = await fetch(attachment.payload.url)
          if (!res.ok) throw new Error(`attachment fetch failed (HTTP ${res.status})`)
          const buffer = Buffer.from(await res.arrayBuffer())
          if (!isAudioWithinLimits(buffer.byteLength)) {
            await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken })
          } else {
            // Instagram's own audio-attachment container format isn't
            // documented -- 'audio/mp4' is a best-effort guess, same
            // honesty-over-fabrication spirit as this codebase's other
            // unverified-external-format notes (see e.g.
            // kaspi_shop_repricer_invoices_kz's dbcrfl flag). Whisper
            // generally decodes by content, not strictly by this hint.
            const transcribedText = await transcribeAudio(buffer, 'audio/mp4')
            await handleTenantIncoming(tenantConnection!, {
              source: 'dm',
              externalId: msg.mid,
              fromUsername,
              incomingText: transcribedText,
              replyTarget,
            })
          }
        } else {
          // Any other attachment type (video, file, story reply, etc.)
          await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken })
        }
      } catch (err: any) {
        // A thrown error anywhere above must not abort the rest of this
        // webhook delivery's batch (other messages in the same payload).
        // The fallback send itself is best-effort: if it also fails (e.g.
        // a dead token), swallow it rather than throw.
        console.error('instagram webhook: attachment processing failed for', msg.mid, ':', err.message)
        await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ok: true })
}
