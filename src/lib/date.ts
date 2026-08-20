const userTimeZone = typeof window !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'Asia/Almaty'

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-KZ', {
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
  return isNaN(new Date(dateStr).getTime()) ? dateStr : formatDate(dateStr)
}

export function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-KZ', {
    timeZone: userTimeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ru-KZ', {
    timeZone: userTimeZone,
    hour: '2-digit',
    minute: '2-digit',
  })
}