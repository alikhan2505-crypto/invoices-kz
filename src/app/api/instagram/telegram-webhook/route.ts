import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToInstagram, replyToComment, sendDirectMessage } from '@/lib/instagram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function telegram(method: string, body: object) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Telegram calls this for every bot update. We only act on the two inline
// buttons attached to a post draft (see /api/instagram/draft) — everything
// else is ignored. Registered once via /api/instagram/setup-webhook.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || secret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const update = await req.json()

  // A text reply to a draft's photo message is saved as feedback for Claude to
  // read at its next content-generation pass — it does not change this draft
  // or auto-regenerate anything (there's no model running inside this webhook).
  const msg = update.message
  if (msg && typeof msg.text === 'string' && msg.reply_to_message?.message_id) {
    if (String(msg.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true })
    }
    const { data: draft } = await supabase
      .from('instagram_drafts')
      .select('id, status')
      .eq('telegram_message_id', msg.reply_to_message.message_id)
      .maybeSingle()
    if (draft && draft.status === 'pending') {
      await supabase.from('instagram_drafts').update({ feedback: msg.text }).eq('id', draft.id)
      await telegram('sendMessage', {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: '📝 Записал — учту в следующей версии поста. Эта версия остаётся на ваше решение (Опубликовать/Отклонить).',
      })
      return NextResponse.json({ ok: true })
    }

    // A text reply to a pending AI-drafted comment/DM reply overwrites the
    // draft's text before it's sent — the original Send/Skip buttons stay
    // attached to the earlier message and still work against the updated row.
    const { data: pendingReply } = await supabase
      .from('instagram_auto_replies')
      .select('id, status')
      .eq('telegram_message_id', msg.reply_to_message.message_id)
      .maybeSingle()
    if (pendingReply && pendingReply.status === 'pending_review') {
      await supabase.from('instagram_auto_replies').update({ reply_text: msg.text }).eq('id', pendingReply.id)
      await telegram('sendMessage', {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: '✏️ Текст ответа обновлён. Нажмите «✅ Отправить» на исходном сообщении, чтобы опубликовать новую версию.',
      })
    }
    return NextResponse.json({ ok: true })
  }

  // A plain (non-reply) text message from the admin is a task/instruction for
  // Claude to pick up on its next periodic check — not read live, there is no
  // process listening to this webhook in real time. Stored as-is; Claude marks
  // processed_at once it has acted on it.
  if (msg && typeof msg.text === 'string' && !msg.text.startsWith('/')) {
    if (String(msg.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true })
    }
    await supabase.from('admin_telegram_inbox').insert({
      message_text: msg.text,
      telegram_message_id: msg.message_id,
      chat_id: String(msg.chat.id),
    })
    await telegram('sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: '📥 Записал. Увижу в течение ~25 минут на следующей проверке.',
    })
    return NextResponse.json({ ok: true })
  }

  const cb = update.callback_query
  if (!cb || typeof cb.data !== 'string') {
    return NextResponse.json({ ok: true })
  }

  if (String(cb.message?.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  const [action, entityId] = cb.data.split(':')

  if (action === 'ig_reply_send' || action === 'ig_reply_skip') {
    const { data: reply } = await supabase.from('instagram_auto_replies').select('*').eq('id', entityId).single()
    if (!reply || reply.status !== 'pending_review') {
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Уже обработано' })
      return NextResponse.json({ ok: true })
    }

    if (action === 'ig_reply_skip') {
      await supabase
        .from('instagram_auto_replies')
        .update({ status: 'skipped', resolved_at: new Date().toISOString() })
        .eq('id', entityId)
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Пропущено' })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n⏭️ Пропущено`,
        parse_mode: 'HTML',
      })
      return NextResponse.json({ ok: true })
    }

    try {
      if (reply.source === 'comment') {
        await replyToComment(reply.reply_target, reply.reply_text)
      } else {
        await sendDirectMessage(reply.reply_target, reply.reply_text)
      }
      await supabase
        .from('instagram_auto_replies')
        .update({ status: 'sent_after_review', resolved_at: new Date().toISOString() })
        .eq('id', entityId)
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Отправлено!' })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n✅ Отправлено`,
        parse_mode: 'HTML',
      })
    } catch (err: any) {
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка отправки', show_alert: true })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n⚠️ Ошибка: ${err.message}`,
        parse_mode: 'HTML',
      })
    }
    return NextResponse.json({ ok: true })
  }

  const draftId = entityId
  if (!draftId || (action !== 'ig_publish' && action !== 'ig_reject')) {
    return NextResponse.json({ ok: true })
  }

  const { data: draft } = await supabase.from('instagram_drafts').select('*').eq('id', draftId).single()
  if (!draft || draft.status !== 'pending') {
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Уже обработано' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'ig_reject') {
    await supabase.from('instagram_drafts').update({ status: 'rejected' }).eq('id', draftId)
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Отклонено' })
    await telegram('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `${cb.message.text}\n\n❌ Отклонено`,
      parse_mode: 'HTML',
    })
    return NextResponse.json({ ok: true })
  }

  try {
    const imageUrls: string[] = draft.image_urls?.length ? draft.image_urls : [draft.image_url]
    const igMediaId = await publishToInstagram(imageUrls, draft.caption)
    await supabase
      .from('instagram_drafts')
      .update({ status: 'published', ig_media_id: igMediaId, published_at: new Date().toISOString() })
      .eq('id', draftId)
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Опубликовано!' })
    await telegram('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `${cb.message.text}\n\n✅ Опубликовано в Instagram`,
      parse_mode: 'HTML',
    })
  } catch (err: any) {
    await supabase.from('instagram_drafts').update({ status: 'failed', error: err.message }).eq('id', draftId)
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка публикации', show_alert: true })
    await telegram('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `${cb.message.text}\n\n⚠️ Ошибка: ${err.message}`,
      parse_mode: 'HTML',
    })
  }

  return NextResponse.json({ ok: true })
}
