import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loginConfig } from '@/lib/whatsappLogin/helpers'
import { linkedWaId, maskWaId, unlinkWhatsApp } from '@/lib/whatsappLogin/link'
import { isPlaceholderEmail } from '@/lib/whatsappLogin/placeholderEmail'
import { serverError } from '@/lib/apiError'

// Состояние привязки WhatsApp к аккаунту (раздел «Вход и Face ID»): включён ли вход, привязан ли номер.
// DELETE отвязывает номер, но только тому, у кого есть настоящая почта: иначе человек остался бы без входа.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const waId = await linkedWaId(supabase, user.id)
    return NextResponse.json({
      enabled: loginConfig() !== null,
      linked: !!waId,
      phone: waId ? maskWaId(waId) : null,
      // Без настоящей почты отвязать нельзя: единственный вход человека это WhatsApp.
      canUnlink: !!waId && !isPlaceholderEmail(user.email),
    })
  } catch (e) {
    return serverError('account/whatsapp GET', e)
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isPlaceholderEmail(user.email)) return NextResponse.json({ error: 'last_login_method' }, { status: 409 })
  try {
    await unlinkWhatsApp(supabase, user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('account/whatsapp DELETE', e)
  }
}
