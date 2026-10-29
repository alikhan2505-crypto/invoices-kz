// Письмо «У контрагента на слежении появился признак риска».
//
// Одно письмо на пользователя в сутки: если ухудшились несколько БИН, все они
// в одном письме. Письмо по-русски, как все системные письма проекта (welcome-
// цепочка, BCC). В тексте только то, что нужно, чтобы понять, о ком речь и что
// изменилось: название и БИН (публичные данные реестров), агрегаты (сумма долга,
// число производств). Ни имён должников и судебных исполнителей, ни адреса, ни
// руководителя.

import { createHmac, timingSafeEqual } from 'crypto'
import type { Resend } from 'resend'
import { escapeHtml } from '@/lib/htmlEscape'
import { looksLikeEmail, normalizeEmail, verdictFromStatus } from '@/lib/emailDeliverability'
import { unreliableCategoriesText } from '@/lib/binRiskText'
import type { ChangeKey, WatchDetails } from './signals'

const SITE = 'https://invoices.kz'
const ACCENT = '#5B4CE0'

export interface MailItem {
  bin: string
  name: string | null
  keys: ChangeKey[]
  details: WatchDetails
}

// ---- подпись ссылки отписки ----

/**
 * Подпись ссылки «не получать такие письма». Свой пространство имён ('binwatch-unsub'),
 * чтобы подпись отписки от welcome-цепочки (unsubToken) не подошла сюда и наоборот.
 */
export function binWatchUnsubToken(userId: string): string {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`binwatch-unsub|${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

export function verifyBinWatchUnsub(userId: string, token: string): boolean {
  if (!userId || !token) return false
  const expected = binWatchUnsubToken(userId)
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

export function binWatchUnsubUrl(userId: string): string {
  return `${SITE}/api/bin-watch/unsubscribe?u=${encodeURIComponent(userId)}&t=${binWatchUnsubToken(userId)}`
}

// ---- тексты ----

const fmtTenge = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₸`

/** Одна строка «что изменилось» по ключу. Текст без тире и эмодзи. */
export function changeLineRu(key: ChangeKey, d: WatchDetails): string {
  switch (key) {
    case 'unreliable': {
      const why = unreliableCategoriesText(d.unreliableCategories, 'ru')
      return `Попал в список неблагонадёжных налогоплательщиков КГД${why ? ` (${why})` : ''}`
    }
    case 'bankrupt': return 'В списке КГД отмечен как банкрот по решению суда'
    case 'liquidating': return 'КГД сообщает о ликвидации'
    case 'registryClosed': return `В реестре статус изменился${d.status ? `: «${d.status}»` : ''}`
    case 'taxDebt': return d.totalArrear && d.totalArrear > 0
      ? `Появилась налоговая задолженность: ${fmtTenge(d.totalArrear)}`
      : 'Появилась налоговая задолженность'
    case 'enforcement': return d.enforcementCount
      ? `Найдены исполнительные производства: ${d.enforcementCount}${d.enforcementActive ? `, действующих ${d.enforcementActive}` : ''}`
      : 'Найдены исполнительные производства'
    case 'rehabilitation': return 'В отношении компании действует реабилитационная процедура'
    case 'vatLost': return 'Снят с регистрационного учёта по НДС'
  }
}

export function subjectFor(items: readonly MailItem[]): string {
  // Название идёт в тему письма: убираем переводы строк и управляющие символы.
  const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (items.length === 1) {
    const label = clean(items[0].name || `БИН ${items[0].bin}`)
    return `Контрагент ${label}: новый признак риска`
  }
  return `Изменения у ${items.length} контрагентов на слежении`
}

const link = (href: string, label: string) =>
  `<a href="${href}" style="color:${ACCENT};font-weight:bold;">${label}</a>`

/** Ссылка со своими метками, чтобы переходы из письма различались в аналитике. */
export function mailUrl(path: string): string {
  const u = new URL(path, SITE)
  u.searchParams.set('utm_source', 'binwatch')
  u.searchParams.set('utm_medium', 'email')
  u.searchParams.set('utm_campaign', 'bin_watch_changed')
  return u.toString().replace(/&/g, '&amp;')
}

export function buildBinWatchEmail(items: readonly MailItem[], unsubUrl: string): { subject: string; html: string } {
  const blocks = items.map(it => {
    const title = escapeHtml(it.name || 'Компания')
    const lines = it.keys
      .map(k => `<li style="margin:0 0 4px;">${escapeHtml(changeLineRu(k, it.details))}</li>`)
      .join('')
    return `
      <div style="margin:0 0 18px;padding:14px 16px;border:1px solid #e6e3f7;border-radius:10px;">
        <div style="font-weight:bold;font-size:16px;">${title}</div>
        <div style="font-size:13px;color:#777;margin:2px 0 8px;">БИН ${escapeHtml(it.bin)}</div>
        <ul style="margin:0;padding-left:18px;">${lines}</ul>
      </div>`
  }).join('')

  const manage = mailUrl('/profile/bin-watch')
  const html = `
<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e0e0e0;">
  <div style="background:#1C2056;padding:20px 24px;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">INVOICES<span style="color:#A99EF0;">.KZ</span></span>
  </div>
  <div style="padding:24px;font-size:15px;color:#333;line-height:1.6;">
    <p style="margin:0 0 14px;">Вы следите за ${items.length === 1 ? 'этим контрагентом' : 'этими контрагентами'}. По данным госреестров с прошлой проверки появились новые признаки риска:</p>
    ${blocks}
    <p style="margin:0 0 18px;">Данные из реестров КГД и Минюста, мы только сравниваем проверки. Перед отгрузкой или предоплатой посмотрите подробности на странице слежения и, если нужно, уточните у самой компании.</p>
    <p style="margin:0;">${link(manage, 'Открыть список слежения')}</p>
  </div>
  <div style="padding:16px 24px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.5;">
    Вы получили это письмо, потому что поставили БИН на слежение на invoices.kz.
    Письмо приходит не чаще раза в сутки.
    <a href="${unsubUrl.replace(/&/g, '&amp;')}" style="color:#999;">Не получать такие письма</a>
  </div>
</div></body></html>`
  return { subject: subjectFor(items), html }
}

// ---- отправка ----

/** Ключ идемпотентности Resend: повторный вызов крона в те же сутки не пошлёт второе письмо (окно 24 ч). */
export const binWatchIdempotencyKey = (userId: string, day: string) => `bin-watch/${userId}/${day}`

/**
 * Адрес в списке подавленных Resend? Недоступность проверки не повод молчать
 * (unknown = шлём), как и у magic-link и welcome-цепочки.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    return verdictFromStatus(res.status) === 'undeliverable'
  } catch {
    return false
  }
}

/**
 * true - отправили; false - пропустили (адрес негодный или подавлен); бросает,
 * если Resend отказал (вызывающий освободит слот суток и попробует завтра).
 */
export async function sendBinWatchMail(
  resend: Resend,
  to: { userId: string; email: string | null | undefined },
  items: readonly MailItem[],
  day: string,
): Promise<boolean> {
  const email = normalizeEmail(to.email)
  if (!looksLikeEmail(email)) return false
  if (await isSuppressed(email)) return false
  const unsub = binWatchUnsubUrl(to.userId)
  const { subject, html } = buildBinWatchEmail(items, unsub)
  const { error } = await resend.emails.send({
    from: 'invoices.kz <mail@invoices.kz>',
    to: email,
    subject,
    html,
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }, { idempotencyKey: binWatchIdempotencyKey(to.userId, day) })
  // Resend SDK не бросает на ошибке API, а возвращает { error }.
  if (error) throw new Error(`resend: ${error.message}`)
  return true
}
