import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToInstagram, replyToComment, sendDirectMessage } from '@/lib/instagram'
import { extractTriggerWords } from '@/lib/instagramAiReply'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'
import { getKey } from '@/lib/aiAgent/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Credentials for posting to our OWN Instagram feed.
//
// Read from the admin's stored Instagram connection rather than
// INSTAGRAM_ACCESS_TOKEN, because that env var is hand-pasted and goes stale
// invisibly: reconnecting the account on 2026-09-07 re-granted its scopes from
// the connect route's list, which had no content_publish, and every approved
// draft then failed with "Application does not have permission for this
// action" while the env token still looked present and valid.
//
// Returns undefined when there is no admin connection, so publishToInstagram
// falls back to the env token exactly as before.
// Walked in three plain steps rather than one nested select. ai_agents.user_id
// references auth.users, not public.profiles, so PostgREST has no relationship
// to traverse between them: the nested form failed with PGRST200, the lookup
// returned undefined, and publishing quietly fell back to the stale env token —
// which is exactly the failure this function exists to prevent, reported as an
// unchanged "Application does not have permission for this action".
async function loadPublishCredentials(): Promise<{ igUserId: string; accessToken: string } | undefined> {
  const { data: admins, error: adminError } = await supabase
    .from('profiles').select('id').eq('is_admin', true)
  if (adminError || !admins?.length) {
    console.error('instagram publish: no admin profile found:', adminError?.message)
    return undefined
  }

  const { data: agents, error: agentError } = await supabase
    .from('ai_agents').select('id').in('user_id', admins.map(a => a.id))
  if (agentError || !agents?.length) {
    console.error('instagram publish: no agent for an admin:', agentError?.message)
    return undefined
  }

  const { data, error } = await supabase
    .from('ai_agent_channel_connections')
    .select('external_account_id, access_token_enc')
    .eq('channel', 'instagram')
    .eq('status', 'active')
    .in('agent_id', agents.map(a => a.id))
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('instagram publish: admin connection lookup failed:', error.message)
    return undefined
  }
  if (!data?.access_token_enc || !data?.external_account_id) return undefined
  try {
    return {
      igUserId: data.external_account_id,
      accessToken: decryptAtRest(data.access_token_enc, getKey()).toString('utf8'),
    }
  } catch (err: any) {
    console.error('instagram publish: could not decrypt the connection token:', err?.message || err)
    return undefined
  }
}

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
        // Terminal: 'skipped' is never re-queued. Without this the buttons
        // stayed live in Telegram's UI while every press behind them fell
        // through to the "already handled" answerCallbackQuery toast --
        // easy to miss, so it looked like nothing was happening at all.
        reply_markup: { inline_keyboard: [] },
      })
      return NextResponse.json({ ok: true })
    }

    // Claim the row BEFORE publishing, with the status as the condition, so
    // only one caller can ever send it. The status check above is a
    // read-then-act: when Telegram flushes a queue of button presses at once
    // -- which is exactly what happens after a broken webhook URL is fixed,
    // and what published the same reply twice on 2026-09-07 -- every one of
    // them reads 'pending_review' before any has written, and every one
    // publishes. A conditional UPDATE is a real claim: the losers match zero
    // rows and stop here.
    const { data: claimed } = await supabase
      .from('instagram_auto_replies')
      .update({ status: 'sent_after_review', resolved_at: new Date().toISOString() })
      .eq('id', entityId)
      .eq('status', 'pending_review')
      .select('id')
      .maybeSingle()
    if (!claimed) {
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Уже обработано' })
      return NextResponse.json({ ok: true })
    }

    try {
      if (reply.source === 'comment') {
        await replyToComment(reply.reply_target, reply.reply_text)
      } else {
        await sendDirectMessage(reply.reply_target, reply.reply_text)
      }

      // Turn this approved AI reply into a reusable template, so a similar
      // future message gets an instant reply instead of another AI+approval
      // round trip. Best-effort: a failure here must not affect the reply
      // that was already sent to the customer.
      if (reply.reply_type === 'ai') {
        try {
          const triggerWords = await extractTriggerWords(reply.incoming_text)
          if (triggerWords.length > 0) {
            // Scoped to the channel it was actually written for -- a short
            // comment reply ("напишите в личку") shouldn't later fire as a
            // DM reply, and a detailed DM answer with a link shouldn't spam
            // a public comment thread (see the comment-brevity fix above).
            await supabase.from('instagram_reply_templates').insert({
              trigger_words: triggerWords,
              reply_text: reply.reply_text,
              channel: reply.source,
            })
          }
        } catch (err: any) {
          console.error('telegram-webhook: failed to save AI reply as template for', entityId, ':', err.message)
        }
      }

      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Отправлено!' })
      await telegram('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n✅ Отправлено`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      })
    } catch (err: any) {
      // The claim above already marked this sent. Publishing failed, so hand
      // the draft back to the queue instead of leaving a reply that says
      // "sent" and never reached anyone.
      await supabase
        .from('instagram_auto_replies')
        .update({ status: 'pending_review', resolved_at: null })
        .eq('id', entityId)
      await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка отправки', show_alert: true })
      // No reply_markup here on purpose: the row was just reverted to
      // pending_review above, so the same Send/Skip buttons genuinely work
      // again on the next press. Removing them would block a real retry.
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
      reply_markup: { inline_keyboard: [] },
    })
    return NextResponse.json({ ok: true })
  }

  try {
    const imageUrls: string[] = draft.image_urls?.length ? draft.image_urls : [draft.image_url]
    const igMediaId = await publishToInstagram(imageUrls, draft.caption, await loadPublishCredentials())
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
      reply_markup: { inline_keyboard: [] },
    })
  } catch (err: any) {
    await supabase.from('instagram_drafts').update({ status: 'failed', error: err.message }).eq('id', draftId)
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка публикации', show_alert: true })
    // Unlike the auto-reply failure above, this one does NOT go back to
    // 'pending' -- it becomes 'failed', and the guard near the top of this
    // handler only proceeds for status === 'pending'. A second press could
    // never have worked through this button, so the keyboard comes off too.
    await telegram('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `${cb.message.text}\n\n⚠️ Ошибка: ${err.message}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    })
  }

  return NextResponse.json({ ok: true })
}
