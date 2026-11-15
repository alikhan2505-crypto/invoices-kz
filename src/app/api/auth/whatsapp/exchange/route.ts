import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeLoginToken } from '@/lib/whatsappLogin/service'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'
import { clientIp, quotaIp } from '@/lib/toolQuota'

// Страница /auth/wa меняет одноразовый токен из ссылки на обычную вход-ссылку Supabase.
// Токен гасится одним условным UPDATE: второе открытие той же ссылки даёт 410.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const EXCHANGES_PER_IP_PER_HOUR = 30
const REDIRECT_TO = 'https://invoices.kz/auth/callback'

export async function POST(req: NextRequest) {
  const slot = await claimWindowSlot(supabase, windowKey('walogin-x', quotaIp(clientIp(req.headers)), hourBucket()), EXCHANGES_PER_IP_PER_HOUR)
  if (!slot.ok && slot.reason === 'limit') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const token = typeof body?.t === 'string' ? body.t : ''
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return NextResponse.json({ error: 'invalid' }, { status: 410 })

  const res = await exchangeLoginToken(supabase, supabase.auth.admin as never, token, REDIRECT_TO)
  if (res.ok) return NextResponse.json({ url: res.url })
  if (res.reason === 'invalid') return NextResponse.json({ error: 'invalid' }, { status: 410 })
  return NextResponse.json({ error: 'Внутренняя ошибка сервера, попробуйте ещё раз' }, { status: 500 })
}
