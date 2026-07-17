import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Creates a pending Instagram post draft and sends it to the admin's Telegram
// for approval. Called by Claude during a content-generation session — the
// Higgsfield-hosted image is re-uploaded to our own Storage bucket so the
// public URL Instagram fetches at publish time doesn't depend on a third
// party continuing to host it.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { imageUrl, caption, note } = await req.json()
  if (!imageUrl || typeof imageUrl !== 'string' || !caption || typeof caption !== 'string') {
    return NextResponse.json({ error: 'imageUrl and caption are required' }, { status: 400 })
  }
  if (caption.length > 2200) {
    return NextResponse.json({ error: 'Caption too long for Instagram' }, { status: 400 })
  }

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) {
    return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 })
  }
  const imageBlob = await imageRes.blob()
  const contentType = imageRes.headers.get('content-type') || 'image/png'
  const ext = contentType.includes('jpeg') ? 'jpg' : 'png'
  const path = `${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('instagram-drafts')
    .upload(path, imageBlob, { contentType, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('instagram-drafts').getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  const { data: draft, error: insertError } = await supabase
    .from('instagram_drafts')
    .insert({ image_url: publicUrl, caption })
    .select()
    .single()
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (token && chatId) {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: publicUrl,
        // `note` is admin-only context shown in Telegram (e.g. "last post of
        // the week's batch") — it's never part of `caption`, which is the
        // exact text that gets published to Instagram if approved.
        caption: `📸 <b>Новый пост для Instagram</b>\n\n${caption}${note ? `\n\n— — —\n${note}` : ''}`,
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

  return NextResponse.json({ ok: true, id: draft.id, imageUrl: publicUrl })
}
