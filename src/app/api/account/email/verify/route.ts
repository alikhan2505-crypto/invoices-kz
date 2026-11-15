import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateRecipientEmail } from '@/lib/invoiceEmail'
import { isPlaceholderEmail } from '@/lib/whatsappLogin/placeholderEmail'
import { verifyEmailClaim } from '@/lib/accountEmail/service'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'

// Шаг 2 привязки почты: проверка кода. Попытки на сам код (5) считает сервис, здесь потолок на человека в час.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const VERIFY_PER_USER_PER_HOUR = 20
const REDIRECT_TO = 'https://invoices.kz/auth/callback'

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isPlaceholderEmail(user.email)) return NextResponse.json({ error: 'not_needed' }, { status: 400 })

  const slot = await claimWindowSlot(supabase, windowKey('acct-email-v', user.id, hourBucket()), VERIFY_PER_USER_PER_HOUR)
  if (!slot.ok && slot.reason === 'limit') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const checked = validateRecipientEmail(body?.email)
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
  if (!checked.ok || code.length !== 6) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  const res = await verifyEmailClaim(supabase, supabase.auth.admin as never, {
    userId: user.id, email: checked.email, code, redirectTo: REDIRECT_TO,
  })
  if (res.ok) return NextResponse.json(res.mode === 'linked' ? { ok: true, mode: 'linked', url: res.url } : { ok: true, mode: 'attached' })

  const status = { wrong_code: 400, expired: 410, too_many: 429, has_data: 409, other_has_number: 409, error: 500 }[res.reason]
  return NextResponse.json({ error: res.reason === 'error' ? 'Внутренняя ошибка сервера, попробуйте ещё раз' : res.reason }, { status })
}
