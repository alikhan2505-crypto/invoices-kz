// Цифры страницы «Обзор» AI-агента (15.10.2026). Все три показателя теперь
// считаются за одно и то же окно и по полному списку, а не по тому, что
// попало в таблицу:
//   - «Диалогов за неделю» -- /api/ai-agent/analytics?days=7, окно ниже;
//   - «Новых заявок» раньше считались за всё время (14 штук, последняя от
//     19.09) -- теперь за то же окно, по дате создания диалога;
//   - «Ждут человека» раньше считались по первым 5 строкам таблицы
//     (dialogs.slice(0, 5)) -- теперь по всем диалогам.
// Модуль чистый: без сети, без env, безопасен для клиентского бандла.

// Казахстан с марта 2024 живёт в едином UTC+5 -- постоянный сдвиг точен для
// календарных дней, та же константа, что в analytics/route.ts.
export const KZ_OFFSET_MS = 5 * 60 * 60 * 1000

// Окно «последние N календарных дней по Казахстану, включая сегодня».
// startShiftedMs -- полночь первого дня в «сдвинутом» времени (для ключей
// дней), sinceIso -- тот же момент в настоящем UTC (для фильтра по created_at).
export function kzWindowStart(days: number, nowMs: number): { startShiftedMs: number; sinceIso: string } {
  const shiftedNow = new Date(nowMs + KZ_OFFSET_MS)
  const startShiftedMs = Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate() - (days - 1))
  return { startShiftedMs, sinceIso: new Date(startShiftedMs - KZ_OFFSET_MS).toISOString() }
}

export function countNewLeadsSince(
  items: { leadStatus: string; createdAt: string }[],
  sinceIso: string,
): number {
  const since = new Date(sinceIso).getTime()
  return items.filter(i => i.leadStatus === 'new' && new Date(i.createdAt).getTime() >= since).length
}

export function countWaitingForHuman(items: { pausedForHuman: boolean }[]): number {
  return items.filter(i => i.pausedForHuman).length
}

// Когда была последняя активность в диалоге -- по казахстанскому времени,
// чтобы диалог от 19.09 не выглядел сегодняшним. «сегодня, 14:05» /
// «вчера, 09:30» / «19 сент., 14:05» / «19 сент. 2025 г., 14:05».
export function formatDialogWhen(iso: string, nowMs: number): string {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return '—'
  const shifted = new Date(ts + KZ_OFFSET_MS)
  const shiftedNow = new Date(nowMs + KZ_OFFSET_MS)
  const time = `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
  const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diffDays = Math.round((dayOf(shiftedNow) - dayOf(shifted)) / 86400000)
  if (diffDays === 0) return `сегодня, ${time}`
  if (diffDays === 1) return `вчера, ${time}`
  const sameYear = shifted.getUTCFullYear() === shiftedNow.getUTCFullYear()
  const date = shifted.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
    timeZone: 'UTC',
  })
  return `${date}, ${time}`
}
