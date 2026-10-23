import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateKaspiPaymentForInvoice } from '@/lib/kaspiPay/invoicePayment'
import { getActivePlan } from '@/lib/plan'
import { buildInvoiceEmailHtml, invoiceEmailSubject, validateRecipientEmail } from '@/lib/invoiceEmail'
import {
  SEND_INVOICE_PER_INVOICE_DAILY, SEND_INVOICE_PER_USER_DAILY,
  claimDailySlot, releaseDailySlot, sendInvoiceKey,
} from '@/lib/oneShotLimits'

const resend = new Resend(process.env.RESEND_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Письмо уходит от mail@invoices.kz — того же отправителя, что и письма входа,
// поэтому репутация домена общая. Отсюда жёсткие рамки (аудит 24.10.2026):
// адрес — одна строка и один адрес, поля счёта экранируются, тариф проверяется
// на сервере (в браузере это только подсказка), отправок на счёт и на
// пользователя — не больше суточного лимита (окно — календарный день по Алматы).
// Ответ фронтенду прежний: { success: true } или { error } — он показывает error.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const invoiceId = body?.invoiceId
    const overrideEmail = body?.overrideEmail
    if (typeof invoiceId !== 'string' || !invoiceId || invoiceId.length > 64) {
      return NextResponse.json({ error: 'Счёт не найден' }, { status: 400 })
    }

    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: inv } = await supabase
      .from('invoices')
      .select('id, user_id, number, amount, status, client_name, client_email, services, note, created_at, public_token')
      .eq('id', invoiceId)
      .maybeSingle()

    if (!inv) return NextResponse.json({ error: 'Счёт не найден' }, { status: 404 })
    if (inv.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Тот же гейт, что в браузере (canEmail): платный тариф, бонус или пробный
    // период; админ — всегда (getActivePlan учитывает is_admin сам).
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, plan, plan_expires_at, trial_expires_at, bonus_expires_at')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) {
      console.error('send-invoice: profile read failed for user', user.id, ':', profileError.message)
      return NextResponse.json({ error: 'Не удалось проверить тариф, попробуйте позже' }, { status: 503 })
    }
    if (!getActivePlan(profile).canEmail) {
      return NextResponse.json({ error: 'Отправка счетов по email доступна на платных тарифах' }, { status: 403 })
    }

    // Получатель — строка, один адрес. overrideEmail (если пришёл) важнее
    // адреса клиента из счёта; пустой считаем «не передан», как раньше.
    const hasOverride = overrideEmail !== undefined && overrideEmail !== null && overrideEmail !== ''
    const rawRecipient = hasOverride ? overrideEmail : inv.client_email
    if (!hasOverride && !inv.client_email) {
      return NextResponse.json({ error: 'Нет email клиента' }, { status: 400 })
    }
    const recipient = validateRecipientEmail(rawRecipient)
    if (!recipient.ok) {
      return NextResponse.json({ error: 'Некорректный email получателя' }, { status: 400 })
    }

    // Суточные лимиты: сначала на счёт, потом на пользователя. Слот занимается
    // ДО отправки (иначе пачка параллельных запросов проскочит), а если письмо
    // не ушло — возвращается. Счётчик недоступен — отказ, не пропуск.
    const invoiceKey = sendInvoiceKey('invoice', inv.id)
    const userKey = sendInvoiceKey('user', user.id)
    const perInvoice = await claimDailySlot(supabase, invoiceKey, SEND_INVOICE_PER_INVOICE_DAILY)
    if (!perInvoice.ok) {
      return perInvoice.reason === 'limit'
        ? NextResponse.json({ error: `Этот счёт уже отправлялся ${SEND_INVOICE_PER_INVOICE_DAILY} раз за сутки. Попробуйте завтра.` }, { status: 429 })
        : NextResponse.json({ error: 'Сервис временно недоступен, попробуйте позже' }, { status: 503 })
    }
    const perUser = await claimDailySlot(supabase, userKey, SEND_INVOICE_PER_USER_DAILY)
    if (!perUser.ok) {
      await releaseDailySlot(supabase, invoiceKey)
      return perUser.reason === 'limit'
        ? NextResponse.json({ error: `Достигнут суточный лимит писем со счетами (${SEND_INVOICE_PER_USER_DAILY}). Попробуйте завтра.` }, { status: 429 })
        : NextResponse.json({ error: 'Сервис временно недоступен, попробуйте позже' }, { status: 503 })
    }

    try {
      // Where a reply goes. Without this the buyer answers mail@invoices.kz —
      // a send-only address with no mailbox behind it, so "можно исправить
      // сумму?" and "оплатил, вот квитанция" reached nobody and the seller
      // never learned their customer had written. The seller's own address is
      // who the buyer meant to write to anyway. Берём адрес из auth.users, а
      // не из profiles.email: тот пользователь пишет сам, и Reply-To можно
      // было бы направить на любой чужой ящик.
      const authEmail = validateRecipientEmail(user.email)
      const replyTo = authEmail.ok ? authEmail.email : undefined

      let kaspiPaymentLink: string | null = null
      try {
        // Shared with the payer-facing /api/kaspi/invoice-payment route, which
        // regenerates this link on demand once it expires. Going through the
        // same helper also means a resend reuses the invoice's still-valid
        // payment instead of minting a second one for the same invoice.
        const payment = await getOrCreateKaspiPaymentForInvoice(inv)
        kaspiPaymentLink = payment?.payment_link ?? null
      } catch (e: any) {
        // A Kaspi failure must never block sending the invoice itself — the
        // client can still pay by bank transfer, the owner just won't get an
        // automated Kaspi link for this particular send.
        console.error('Kaspi payment-link generation failed for invoice', inv.id, e.message)
      }

      // Resend сообщает об отказе полем error, а не исключением.
      const sent = await resend.emails.send({
        from: 'invoices.kz <mail@invoices.kz>',
        // Omitted rather than defaulted when the seller has no email on file:
        // pointing replies back at an unattended mailbox is the bug being
        // fixed, not a safe fallback.
        ...(replyTo ? { replyTo } : {}),
        to: recipient.email,
        subject: invoiceEmailSubject({ number: inv.number, amount: inv.amount, clientName: inv.client_name }),
        html: buildInvoiceEmailHtml({
          number: inv.number,
          amount: inv.amount,
          clientName: inv.client_name,
          createdAt: inv.created_at,
          services: inv.services,
          note: inv.note,
          publicToken: inv.public_token,
          kaspiPaymentLink,
        }),
      })
      if (sent?.error) throw new Error(sent.error.message || 'Не удалось отправить письмо')
    } catch (e: any) {
      // Письмо не ушло — лимит не тратим.
      await releaseDailySlot(supabase, userKey)
      await releaseDailySlot(supabase, invoiceKey)
      throw e
    }

    // Статус «отправлен» — только из черновика: повторная отправка не должна
    // откатывать оплаченный / просмотренный / просроченный счёт.
    await supabase.from('invoices').update({ status: 'sent' })
      .eq('id', inv.id).eq('user_id', user.id).eq('status', 'draft')

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
