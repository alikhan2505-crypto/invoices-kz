// Письмо «Счёт №…» клиенту (src/app/api/send-invoice) — проверка адреса и
// сборка HTML. Вынесено из роута, чтобы экранирование и валидацию можно было
// проверить тестами: поля счёта (client_name, наименования услуг, примечание)
// вводит сам продавец, а письмо уходит от mail@invoices.kz с настоящими
// SPF/DKIM — подставлять их в HTML как есть нельзя.

import { escapeHtml } from '@/lib/htmlEscape'

/**
 * Один адрес: латиница/цифры/._%+- в локальной части, домен из меток с точками,
 * TLD — буквы, от двух. Без пробелов, запятых, точек с запятой, переводов
 * строки, скобок и угловых «Имя <a@b>». Намеренно строже looksLikeEmail: тот
 * гоняют по логину (чтобы не запереть человека), а здесь адрес получает почту
 * от нашего домена.
 */
const SINGLE_ADDRESS = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9_%+-])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/

export type RecipientCheck = { ok: true; email: string } | { ok: false }

/**
 * Получатель письма: строго строка (массив/объект/число — отказ, иначе Resend
 * принял бы до 50 адресов за вызов), без пробелов по краям, до 254 символов,
 * ровно один адрес.
 */
export function validateRecipientEmail(raw: unknown): RecipientCheck {
  if (typeof raw !== 'string') return { ok: false }
  const email = raw.trim()
  if (!email || email.length > 254) return { ok: false }
  if (email.includes('..')) return { ok: false }
  if (!SINGLE_ADDRESS.test(email)) return { ok: false }
  return { ok: true, email }
}

/** Число из поля счёта: всё, что не конечное число, — 0. */
export function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Строка для темы письма (тема — простой текст, HTML не экранируем): без переводов строки и управляющих символов, до 200 знаков. */
export function plainSubject(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Ссылка во внешний href — только https; всё остальное (javascript:, data:, относительные) отбрасываем. */
export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const s = url.trim()
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null
}

export interface InvoiceEmailInput {
  number: unknown
  amount: unknown
  clientName: unknown
  createdAt: unknown
  services: unknown
  note: unknown
  publicToken: unknown
  kaspiPaymentLink: string | null
}

export function invoiceEmailSubject(inv: Pick<InvoiceEmailInput, 'number' | 'amount' | 'clientName'>): string {
  const amount = num(inv.amount).toLocaleString('ru-KZ')
  return plainSubject(`Счёт №${inv.number ?? ''} на ${amount} ₸ — ${inv.clientName ?? ''}`)
}

export function buildInvoiceEmailHtml(inv: InvoiceEmailInput): string {
  const publicLink = `https://invoices.kz/view/${encodeURIComponent(String(inv.publicToken ?? ''))}`
  const amount = num(inv.amount).toLocaleString('ru-KZ')
  const created = new Date(String(inv.createdAt ?? ''))
  const date = isNaN(created.getTime()) ? '' : created.toLocaleDateString('ru-KZ')
  const kaspiLink = safeHttpsUrl(inv.kaspiPaymentLink)

  const services: any[] = Array.isArray(inv.services) ? inv.services : []
  const servicesRows = services.map((s: any) => {
    const qty = num(s?.qty)
    const price = num(s?.price)
    return `
        <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px; color:#333;">${escapeHtml(s?.name)}</td>
            <td style="padding:10px 12px; text-align:center; color:#555;">${qty} ${escapeHtml(s?.unit || 'шт')}</td>
            <td style="padding:10px 12px; text-align:right; color:#555;">${price.toLocaleString('ru-KZ')} ₸</td>
            <td style="padding:10px 12px; text-align:right; color:#333; font-weight:bold;">${(qty * price).toLocaleString('ru-KZ')} ₸</td>
        </tr>
        `
  }).join('')

  return `
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
    <div style="font-size:15px; font-weight:bold; color:#1C2056;">Счёт №${escapeHtml(inv.number)}</div>
    <div style="font-size:13px; color:#888;">от ${escapeHtml(date)}</div>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px;">
    <p style="margin:0 0 20px; font-size:14px; color:#333;">
      Уважаемый(ая) <strong>${escapeHtml(inv.clientName)}</strong>,
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
      <div style="font-size:13px; color:#333;">${escapeHtml(inv.note)}</div>
    </div>
    ` : ''}

    <!-- Button -->
    <a href="${escapeHtml(publicLink)}" style="display:block; background:#1C2056; color:white; text-align:center; padding:14px 20px; text-decoration:none; font-size:14px; font-weight:bold; letter-spacing:0.5px; margin-bottom:16px;">
      ОТКРЫТЬ СЧЁТ ОНЛАЙН →
    </a>

    ${kaspiLink ? `
    <a href="${escapeHtml(kaspiLink)}" style="display:block; background:#E4171F; color:white; text-align:center; padding:14px 20px; text-decoration:none; font-size:14px; font-weight:bold; letter-spacing:0.5px; margin-bottom:16px;">
      ОПЛАТИТЬ ЧЕРЕЗ KASPI →
    </a>
    ` : ''}

    <p style="font-size:12px; color:#aaa; text-align:center; margin:0;">
      <a href="${escapeHtml(publicLink)}" style="color:#aaa;">${escapeHtml(publicLink)}</a>
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
}
