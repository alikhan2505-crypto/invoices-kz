import { parseDbTimestamp } from './plan'

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

export function formatDate(dateStr: string) {
  return toDate(dateStr).toLocaleDateString('ru-KZ', {
    timeZone: userTimeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// contract_date is a free-text column: newer invoices store a real ISO date
// (native date-picker input), older ones store whatever the user typed into
// the old freeform text field (e.g. "20082026"). Format only when it parses
// as a real date; otherwise show the raw stored text rather than "Invalid Date".
export function formatDateSafe(dateStr: string) {
  return isNaN(toDate(dateStr).getTime()) ? dateStr : formatDate(dateStr)
}

export function formatDateTime(dateStr: string) {
  return toDate(dateStr).toLocaleString('ru-KZ', {
    timeZone: userTimeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(dateStr: string) {
  return toDate(dateStr).toLocaleTimeString('ru-KZ', {
    timeZone: userTimeZone,
    hour: '2-digit',
    minute: '2-digit',
  })
}