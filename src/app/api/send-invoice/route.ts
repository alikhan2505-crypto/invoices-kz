import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { invoiceId } = await request.json()

    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (!inv) return NextResponse.json({ error: 'Счёт не найден' }, { status: 404 })
    if (!inv.client_email) return NextResponse.json({ error: 'Нет email клиента' }, { status: 400 })

    const publicLink = `https://invoices.kz/view/${inv.public_token}`
    const amount = Number(inv.amount).toLocaleString('ru-KZ')
    const date = new Date(inv.created_at).toLocaleDateString('ru-KZ')

    const servicesRows = (inv.services || []).map((s: any) => `
      <tr>
        <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; color: #374151;">${s.name}</td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">${s.qty} ${s.unit || 'шт'}</td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; text-align: right; color: #374151;">${Number(s.price).toLocaleString('ru-KZ')} ₸</td>
        <td style="padding: 10px 15px; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: bold; color: #1C2056;">${(s.qty * s.price).toLocaleString('ru-KZ')} ₸</td>
      </tr>
    `).join('')

    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: inv.client_email,
      subject: `Счёт №${inv.number} на ${amount} ₸ — ${inv.client_name}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family: Arial, sans-serif;">
  <div style="max-width:600px; margin:40px auto; border-radius:16px; overflow:hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1C2056 0%, #2a3080 100%); padding: 40px 30px; text-align:center;">
      <div style="color:#2DC48D; font-size:13px; font-weight:bold; letter-spacing:2px; margin-bottom:8px;">INVOICES.KZ</div>
      <h1 style="color:white; margin:0; font-size:28px; font-weight:bold;">Счёт на оплату</h1>
      <div style="color:rgba(255,255,255,0.6); margin-top:8px; font-size:14px;">№${inv.number} от ${date}</div>
    </div>

    <!-- Amount block -->
    <div style="background:#2DC48D; padding:25px 30px; text-align:center;">
      <div style="color:rgba(255,255,255,0.8); font-size:14px; margin-bottom:5px;">Сумма к оплате</div>
      <div style="color:white; font-size:36px; font-weight:bold;">${amount} ₸</div>
    </div>

    <!-- Body -->
    <div style="background:white; padding:30px;">
      <p style="color:#374151; font-size:16px; margin:0 0 20px;">
        Здравствуйте, <strong>${inv.client_name}</strong>!
      </p>
      <p style="color:#6b7280; font-size:14px; line-height:1.6; margin:0 0 25px;">
        Направляем вам счёт на оплату. Пожалуйста, ознакомьтесь с деталями и произведите оплату в ближайшее время.
      </p>

      <!-- Services table -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:25px; border-radius:10px; overflow:hidden; border: 1px solid #f3f4f6;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 15px; text-align:left; font-size:12px; color:#9ca3af; font-weight:600; text-transform:uppercase;">Наименование</th>
            <th style="padding:10px 15px; text-align:center; font-size:12px; color:#9ca3af; font-weight:600; text-transform:uppercase;">Кол-во</th>
            <th style="padding:10px 15px; text-align:right; font-size:12px; color:#9ca3af; font-weight:600; text-transform:uppercase;">Цена</th>
            <th style="padding:10px 15px; text-align:right; font-size:12px; color:#9ca3af; font-weight:600; text-transform:uppercase;">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${servicesRows}
          <tr style="background:#f9fafb;">
            <td colspan="3" style="padding:12px 15px; text-align:right; font-weight:bold; color:#1C2056;">Итого:</td>
            <td style="padding:12px 15px; text-align:right; font-weight:bold; color:#1C2056; font-size:16px;">${amount} ₸</td>
          </tr>
        </tbody>
      </table>

      ${inv.note ? `
      <div style="background:#f9fafb; border-left:3px solid #2DC48D; padding:12px 15px; border-radius:0 8px 8px 0; margin-bottom:25px;">
        <div style="font-size:12px; color:#9ca3af; margin-bottom:4px;">Примечание</div>
        <div style="font-size:14px; color:#374151;">${inv.note}</div>
      </div>
      ` : ''}

      <!-- CTA Button -->
      <a href="${publicLink}" style="display:block; background:linear-gradient(135deg, #2DC48D, #25a876); color:white; text-align:center; padding:16px; border-radius:12px; text-decoration:none; font-size:16px; font-weight:bold; margin:25px 0;">
        📄 Открыть счёт онлайн
      </a>

      <p style="color:#9ca3af; font-size:13px; text-align:center; margin:0;">
        Или перейдите по ссылке: <a href="${publicLink}" style="color:#2DC48D;">${publicLink}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb; padding:20px 30px; text-align:center; border-top:1px solid #f3f4f6;">
      <p style="color:#9ca3af; font-size:12px; margin:0;">
        Письмо отправлено через <a href="https://invoices.kz" style="color:#1C2056; text-decoration:none; font-weight:bold;">invoices.kz</a>
        — сервис для создания счетов онлайн
      </p>
    </div>

  </div>
</body>
</html>
      `
    })

    // Обновляем статус счёта на "отправлен"
    await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}