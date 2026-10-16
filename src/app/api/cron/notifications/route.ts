import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import { createNotification } from '@/lib/notifications'
import { addDaysToDateString, todayDateString } from '@/lib/dueDate'
import { loadDigestData, formatDigest } from '@/lib/kaspiShop/dailyDigest'
import { hasKaspiShopAccess, KASPI_SHOP_PROFILE_COLUMNS } from '@/lib/kaspiShop/planGate'
import { NOTIFY_PROFILE_COLUMNS, wantsNotification, type NotifyProfile } from '@/lib/notificationPrefs'
import { selectWithNotificationPrefs } from '@/lib/notificationPrefsServer'
import { escapeHtml } from '@/lib/htmlEscape'

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

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let reminders = 0
  let overdue = 0
  let reports = 0

  // --- Payment reminder ---
  // Invoices with a real due_date: remind exactly 1 day before it's due
  // (date equality is safe against double-sending since the cron runs once
  // a day). Invoices without one (every invoice created before this
  // feature existed, or wherever the date was cleared): keep the original
  // heuristic, 3 days after the invoice was sent, still unpaid.
  // Владелец и его настройки едут вложенным select'ом; notification_prefs
  // добавляется, только если колонка уже есть (selectWithNotificationPrefs).
  const reminderDueDateTarget = addDaysToDateString(todayDateString(), 1)
  const { data: reminderByDueDate } = await selectWithNotificationPrefs<any[]>(NOTIFY_PROFILE_COLUMNS, cols => supabase
    .from('invoices')
    .select(`id, number, amount, client_name, profiles(${cols})`)
    .in('status', ['sent', 'viewed'])
    .eq('due_date', reminderDueDateTarget))

  const { data: reminderLegacy } = await selectWithNotificationPrefs<any[]>(NOTIFY_PROFILE_COLUMNS, cols => supabase
    .from('invoices')
    .select(`id, number, amount, client_name, profiles(${cols})`)
    .in('status', ['sent', 'viewed'])
    .is('due_date', null)
    .gte('created_at', startOfDayAgo(3).toISOString())
    .lt('created_at', startOfDayAgo(2).toISOString()))

  for (const inv of [...(reminderByDueDate || []), ...(reminderLegacy || [])] as any[]) {
    const owner = inv.profiles as NotifyProfile | null
    const clientName = escapeHtml(inv.client_name || '')
    const number = escapeHtml(inv.number)
    if (wantsNotification(owner, 'invoice_due_tomorrow', 'email')) {
      try {
        await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: owner!.email as string,
          subject: `Напоминание: счёт №${inv.number} ещё не оплачен`,
          html: wrapEmail('#F5A623', 'Напоминание об оплате', `
            <p style="margin:0 0 12px; font-size:14px; color:#333;">
              Счёт №${number} для <strong>${clientName}</strong> на сумму
              <strong>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong> ещё не оплачен.
            </p>
          `),
        })
        reminders++
      } catch (e: any) {
        console.error('cron/notifications: reminder email failed for invoice', inv.id, ':', e.message)
      }
    }
    if (wantsNotification(owner, 'invoice_due_tomorrow', 'telegram')) {
      await sendTelegramNotification(owner!.telegram_chat_id as string,
        `⏰ Счёт №${number} для <b>${clientName}</b> на сумму <b>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</b> ещё не оплачен.`)
    }
  }

  // --- Overdue: transition status + notify owner ---
  // Invoices with a real due_date: overdue once the due date is more than
  // 1 day in the past (a short grace period). Invoices without one: the
  // original heuristic, 7+ days since the invoice was sent.
  const overdueDueDateTarget = addDaysToDateString(todayDateString(), -1)
  const { data: overdueByDueDate } = await selectWithNotificationPrefs<any[]>(NOTIFY_PROFILE_COLUMNS, cols => supabase
    .from('invoices')
    .select(`id, number, amount, client_name, profiles(${cols})`)
    .in('status', ['sent', 'viewed'])
    .lt('due_date', overdueDueDateTarget))

  const { data: overdueLegacy } = await selectWithNotificationPrefs<any[]>(NOTIFY_PROFILE_COLUMNS, cols => supabase
    .from('invoices')
    .select(`id, number, amount, client_name, profiles(${cols})`)
    .in('status', ['sent', 'viewed'])
    .is('due_date', null)
    .lt('created_at', startOfDayAgo(7).toISOString()))

  for (const inv of [...(overdueByDueDate || []), ...(overdueLegacy || [])] as any[]) {
    await supabase.from('invoices').update({ status: 'overdue' }).eq('id', inv.id)
    const owner = inv.profiles as NotifyProfile | null
    const clientName = escapeHtml(inv.client_name || '')
    const number = escapeHtml(inv.number)
    if (wantsNotification(owner, 'invoice_overdue', 'email')) {
      try {
        await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: owner!.email as string,
          subject: `Счёт №${inv.number} просрочен`,
          html: wrapEmail('#E05252', 'Счёт просрочен', `
            <p style="margin:0 0 12px; font-size:14px; color:#333;">
              Счёт №${number} для <strong>${clientName}</strong> на сумму
              <strong>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong> не оплачен и помечен как просроченный.
            </p>
          `),
        })
        overdue++
      } catch (e: any) {
        console.error('cron/notifications: overdue email failed for invoice', inv.id, ':', e.message)
      }
    }
    if (wantsNotification(owner, 'invoice_overdue', 'telegram')) {
      await sendTelegramNotification(owner!.telegram_chat_id as string,
        `🔴 Счёт №${number} для <b>${clientName}</b> на сумму <b>${Number(inv.amount).toLocaleString('ru-KZ')} ₸</b> не оплачен и помечен как просроченный.`)
    }
  }

  // --- Daily in-app bell: unpaid invoices summary ---
  // Replaces the permanent «N неоплаченных» pill that used to live in the
  // SiteNav bar. Runs once per cron day; the previous day's summary row is
  // deleted first so the bell always holds ONE current summary per user
  // instead of a growing daily pile.
  let unpaidBells = 0
  {
    const { data: unpaidRows } = await supabase
      .from('invoices')
      .select('user_id')
      .in('status', ['sent', 'viewed', 'overdue'])
    const unpaidByUser = new Map<string, number>()
    for (const row of (unpaidRows || []) as { user_id: string }[]) {
      unpaidByUser.set(row.user_id, (unpaidByUser.get(row.user_id) || 0) + 1)
    }
    for (const [userId, count] of unpaidByUser) {
      await supabase.from('app_notifications').delete()
        .eq('user_id', userId)
        .eq('link', '/history')
        .like('title', 'Неоплаченных счетов%')
      await createNotification(
        userId,
        `Неоплаченных счетов: ${count}`,
        'Откройте историю, чтобы посмотреть и напомнить клиентам об оплате.',
        '/history'
      )
      unpaidBells++
    }
  }

  // --- Weekly report: Mondays only ---
  if (new Date().getUTCDay() === 1) {
    // Кандидаты: включён старый флаг отчёта ИЛИ заполнены хоть какие-то
    // notification_prefs (до миграции — только старый флаг).
    // Раньше брались все с notify_telegram, и Telegram-отчёт уходил даже при
    // выключенном отчёте — теперь решает wantsNotification по каналу.
    const { data: profiles, error: weeklyError } = await selectWithNotificationPrefs<any[]>(
      `id, ${NOTIFY_PROFILE_COLUMNS}`,
      cols => {
        const q = supabase.from('profiles').select(cols)
        return cols.includes('notification_prefs')
          ? q.or('notify_weekly_report.eq.true,notification_prefs.not.is.null')
          : q.eq('notify_weekly_report', true)
      },
    )
    if (weeklyError) console.error('cron/notifications: weekly report recipients lookup failed:', weeklyError.message)

    for (const p of (profiles || []) as (NotifyProfile & { id: string })[]) {
      const wantsEmail = wantsNotification(p, 'weekly_report', 'email')
      const wantsTelegram = wantsNotification(p, 'weekly_report', 'telegram')
      if (!wantsEmail && !wantsTelegram) continue

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

      if (wantsEmail) {
        try {
          await resend.emails.send({
            from: 'invoices.kz <mail@invoices.kz>',
            to: p.email as string,
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
        } catch (e: any) {
          console.error('cron/notifications: weekly report email failed for profile', p.id, ':', e.message)
        }
      }
      if (wantsTelegram) {
        await sendTelegramNotification(p.telegram_chat_id as string,
          `📊 <b>Отчёт за неделю</b>\nСоздано счетов: ${list.length}\nОплачено: ${paid.length} на сумму ${paidSum.toLocaleString('ru-KZ')} ₸\nОжидают оплаты: ${unpaidCount}`)
      }
    }
  }

  // --- Daily Kaspi shop digest (Telegram only) ---
  // Its own event (kaspi_daily_digest) in notification_prefs; until the
  // owner chooses, it follows the old notify_telegram toggle, as before.
  // formatDigest returns null on a genuinely quiet day, so silence
  // is the default and nobody gets a daily "ничего не произошло".
  //
  // Kaspi Bot is a Pro feature (founder decision, 14.10.2026): once a
  // seller's Pro has ended the digest simply stops -- same rule as the
  // cabinet API gate and the repricer (hasKaspiShopAccess: admin or
  // canKaspiShop). The plan columns ride the same profiles query, so no
  // per-seller lookup. Only this section is gated: the invoice reminders,
  // overdue notices and weekly report above still go to everyone who asked.
  // Renewing Pro resumes the digest on the next run; nothing is changed.
  let digests = 0
  let digestsSkippedNoPlan = 0
  const { data: shopOwners, error: shopOwnersError } = await selectWithNotificationPrefs<any[]>(
    `id, ${NOTIFY_PROFILE_COLUMNS}, ${KASPI_SHOP_PROFILE_COLUMNS}`,
    cols => supabase
      .from('profiles')
      .select(cols)
      .not('telegram_chat_id', 'is', null),
  )
  if (shopOwnersError) console.error('cron/notifications: kaspi digest recipients lookup failed:', shopOwnersError.message)

  const digestRecipients = (shopOwners || []).filter((owner: any) => {
    if (!wantsNotification(owner, 'kaspi_daily_digest', 'telegram')) return false
    if (hasKaspiShopAccess(owner)) return true
    digestsSkippedNoPlan++
    return false
  })

  for (const owner of digestRecipients) {
    try {
      const digestData = await loadDigestData(supabase, owner.id, startOfDayAgo(1))
      const text = formatDigest(digestData)
      if (!text) continue
      await sendTelegramNotification(owner.telegram_chat_id, text)
      digests++
    } catch (e: any) {
      // One seller's broken digest must never stop the rest of the loop --
      // same contract as every other section of this cron.
      console.error('cron/notifications: kaspi digest failed for profile', owner.id, ':', e.message)
    }
  }

  return NextResponse.json({ success: true, reminders, overdue, reports, unpaidBells, digests, digestsSkippedNoPlan })
}
