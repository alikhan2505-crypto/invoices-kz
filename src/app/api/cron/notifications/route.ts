import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

function startOfDayAgo(days: number) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

function wrapEmail(accentColor: string, title: string, bodyHtml: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:${accentColor}; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">${title}</div>
  </div>
  <div style="padding:28px 32px;">
    ${bodyHtml}
    <p style="margin:16px 0 0; font-size:12px; color:#aaa;">
      Отключить эти письма можно в Профиль → Уведомления.
    </p>
  </div>
</div>
</body>
</html>`
}

// No due_date is ever set on invoices (default_due_days is decorative), so
// "payment reminder" / "overdue" are defined off `created_at` — 3 and 7 days
// since sending, respectively — matching the existing manual "mark overdue"
// button on the history page (kept as-is; this cron is now the reliable,
// automatic path and is what actually fires the notification emails).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let reminders = 0
  let overdue = 0
  let reports = 0

  // --- Payment reminder: sent 3 days ago, still unpaid ---
  const { data: reminderInvoices } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_payment_reminder)')
    .in('status', ['sent', 'viewed'])
    .gte('created_at', startOfDayAgo(3).toISOString())
    .lt('created_at', startOfDayAgo(2).toISOString())

  for (const inv of (reminderInvoices || []) as any[]) {
    const owner = inv.profiles
    if (!owner?.email || owner.notify_payment_reminder === false) continue
    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: owner.email,
      subject: `Напоминание: счёт №${inv.number} ещё не оплачен`,
      html: wrapEmail('#F5A623', 'Напоминание об оплате', `
        <p style="margin:0 0 12px; font-size:14px; color:#333;">
          Счёт №${inv.number} для <strong>${inv.client_name || ''}</strong> на сумму
          <strong>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong> отправлен 3 дня назад и всё ещё не оплачен.
        </p>
      `),
    })
    reminders++
  }

  // --- Overdue: sent 7+ days ago, still unpaid — transition status + notify owner ---
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, number, amount, client_name, profiles(email, notify_overdue)')
    .in('status', ['sent', 'viewed'])
    .lt('created_at', startOfDayAgo(7).toISOString())

  for (const inv of (overdueInvoices || []) as any[]) {
    await supabase.from('invoices').update({ status: 'overdue' }).eq('id', inv.id)
    const owner = inv.profiles
    if (!owner?.email || owner.notify_overdue === false) continue
    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: owner.email,
      subject: `Счёт №${inv.number} просрочен`,
      html: wrapEmail('#E05252', 'Счёт просрочен', `
        <p style="margin:0 0 12px; font-size:14px; color:#333;">
          Счёт №${inv.number} для <strong>${inv.client_name || ''}</strong> на сумму
          <strong>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong> не оплачен уже 7 дней и помечен как просроченный.
        </p>
      `),
    })
    overdue++
  }

  // --- Weekly report: Mondays only ---
  if (new Date().getUTCDay() === 1) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('notify_weekly_report', true)
      .not('email', 'is', null)

    for (const p of profiles || []) {
      const { data: weekInvoices } = await supabase
        .from('invoices')
        .select('status, amount')
        .eq('user_id', p.id)
        .gte('created_at', startOfDayAgo(7).toISOString())

      const list = weekInvoices || []
      if (list.length === 0) continue

      const paid = list.filter(i => i.status === 'paid')
      const paidSum = paid.reduce((s, i) => s + Number(i.amount), 0)
      const unpaidCount = list.filter(i => ['sent', 'viewed', 'overdue'].includes(i.status)).length

      await resend.emails.send({
        from: 'invoices.kz <mail@invoices.kz>',
        to: p.email,
        subject: 'Ваш еженедельный отчёт invoices.kz',
        html: wrapEmail('#1C2056', 'Отчёт за неделю', `
          <p style="margin:0 0 12px; font-size:14px; color:#333;">За последние 7 дней:</p>
          <ul style="margin:0 0 12px; padding-left:18px; font-size:14px; color:#333;">
            <li>Создано счетов: <strong>${list.length}</strong></li>
            <li>Оплачено: <strong>${paid.length}</strong> на сумму <strong>${paidSum.toLocaleString('ru-KZ')} ₸</strong></li>
            <li>Ожидают оплаты: <strong>${unpaidCount}</strong></li>
          </ul>
        `),
      })
      reports++
    }
  }

  return NextResponse.json({ success: true, reminders, overdue, reports })
}
