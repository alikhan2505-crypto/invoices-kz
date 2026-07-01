import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, overrideEmail } = await request.json()

    const accessToken = request.headers.get('authorization')?.replace('Bearer ', '')
    const { data: { user } } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null } }
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (!inv) return NextResponse.json({ error: 'Счёт не найден' }, { status: 404 })
    if (inv.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const recipientEmail = overrideEmail || inv.client_email
    if (!recipientEmail) return NextResponse.json({ error: 'Нет email клиента' }, { status: 400 })

    const publicLink = `https://invoices.kz/view/${inv.public_token}`
    const amount = Number(inv.amount).toLocaleString('ru-KZ')
    const date = new Date(inv.created_at).toLocaleDateString('ru-KZ')

    const servicesRows = (inv.services || []).map((s: any) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px; color:#333;">${s.name}</td>
            <td style="padding:10px 12px; text-align:center; color:#555;">${s.qty} ${s.unit || 'шт'}</td>
            <td style="padding:10px 12px; text-align:right; color:#555;">${Number(s.price).toLocaleString('ru-KZ')} ₸</td>
            <td style="padding:10px 12px; text-align:right; color:#333; font-weight:bold;">${(s.qty * s.price).toLocaleString('ru-KZ')} ₸</td>
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
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">

  <!-- Header -->
  <div style="background:#1C2056; padding:24px 32px; display:flex; justify-content:space-between; align-items:center;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">INVOICES.KZ</div>
    <div style="color:rgba(255,255,255,0.6); font-size:13px;">Сервис выставления счетов</div>
  </div>

  <!-- Title bar -->
  <div style="background:#f9f9f9; border-bottom:1px solid #e0e0e0; padding:16px 32px; display:flex; justify-content:space-between; align-items:center;">
    <div style="font-size:15px; font-weight:bold; color:#1C2056;">Счёт №${inv.number}</div>
    <div style="font-size:13px; color:#888;">от ${date}</div>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px;">
    <p style="margin:0 0 20px; font-size:14px; color:#333;">
      Уважаемый(ая) <strong>${inv.client_name}</strong>,
    </p>
    <p style="margin:0 0 24px; font-size:14px; color:#555; line-height:1.6;">
      Настоящим направляем Вам счёт на оплату. Просим произвести оплату в установленные сроки.
    </p>

    <!-- Services table -->
    <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">
      <thead>
        <tr style="background:#f5f5f5; border-top:1px solid #e0e0e0; border-bottom:1px solid #e0e0e0;">
          <th style="padding:10px 12px; text-align:left; color:#888; font-weight:600;">Наименование</th>
          <th style="padding:10px 12px; text-align:center; color:#888; font-weight:600;">Кол-во</th>
          <th style="padding:10px 12px; text-align:right; color:#888; font-weight:600;">Цена</th>
          <th style="padding:10px 12px; text-align:right; color:#888; font-weight:600;">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${servicesRows}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #1C2056;">
          <td colspan="3" style="padding:12px; text-align:right; font-weight:bold; color:#1C2056; font-size:14px;">Итого к оплате:</td>
          <td style="padding:12px; text-align:right; font-weight:bold; color:#1C2056; font-size:16px;">${amount} ₸</td>
        </tr>
      </tfoot>
    </table>

    ${inv.note ? `
    <div style="border:1px solid #e0e0e0; border-left:3px solid #1C2056; padding:12px 16px; margin-bottom:24px; background:#fafafa;">
      <div style="font-size:11px; color:#888; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Примечание</div>
      <div style="font-size:13px; color:#333;">${inv.note}</div>
    </div>
    ` : ''}

    <!-- Button -->
    <a href="${publicLink}" style="display:block; background:#1C2056; color:white; text-align:center; padding:14px 20px; text-decoration:none; font-size:14px; font-weight:bold; letter-spacing:0.5px; margin-bottom:16px;">
      ОТКРЫТЬ СЧЁТ ОНЛАЙН →
    </a>

    <p style="font-size:12px; color:#aaa; text-align:center; margin:0;">
      <a href="${publicLink}" style="color:#aaa;">${publicLink}</a>
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#f5f5f5; border-top:1px solid #e0e0e0; padding:16px 32px; text-align:center;">
    <p style="margin:0; font-size:12px; color:#aaa;">
      Письмо сформировано автоматически через <strong style="color:#1C2056;">invoices.kz</strong>
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