import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Creates a pending Instagram post draft and sends it to the admin's Telegram
// for approval. Called by Claude during a content-generation session — the
// Higgsfield-hosted image(s) are re-uploaded to our own Storage bucket so the
// public URL Instagram fetches at publish time doesn't depend on a third
// party continuing to host it.
//
// `imageUrls` (1-10 images) is the primary input: 2+ images publish as a
// swipeable carousel — the user explicitly wants posts people slide through
// rather than a single photo plus a caption they have to open and read.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { caption, note } = body
  const imageUrls: unknown = body.imageUrls || (body.imageUrl ? [body.imageUrl] : undefined)

  if (!Array.isArray(imageUrls) || imageUrls.length === 0 || !imageUrls.every(u => typeof u === 'string')) {
    return NextResponse.json({ error: 'imageUrls (array of 1-10 image URLs) is required' }, { status: 400 })
  }
  if (imageUrls.length > 10) {
    return NextResponse.json({ error: 'Instagram carousels support at most 10 images' }, { status: 400 })
  }
  if (!caption || typeof caption !== 'string') {
    return NextResponse.json({ error: 'caption is required' }, { status: 400 })
  }
  if (caption.length > 2200) {
    return NextResponse.json({ error: 'Caption too long for Instagram' }, { status: 400 })
  }

  const publicUrls: string[] = []
  for (const url of imageUrls as string[]) {
    const imageRes = await fetch(url)
    if (!imageRes.ok) {
      return NextResponse.json({ error: `Could not fetch source image: ${url}` }, { status: 400 })
    }
    const imageBlob = await imageRes.blob()
    const contentType = imageRes.headers.get('content-type') || 'image/png'
    const ext = contentType.includes('jpeg') ? 'jpg' : 'png'
    const path = `${Date.now()}-${publicUrls.length}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('instagram-drafts')
      .upload(path, imageBlob, { contentType, upsert: false })
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
    publicUrls.push(supabase.storage.from('instagram-drafts').getPublicUrl(path).data.publicUrl)
  }

  const { data: draft, error: insertError } = await supabase
    .from('instagram_drafts')
    .insert({ image_url: publicUrls[0], image_urls: publicUrls, caption })
    .select()
    .single()
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (token && chatId) {
    // Telegram's sendMediaGroup needs 2+ items — a single image goes through
    // sendPhoto instead. Either way, the caption + approve/reject buttons
    // live in a separate follow-up text message: a media group's per-item
    // caption isn't reliably visible as a group caption, and inline
    // keyboards can't be attached to media group items at all.
    if (publicUrls.length > 1) {
      await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          media: publicUrls.map(url => ({ type: 'photo', media: url })),
        }),
      })
    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: publicUrls[0] }),
      })
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        // `note` is admin-only context shown in Telegram (e.g. "last post of
        // the week's batch") — it's never part of `caption`, which is the
        // exact text that gets published to Instagram if approved.
        text: `📸 <b>Новый пост для Instagram${publicUrls.length > 1 ? ` (карусель, ${publicUrls.length} фото)` : ''}</b>\n\n${caption}${note ? `\n\n— — —\n${note}` : ''}`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Опубликовать', callback_data: `ig_publish:${draft.id}` },
            { text: '❌ Отклонить', callback_data: `ig_reject:${draft.id}` },
          ]],
        },
      }),
    })
    const tgData = await tgRes.json()
    if (tgData.ok) {
      await supabase
        .from('instagram_drafts')
        .update({ telegram_chat_id: String(chatId), telegram_message_id: tgData.result.message_id })
        .eq('id', draft.id)
    }
  }

  return NextResponse.json({ ok: true, id: draft.id, imageUrls: publicUrls })
}
