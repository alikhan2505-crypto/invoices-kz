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