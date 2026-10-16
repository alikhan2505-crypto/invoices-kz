import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { loadNotifyProfile } from '@/lib/notificationPrefsServer'
import { wantsNotification } from '@/lib/notificationPrefs'
import { escapeHtml } from '@/lib/htmlEscape'

const resend = new Resend(process.env.RESEND_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called from the public invoice page right after a client's first view flips
// status sent -> viewed. No auth (page is anonymous, gated by public_token) —
// invoiceId alone can't do anything beyond sending this one notification, and
// only for an invoice that's actually in `viewed` status.
export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json()
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })

    const { data: inv } = await supabase
      .from('invoices')
      .select('number, amount, client_name, status, user_id')
      .eq('id', invoiceId)
      .single()

    if (!inv || inv.status !== 'viewed') {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Настройки события «Клиент открыл счёт» (notification_prefs; до миграции —
    // старые notify_client_viewed / notify_telegram).
    const owner = await loadNotifyProfile(supabase, inv.user_id)

    if (!owner) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const amount = Number(inv.amount).toLocaleString('ru-KZ')
    const clientName = escapeHtml(inv.client_name || '')
    const number = escapeHtml(inv.number)

    // Email and Telegram are independent channels (see plan's Global
    // Constraints) — each gets its own guard, neither nested inside the
    // other, so a user with only one channel enabled still gets that one.
    // Own try/catch, not just the outer one — email and Telegram are meant
    // to be fully independent channels (see plan's Global Constraints), so
    // a Resend failure (bad key, rate limit, network blip) must not prevent
    // the Telegram branch below from still running.
    if (wantsNotification(owner, 'invoice_viewed', 'email')) {
      try {
        await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: owner.email as string,
          subject: `Клиент открыл счёт №${inv.number}`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:#1C2056; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">Счёт открыт</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 12px; font-size:14px; color:#333;">
      Клиент <strong>${clientName}</strong> открыл счёт №${number} на сумму
      <strong>${amount} ₸</strong>.
    </p>
    <p style="margin:0; font-size:12px; color:#aaa;">
      Отключить это письмо можно в Профиль → Уведомления.
    </p>
  </div>
</div>
</body>
</html>
          `,
        })
      } catch (e: any) {
        console.error('notify-viewed: email send failed for invoice', invoiceId, ':', e.message)
      }
    }

    if (wantsNotification(owner, 'invoice_viewed', 'telegram')) {
      await sendTelegramNotification(owner.telegram_chat_id as string,
        `👀 Клиент <b>${clientName}</b> открыл счёт №${number} на сумму <b>${amount} ₸</b>.`)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
