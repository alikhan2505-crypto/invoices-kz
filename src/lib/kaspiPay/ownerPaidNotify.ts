// Владельцу: «Счёт оплачен через Kaspi Pay» — колокольчик всегда, Telegram и
// письмо по его настройкам (событие invoice_paid_kaspi). Вызывается ровно
// там, где Kaspi подтвердил деньги и счёт перешёл в «Оплачен»:
// checkAndSettleKaspiPayment (атомарный захват строки платежа) и
// автосверка истории кассы (historySync.settleUnambiguous). До этого
// владелец узнавал об оплате только сам, открыв историю.
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createNotification } from '@/lib/notifications'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { loadNotifyProfile } from '@/lib/notificationPrefsServer'
import { wantsNotification } from '@/lib/notificationPrefs'
import { escapeHtml } from '@/lib/htmlEscape'

const TELEGRAM_TIMEOUT_MS = 5000

export interface PaidInvoiceForNotify {
  id: string
  number: string | number | null
  amount: number | string | null
  client_name: string | null
  user_id: string
}

export function kaspiPaidTexts(inv: PaidInvoiceForNotify) {
  const amount = Number(inv.amount || 0).toLocaleString('ru-KZ')
  const number = inv.number == null ? '' : String(inv.number)
  const client = (inv.client_name || '').trim()
  const fromClient = client ? ` от ${client}` : ''
  const link = `https://invoices.kz/invoice/${inv.id}`
  return {
    bellTitle: `Счёт №${number} оплачен через Kaspi Pay`,
    bellBody: `${amount} ₸${fromClient}. Kaspi подтвердил оплату — счёт отмечен оплаченным.`,
    bellLink: `/invoice/${inv.id}`,
    telegram: `✅ Счёт №${escapeHtml(number)}${client ? ` для <b>${escapeHtml(client)}</b>` : ''} на сумму <b>${amount} ₸</b> оплачен через Kaspi Pay. ${escapeHtml(link)}`,
    emailSubject: `Счёт №${number} оплачен через Kaspi Pay`,
    emailHtml: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:#2DC48D; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">Оплата через Kaspi Pay</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 12px; font-size:14px; color:#333;">
      Kaspi подтвердил оплату счёта №${escapeHtml(number)}${client ? ` для <strong>${escapeHtml(client)}</strong>` : ''} на сумму
      <strong>${amount} ₸</strong>. Счёт отмечен оплаченным.
    </p>
    <p style="margin:0 0 12px; font-size:14px;"><a href="${escapeHtml(link)}" style="color:#1C2056;">Открыть счёт</a></p>
    <p style="margin:16px 0 0; font-size:12px; color:#aaa;">
      Отключить это письмо можно в Профиль → Уведомления.
    </p>
  </div>
</div>
</body>
</html>`,
  }
}

// Best-effort: никогда не бросает — оплата уже проведена независимо от того,
// дошло ли уведомление.
export async function notifyOwnerInvoicePaidViaKaspi(supabase: SupabaseClient, invoiceId: string): Promise<void> {
  try {
    const { data: inv, error } = await supabase
      .from('invoices')
      .select('id, number, amount, client_name, user_id')
      .eq('id', invoiceId)
      .maybeSingle()
    if (error || !inv) {
      if (error) console.error('notifyOwnerInvoicePaidViaKaspi: invoice lookup failed for', invoiceId, ':', error.message)
      return
    }
    const texts = kaspiPaidTexts(inv as PaidInvoiceForNotify)

    // Колокольчик — без тумблера, как и у остальных событий кабинета.
    await createNotification(inv.user_id, texts.bellTitle, texts.bellBody, texts.bellLink)

    const owner = await loadNotifyProfile(supabase, inv.user_id)
    if (wantsNotification(owner, 'invoice_paid_kaspi', 'telegram')) {
      await sendTelegramNotification(owner!.telegram_chat_id as string, texts.telegram, { timeoutMs: TELEGRAM_TIMEOUT_MS })
    }
    if (wantsNotification(owner, 'invoice_paid_kaspi', 'email') && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const { error: sendError } = await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: owner!.email as string,
          subject: texts.emailSubject,
          html: texts.emailHtml,
        })
        if (sendError) console.error('notifyOwnerInvoicePaidViaKaspi: email rejected for invoice', invoiceId, ':', sendError.message)
      } catch (e: any) {
        console.error('notifyOwnerInvoicePaidViaKaspi: email failed for invoice', invoiceId, ':', e?.message || e)
      }
    }
  } catch (err: any) {
    console.error('notifyOwnerInvoicePaidViaKaspi failed for invoice', invoiceId, ':', err?.message || err)
  }
}
