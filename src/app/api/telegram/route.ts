import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { message } = await req.json()

  if (!message || typeof message !== 'string' || message.length > 1000) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
  }

  const internalSecret = req.headers.get('x-internal-secret')
  const isInternal = !!internalSecret && internalSecret === process.env.INTERNAL_API_SECRET

  if (!isInternal) {
    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    })
  })

  return NextResponse.json({ ok: true })
}