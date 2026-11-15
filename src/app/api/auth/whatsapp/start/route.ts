import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildWaMeUrl, loginConfig, sanitizeMeta } from '@/lib/whatsappLogin/helpers'
import { createLoginCode } from '@/lib/whatsappLogin/service'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'
import { clientIp, quotaIp } from '@/lib/toolQuota'
import { serverError } from '@/lib/apiError'

// Кнопка «Войти через WhatsApp»: выдаёт код и ссылку на чат с готовым текстом «Вход <код>».
// Без вошедшего пользователя (это вход), поэтому потолок по IP. Пока в Vercel не заданы
// WHATSAPP_LOGIN_PHONE_NUMBER_ID и WHATSAPP_LOGIN_DISPLAY_NUMBER, вход выключен (503).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STARTS_PER_IP_PER_HOUR = 10

export async function POST(req: NextRequest) {
  const cfg = loginConfig()
  if (!cfg) return NextResponse.json({ error: 'disabled' }, { status: 503 })

  const slot = await claimWindowSlot(supabase, windowKey('walogin-ip', quotaIp(clientIp(req.headers)), hourBucket()), STARTS_PER_IP_PER_HOUR)
  if (!slot.ok && slot.reason === 'limit') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const meta = sanitizeMeta(body?.meta)

  try {
    const code = await createLoginCode(supabase, meta)
    return NextResponse.json({ url: buildWaMeUrl(cfg.displayNumber, code), code, number: cfg.displayNumber })
  } catch (e) {
    return serverError('auth/whatsapp/start', e)
  }
}
