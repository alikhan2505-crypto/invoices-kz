import { parseDbTimestamp } from './plan'

// UI language -> Intl locale for dates with month names. Default 'ru' keeps
// every existing caller (PDFs, documents, emails) exactly as before; screens
// pass the active UI language so «20 окт. 2026 г.» does not show up in English
// or Kazakh text (audit 17.10.2026, P2-6).
export type DateLang = 'ru' | 'kk' | 'en'
const DATE_LOCALE: Record<DateLang, string> = { ru: 'ru-KZ', kk: 'kk-KZ', en: 'en-GB' }
export function dateLocale(lang: DateLang = 'ru'): string {
  return DATE_LOCALE[lang] ?? DATE_LOCALE.ru
}

// Kazakh month names are written out here instead of asking Intl for 'kk-KZ':
// browsers whose ICU data lacks kk fell back to «2026 M10 15» (seen live in
// Chromium). The numbers still come from Intl, so the time zone rule is shared.
const KK_MONTHS_SHORT = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.']

function kkDateParts(d: Date, withTime: boolean) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: userTimeZone, day: 'numeric', month: 'numeric', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { day: get('day'), month: Number(get('month')), year: get('year'), hour: get('hour'), minute: get('minute') }
}

function kkDate(d: Date): string {
  const p = kkDateParts(d, false)
  return `${p.day} ${KK_MONTHS_SHORT[p.month - 1] ?? ''} ${p.year} ж.`
}

const userTimeZone = typeof window !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'Asia/Almaty'

// Колонки времени без пояса (invoices.created_at и др.) хранят UTC и приходят
// без смещения — new Date() читал их как местное время, и в Алматы время счёта
// показывалось на 5 часов раньше (найдено ревью 14.10.2026). Даты без времени
// ('2026-10-17') и строки со смещением parseDbTimestamp не трогает.
function toDate(dateStr: string): Date {
  return parseDbTimestamp(dateStr) ?? new Date(dateStr)
}

export function formatDate(dateStr: string, lang: DateLang = 'ru') {
  if (lang === 'kk') return kkDate(toDate(dateStr))
  return toDate(dateStr).toLocaleDateString(dateLocale(lang), {
    timeZone: userTimeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// «17.10.2026» — day.month.year in digits, same zone rule as formatDate.
// Used where a plan end date is quoted in a sentence («У вас тариф Про до …»).
export function formatDateNumeric(dateStr: string) {
  return toDate(dateStr).toLocaleDateString('ru-RU', {
    timeZone: userTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// contract_date is a free-text column: newer invoices store a real ISO date
// (native date-picker input), older ones store whatever the user typed into
// the old freeform text field (e.g. "20082026"). Format only when it parses
// as a real date; otherwise show the raw stored text rather than "Invalid Date".
export function formatDateSafe(dateStr: string, lang: DateLang = 'ru') {
  return isNaN(toDate(dateStr).getTime()) ? dateStr : formatDate(dateStr, lang)
}

export function formatDateTime(dateStr: string, lang: DateLang = 'ru') {
  if (lang === 'kk') {
    const d = toDate(dateStr)
    const p = kkDateParts(d, true)
    return `${p.day} ${KK_MONTHS_SHORT[p.month - 1] ?? ''} ${p.year} ж., ${p.hour}:${p.minute}`
  }
  return toDate(dateStr).toLocaleString(dateLocale(lang), {
    timeZone: userTimeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(dateStr: string, lang: DateLang = 'ru') {
  return toDate(dateStr).toLocaleTimeString(lang === 'kk' ? 'ru-KZ' : dateLocale(lang), {
    timeZone: userTimeZone,
    hour: '2-digit',
    minute: '2-digit',
  })
}