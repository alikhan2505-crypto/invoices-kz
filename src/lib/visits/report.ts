import { almatyDaysBetween, formatAlmatyDay } from './almatyDay'

// Текст ежедневного отчёта «Машина/QR» для основателя. Только текст — без
// отправки: сегодня он уходит в Telegram (src/app/api/cron/car-report), завтра
// может уйти в WhatsApp тем же текстом. Простой текст без HTML/Markdown,
// чтобы любой транспорт отправил его как есть. null в любом числе = «н/д»
// (запрос сломался), а не ноль.

export interface DayCounts {
  visits: number | null
  newVisitors: number | null
  carExact: number | null
  carLikely: number | null
  carSignups: number | null
  signups: number | null
}

export interface WeekCounts {
  carVisits: number | null
  carSignups: number | null
  signups: number | null
}

export interface CarReportData {
  day: string // YYYY-MM-DD по Алматы
  asOf: string // HH:MM по Алматы — момент сбора (крон Hobby гуляет в пределах часа)
  // День первой строки site_visits (null — строк нет): первую неделю «новые»
  // завышены, потому что старые браузеры ещё не помечены.
  trackingSince: string | null
  // site_visits / signup_sources ещё не созданы (миграция не применена).
  tablesMissing: boolean
  today: DayCounts
  yesterday: DayCounts
  week: WeekCounts
}

export function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const fmt = (n: number | null) => (n === null ? 'н/д' : String(n))
const sum = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b)
const visitsWord = (n: number | null) => (n === null ? 'заходов' : ruPlural(n, 'заход', 'захода', 'заходов'))

export const LIKELY_CAVEAT =
  '«Точно» — по адресу /car или /qr, каждый телефон один раз. «Вероятно» — оценка: первый заход с телефона на главную без ссылки-источника и без входа; сюда попадают и те, кто просто набрал адрес сам.'

export const COLD_START_DAYS = 7
export const coldStartCaveat = (since: string) =>
  `Счётчик работает с ${formatAlmatyDay(since).slice(0, 5)}: первую неделю «новых» и «вероятно» больше, чем на деле — браузеры прежних посетителей ещё не помечены.`

export function buildCarReportText(d: CarReportData): string {
  const title = `INVOICES.KZ — машина/QR, ${formatAlmatyDay(d.day)}, на ${d.asOf}`

  if (d.tablesMissing) {
    return [
      title,
      '',
      'Счётчик заходов ещё не включён: таблицы site_visits и signup_sources не созданы.',
      'Запустите supabase/migrations/site_visits.sql в Supabase → SQL Editor.',
      '',
      `Регистраций сегодня: ${fmt(d.today.signups)} (вчера за весь день ${fmt(d.yesterday.signups)})`,
    ].join('\n')
  }

  const t = d.today
  const y = d.yesterday
  const carToday = sum(t.carExact, t.carLikely)
  const carYesterday = sum(y.carExact, y.carLikely)

  // «Сегодня» — с полуночи до момента сбора, «вчера» — полные сутки: так
  // заходы после отправки отчёта не теряются, а попадают во «вчера» завтра.
  const lines = [
    title,
    '',
    `Машина/QR: ${fmt(carToday)} ${visitsWord(carToday)} (точно по QR: ${fmt(t.carExact)}, вероятно: ${fmt(t.carLikely)}), регистраций от них: ${fmt(t.carSignups)}`,
    `Вчера за весь день: ${fmt(carYesterday)} (точно ${fmt(y.carExact)}, вероятно ${fmt(y.carLikely)}), регистраций ${fmt(y.carSignups)}`,
    `За 7 дней: ${fmt(d.week.carVisits)} ${visitsWord(d.week.carVisits)}, регистраций ${fmt(d.week.carSignups)}`,
    '',
    `Весь сайт сегодня: ${fmt(t.visits)} ${visitsWord(t.visits)}, новых посетителей ${fmt(t.newVisitors)} (вчера за весь день ${fmt(y.visits)} и ${fmt(y.newVisitors)})`,
    `Регистраций сегодня: ${fmt(t.signups)} (вчера за весь день ${fmt(y.signups)}, за 7 дней ${fmt(d.week.signups)})`,
    '',
    LIKELY_CAVEAT,
  ]
  if (d.trackingSince && almatyDaysBetween(d.trackingSince, d.day) < COLD_START_DAYS) {
    lines.push(coldStartCaveat(d.trackingSince))
  }
  return lines.join('\n')
}
