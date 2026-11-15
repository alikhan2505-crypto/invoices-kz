import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { validateRecipientEmail } from '@/lib/invoiceEmail'
import { verdictFromStatus } from '@/lib/emailDeliverability'
import { isPlaceholderEmail } from '@/lib/whatsappLogin/placeholderEmail'
import { startEmailClaim } from '@/lib/accountEmail/service'
import { buildClaimEmail } from '@/lib/accountEmail/mail'
import { clientIp, quotaIp, sha256Hex } from '@/lib/toolQuota'
import { claimWindowSlot, dayBucket, hourBucket, windowKey } from '@/lib/windowLimits'
import { serverError } from '@/lib/apiError'

// Шаг 1 привязки почты для аккаунта, созданного входом через WhatsApp: код на указанный адрес.
// Нужен вход (Bearer) и служебный адрес wa.invalid у аккаунта: обычным аккаунтам этот маршрут не нужен.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
const resend = new Resend(process.env.RESEND_API_KEY || 'missing')

const PER_USER_PER_HOUR = 5
const PER_EMAIL_PER_DAY = 3
const PER_IP_PER_HOUR = 20

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isPlaceholderEmail(user.email)) return NextResponse.json({ error: 'not_needed' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const checked = validateRecipientEmail(body?.email)
  if (!checked.ok || isPlaceholderEmail(checked.email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  const email = checked.email.toLowerCase()

  const slots = [
    windowKey('acct-email-u', user.id, hourBucket()), PER_USER_PER_HOUR,
    windowKey('acct-email-e', sha256Hex(email), dayBucket()), PER_EMAIL_PER_DAY,
    windowKey('acct-email-ip', quotaIp(clientIp(req.headers)), hourBucket()), PER_IP_PER_HOUR,
  ] as const
  for (let i = 0; i < slots.length; i += 2) {
    const slot = await claimWindowSlot(supabase, slots[i] as string, slots[i + 1] as number)
    if (!slot.ok && slot.reason === 'limit') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // Адрес из чёрного списка Resend: письмо не дойдёт, честно говорим об этом сразу (как на странице входа).
  const readKey = process.env.RESEND_READ_API_KEY
  if (readKey) {
    try {
      const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${readKey}` },
        signal: AbortSignal.timeout(6_000),
      })
      if (verdictFromStatus(res.status) === 'undeliverable') return NextResponse.json({ error: 'undeliverable' }, { status: 422 })
    } catch { /* проверка недоступна: не блокируем */ }
  }

  try {
    const code = await startEmailClaim(supabase, user.id, email)
    const { subject, html } = buildClaimEmail(code)
    const { error } = await resend.emails.send({ from: 'INVOICES.KZ <mail@invoices.kz>', to: email, subject, html })
    if (error) return serverError('account/email/start: resend', error.message, 502)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('account/email/start', e)
  }
}
