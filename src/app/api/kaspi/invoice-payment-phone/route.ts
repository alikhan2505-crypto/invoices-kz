import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPhonePaymentForInvoice } from '@/lib/kaspiPay/invoicePayment'
import { claimInvoicePushSlots } from '@/lib/kaspiPay/invoicePushLimits'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Причины отказа createPhonePaymentForInvoice, при которых push не уходил
// (слот лимита номера возвращается, слот IP остаётся).
const NO_PUSH_REASONS = new Set<string>([
  'invalid_phone', 'closed', 'already_paid', 'no_connection', 'insufficient_balance', 'rate_limited',
])

// Public, unauthenticated -- same trust model as /api/kaspi/invoice-payment
// (the payer viewing /view/[token] is never logged in). Unlike that route,
// this one delivers a real push notification to a phone number the caller
// supplies, so createPhonePaymentForInvoice applies its own tighter,
// phone-specific rate limit on top -- see that function's comment for why
// an anonymous public link needs stricter throttling here than the QR path.
export async function POST(req: NextRequest) {
  // Тело не JSON или не объект, token не строка — 400, а не необработанное исключение (500).
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const phone = body?.phone
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, user_id, amount, status')
    .eq('public_token', token)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Лимиты на НОМЕР и на IP поверх лимита на один счёт (аудит 02.11.2026, п. 4):
  // без них владелец пачки публичных ссылок мог слать push на чужой номер без
  // потолка. Слот занят до обращения к Kaspi; см. invoicePushLimits.ts.
  // Тело ответа той же формы, что у лимита на счёт ({error: 'rate_limited'}) --
  // страница /view/[token] по нему показывает «Слишком много попыток».
  const slots = await claimInvoicePushSlots(supabase, req.headers, phone)
  if (!slots.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Слишком много запросов, попробуйте позже', retry_after: slots.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(slots.retryAfterSec) } },
    )
  }

  let result: Awaited<ReturnType<typeof createPhonePaymentForInvoice>>
  try {
    result = await createPhonePaymentForInvoice(invoice, phone)
  } catch (e) {
    // Исключение случается до обращения к Kaspi (push внутри ловит свои ошибки),
    // значит ничего не отправлено -- слот возвращаем и отдаём ошибку как раньше.
    await slots.release()
    throw e
  }
  if (!result.ok) {
    // Push не уходил -- слот НОМЕРА возвращаем, иначе чужой номер можно было бы «выбить» из
    // лимита запросами, после которых ничего не отправлено. Слот IP остаётся занятым: такой
    // запрос всё равно мог сходить в Kaspi за статусом и в базу за кошельком, и без этого цикл по
    // счёту на потолке лимита не стоил бы злоумышленнику ничего. 'error' не возвращает ничего:
    // там мог отказать сам Kaspi, а это попытка.
    if (NO_PUSH_REASONS.has(result.reason)) await slots.release({ keepIp: true })
    const status = result.reason === 'invalid_phone' ? 400
      : result.reason === 'rate_limited' ? 429
      : result.reason === 'already_paid' ? 409
      : 502
    // Лимит на счёт -- скользящий час, точного срока у маршрута нет: отдаём
    // верхнюю границу, чтобы клиент не повторял запрос раньше времени.
    const headers = result.reason === 'rate_limited' ? { 'Retry-After': '3600' } : undefined
    return NextResponse.json({ error: result.reason }, { status, headers })
  }
  return NextResponse.json({ ok: true })
}
