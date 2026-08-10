import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { findMatchingTemplate } from '@/lib/instagramReplyMatch'
import { replyToComment, sendDirectMessage } from '@/lib/instagram'
import { generateAiReply } from '@/lib/instagramAiReply'

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

  const { data: templates } = await supabase
    .from('instagram_reply_templates')
    .select('id, trigger_words, reply_text')

  const match = findMatchingTemplate(params.incomingText, templates || [])

  if (match) {
    if (params.source === 'comment') {
      await replyToComment(params.replyTarget, match.reply_text)
    } else {
      await sendDirectMessage(params.replyTarget, match.reply_text)
    }
    await supabase.from('instagram_auto_replies').insert({
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
    return
  }

  // No template — draft with AI, send to Telegram for approval. Never
  // published automatically. generateAiReply doesn't catch its own errors
  // (by design, see Task 4) — a transient Anthropic failure must not crash
  // this handler or the rest of the batch, so it's caught here. Nothing is
  // inserted on failure, so Meta's webhook redelivery will retry it.
  let draftReply: string
  try {
    draftReply = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      postCaption: params.postCaption,
    })
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
    })
    .select()
    .single()
  if (!inserted) return

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const sourceLabel = params.source === 'comment' ? 'комментарий' : 'сообщение (DM)'
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `💬 Новый ${sourceLabel} от <b>${params.fromUsername}</b>:\n"${params.incomingText}"\n\n<b>Черновик ответа:</b>\n${draftReply}`,
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
    // Comments arrive under `changes` with field "comments".
    for (const change of entry.changes || []) {
      if (change.field !== 'comments') continue
      const value = change.value
      if (!value?.id || !value?.text) continue
      await handleIncoming({
        source: 'comment',
        externalId: value.id,
        fromUsername: value.from?.username || 'unknown',
        incomingText: value.text,
        // Comment payloads don't carry the post's caption directly — fetching
        // it would need a second call to `${GRAPH_API}/${value.media.id}?fields=caption`.
        // Skipped for v1 (postCaption is optional in generateAiReply, and the
        // AI prompt already handles its absence) — left as a real follow-up,
        // not built here, per YAGNI until it's actually needed.
        replyTarget: value.id,
      })
    }

    // DMs arrive under `messaging`.
    for (const messaging of entry.messaging || []) {
      const msg = messaging.message
      if (!msg?.mid || !msg?.text || msg.is_echo) continue
      await handleIncoming({
        source: 'dm',
        externalId: msg.mid,
        fromUsername: messaging.sender?.id || 'unknown',
        incomingText: msg.text,
        replyTarget: messaging.sender?.id,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
