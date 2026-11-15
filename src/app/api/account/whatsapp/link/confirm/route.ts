import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { confirmLink, maskWaId } from '@/lib/whatsappLogin/link'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'

// Шаг 2 привязки: человек ввёл в кабинете 6-значный код из ответа WhatsApp. Попытки на сам код (5) считает сервис.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const CONFIRMS_PER_USER_PER_HOUR = 20

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slot = await claimWindowSlot(supabase, windowKey('walink-confirm', user.id, hourBucket()), CONFIRMS_PER_USER_PER_HOUR)
  if (!slot.ok && slot.reason === 'limit') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
  if (code.length !== 6) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  const res = await confirmLink(supabase, user.id, code)
  if (res.ok) return NextResponse.json({ ok: true, phone: maskWaId(res.waId) })

  const status = { wrong_code: 400, expired: 410, too_many: 429, taken: 409, already_linked: 409, error: 500 }[res.reason]
  return NextResponse.json({ error: res.reason === 'error' ? 'Внутренняя ошибка сервера, попробуйте ещё раз' : res.reason }, { status })
}
