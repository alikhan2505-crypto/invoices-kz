import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const internalSecret = req.headers.get('x-internal-secret')
  const isInternal = !!internalSecret && internalSecret === process.env.INTERNAL_API_SECRET

  let message: string

  if (isInternal) {
    // Trusted server-to-server callers (signup/lead/deletion notices) may
    // send any pre-built message.
    if (!body.message || typeof body.message !== 'string' || body.message.length > 1000) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
    }
    message = body.message
  } else {
    // Any signed-up account can reach this branch -- "is authenticated" is
    // not "is allowed to say anything". A free account used to be able to
    // send 1000 bytes of arbitrary HTML straight to the founder's personal
    // Telegram (parse_mode: 'HTML'). Only the two legitimate client callers
    // (auth/callback's signup notice, admin's plan-activation notice) are
    // honored now, as fixed, parameterized shapes the server templates
    // itself -- the caller can no longer dictate the message text.
    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (body.event === 'signup') {
      const email = typeof body.email === 'string' ? body.email.slice(0, 200) : ''
      const refCode = typeof body.refCode === 'string' ? body.refCode.slice(0, 100) : ''
      const promoCode = typeof body.promoCode === 'string' ? body.promoCode.slice(0, 100) : ''
      message = `🆕 <b>Новый пользователь!</b>\n📧 ${escapeHtml(email || user.email || '')}` +
        (refCode ? `\n🎁 Реферал: ${escapeHtml(refCode)}` : '') +
        (promoCode ? `\n🏷 Промокод: ${escapeHtml(promoCode)}` : '')
    } else if (body.event === 'plan_activated') {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

      const email = typeof body.email === 'string' ? body.email.slice(0, 200) : ''
      const plan = body.plan === 'pro' ? 'Про' : 'Базовый'
      message = `🎉 <b>Тариф активирован!</b>\n📱 ${escapeHtml(email)}\n📦 ${plan} тариф активирован`
    } else {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  // Previously discarded entirely -- a rejected send (bad chat_id, bot
  // removed from the chat, unescaped HTML in the message breaking
  // Telegram's parser) always reported {ok:true} back to the caller with
  // no way to ever notice the admin never actually got the message.
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    })
  })
  if (!tgRes.ok) {
    const body = await tgRes.text().catch(() => '')
    console.error('telegram sendMessage failed:', tgRes.status, body)
    return NextResponse.json({ error: 'Telegram delivery failed', telegramStatus: tgRes.status }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}