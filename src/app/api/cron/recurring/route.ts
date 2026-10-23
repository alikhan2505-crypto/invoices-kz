import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { isCronAuthorized } from '@/lib/cronAuth'
import { getActivePlan } from '@/lib/plan'
import { escapeHtml } from '@/lib/htmlEscape'
import { currentPeriodStart, shouldSkipRecurringOwner } from '@/lib/recurringGuard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function GET(request: Request) {
  // Защита от случайного вызова
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  // Начало текущего периода (месяц, UTC): один оригинал даёт не больше одной
  // копии за период, сколько бы раз ни дёрнули крон (ретрай, ручной вызов).
  const periodStart = currentPeriodStart(today)

  // Берём все активные повторяющиеся счета у которых не истёк срок
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*, profiles(*)')
    .eq('recurring_active', true)
    .gte('recurring_until', today.toISOString().split('T')[0])
    .is('recurring_parent_id', null) // только оригинальные счета

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let created = 0
  let skipped = 0

  for (const inv of invoices || []) {
    // Владелец без Про (Free, просрочка, пробный, бонус) и удалённый аккаунт
    // автосчета не получают: recurring_active можно выставить прямым REST,
    // а service-role обходит триггер лимита счетов. Плану верим только по
    // профилю, подтянутому join'ом; нет профиля — тоже пропуск.
    if (shouldSkipRecurringOwner(inv.profiles, getActivePlan(inv.profiles, today))) { skipped++; continue }

    let claimedMarker = false
    try {
      // Уже есть копия за этот период — пропускаем. Ошибка проверки = пропуск:
      // дубль счёта хуже пропущенного (следующий прогон проверит снова).
      const { data: already, error: alreadyError } = await supabase
        .from('invoices')
        .select('id')
        .eq('recurring_parent_id', inv.id)
        .gte('created_at', periodStart.toISOString())
        .limit(1)
      if (alreadyError) throw alreadyError
      if (already && already.length > 0) { skipped++; continue }

      // Атомарный захват периода, если миграция invoices_recurring_period_guard.sql
      // применена (колонка приходит в select('*') только тогда): условный update
      // сработает у одного из двух параллельных вызовов. Без колонки — остаётся
      // проверка выше.
      if ('recurring_last_generated' in inv) {
        const periodDate = periodStart.toISOString().split('T')[0]
        const { data: claimed, error: claimError } = await supabase
          .from('invoices')
          .update({ recurring_last_generated: periodDate })
          .eq('id', inv.id)
          .or(`recurring_last_generated.is.null,recurring_last_generated.lt.${periodDate}`)
          .select('id')
        if (claimError) throw claimError
        if (!claimed || claimed.length === 0) { skipped++; continue }
        claimedMarker = true
      }

      // Атомарно получаем следующий номер счёта (без гонки при параллельном запуске)
      const { data: invoiceNumber, error: numberError } = await supabase
        .rpc('claim_invoice_number', { p_user_id: inv.user_id })
      if (numberError) throw numberError

      // Создаём новый счёт
      const { data: newInvoice, error: insertError } = await supabase.from('invoices').insert({
        user_id: inv.user_id,
        number: invoiceNumber,
        amount: inv.amount,
        status: 'sent',
        client_name: inv.client_name,
        client_bin: inv.client_bin,
        client_email: inv.client_email,
        client_address: inv.client_address,
        services: inv.services,
        note: inv.note,
        recurring_active: false, // копия не повторяется
        recurring_parent_id: inv.id,
      }).select().single()
      if (insertError || !newInvoice) throw insertError ?? new Error('recurring copy was not created')
      claimedMarker = false // копия создана: период занят, возвращать нечего

      // Отправляем email клиенту если есть email
      if (inv.client_email && newInvoice) {
        const publicLink = `https://invoices.kz/view/${newInvoice.public_token}`

        await resend.emails.send({
          from: 'invoices.kz <mail@invoices.kz>',
          to: inv.client_email,
          subject: `Счёт №${invoiceNumber} на ${Number(inv.amount).toLocaleString('ru-KZ')} ₸`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1C2056; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">INVOICES.KZ</h1>
              </div>
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
                <p style="font-size: 16px; color: #374151;">Здравствуйте, <strong>${escapeHtml(inv.client_name)}</strong>!</p>
                <p style="color: #6b7280;">Вам выставлен счёт на оплату.</p>
                
                <div style="background: white; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: #6b7280;">Номер счёта</span>
                    <strong style="color: #1C2056;">${escapeHtml(invoiceNumber)}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: #6b7280;">Сумма</span>
                    <strong style="color: #1C2056; font-size: 18px;">${Number(inv.amount).toLocaleString('ru-KZ')} ₸</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #6b7280;">Дата</span>
                    <strong style="color: #1C2056;">${today.toLocaleDateString('ru-KZ')}</strong>
                  </div>
                </div>

                <a href="${escapeHtml(publicLink)}" 
                   style="display: block; background: #2DC48D; color: white; text-align: center; padding: 14px; border-radius: 10px; text-decoration: none; font-size: 16px; font-weight: bold; margin: 20px 0;">
                  📄 Открыть счёт
                </a>

                ${inv.note ? `<p style="color: #6b7280; font-size: 14px; margin-top: 15px;">Примечание: ${escapeHtml(inv.note)}</p>` : ''}
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                  Это автоматическое письмо от invoices.kz
                </p>
              </div>
            </div>
          `
        })
      }

      created++
    } catch (e) {
      console.error('Error processing invoice:', inv.id, e)
      // Копия не создана — отдаём период обратно, чтобы следующий прогон мог
      // попробовать снова (marker не должен «съесть» месяц без счёта).
      if (claimedMarker) {
        await supabase.from('invoices').update({ recurring_last_generated: null }).eq('id', inv.id)
      }
    }
  }

  return NextResponse.json({ success: true, created, skipped })
}