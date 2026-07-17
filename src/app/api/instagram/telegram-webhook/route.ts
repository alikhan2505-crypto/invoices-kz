import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToInstagram } from '@/lib/instagram'

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
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const update = await req.json()
  const cb = update.callback_query
  if (!cb || typeof cb.data !== 'string') {
    return NextResponse.json({ ok: true })
  }

  if (String(cb.message?.chat?.id) !== process.env.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  const [action, draftId] = cb.data.split(':')
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
    await telegram('editMessageCaption', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      caption: `${cb.message.caption}\n\n❌ Отклонено`,
    })
    return NextResponse.json({ ok: true })
  }

  try {
    const igMediaId = await publishToInstagram(draft.image_url, draft.caption)
    await supabase
      .from('instagram_drafts')
      .update({ status: 'published', ig_media_id: igMediaId, published_at: new Date().toISOString() })
      .eq('id', draftId)
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Опубликовано!' })
    await telegram('editMessageCaption', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      caption: `${cb.message.caption}\n\n✅ Опубликовано в Instagram`,
    })
  } catch (err: any) {
    await supabase.from('instagram_drafts').update({ status: 'failed', error: err.message }).eq('id', draftId)
    await telegram('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ошибка публикации', show_alert: true })
    await telegram('editMessageCaption', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      caption: `${cb.message.caption}\n\n⚠️ Ошибка: ${err.message}`,
    })
  }

  return NextResponse.json({ ok: true })
}
