// Чистая логика рассылок (src/app/api/ai-agent/broadcasts/route.ts).
//
// Рассылка отправляется внутри одного запроса (maxDuration = 300 с). Отсюда
// две ловушки, найденные аудитом 15.10.2026:
//  1. Обрыв связи у владельца посреди отправки: сервер дошлёт всё, а страница
//     покажет «Попробуйте ещё раз» -- повтор разослал бы всё второй раз.
//     Защита на сервере: тот же текст тем же агентом в тот же канал за
//     последние BROADCAST_DUPLICATE_WINDOW_MS не отправляется повторно, а
//     возвращается уже существующая рассылка.
//  2. Функция упала (таймаут, деплой): строка навсегда оставалась
//     «Отправляется…». Строка в статусе sending старше, чем функция вообще
//     может жить, помечается failed при следующей загрузке списка.

export const BROADCAST_MAX_DURATION_S = 300
// С запасом поверх maxDuration: живая отправка к этому моменту гарантированно
// завершилась (Vercel убивает функцию по таймауту).
export const BROADCAST_STALE_AFTER_MS = (BROADCAST_MAX_DURATION_S + 300) * 1000
export const BROADCAST_DUPLICATE_WINDOW_MS = 15 * 60 * 1000
// Как часто сохранять прогресс (счётчики + история) во время отправки, чтобы
// упавшая на середине рассылка показала честное «отправлено N».
export const BROADCAST_PROGRESS_EVERY = 25

export function isStaleSendingBroadcast(b: { status: string; created_at: string }, now: Date): boolean {
  if (b.status !== 'sending') return false
  const created = new Date(b.created_at).getTime()
  return Number.isFinite(created) && now.getTime() - created >= BROADCAST_STALE_AFTER_MS
}

export function normalizeBroadcastText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

// Повтор той же рассылки: тот же агент, канал и текст (с точностью до
// пробелов), недавняя и не упавшая. Упавшую (failed) можно отправить снова --
// это осознанное действие владельца, который видит «прервана» в истории.
export function findRecentDuplicateBroadcast<T extends { agent_id: string; channel: string; message: string; status: string; created_at: string }>(
  candidate: { agentId: string; channel: string; message: string },
  recent: T[],
  now: Date,
): T | null {
  const text = normalizeBroadcastText(candidate.message)
  for (const b of recent) {
    if (b.agent_id !== candidate.agentId || b.channel !== candidate.channel) continue
    if (b.status === 'failed') continue
    if (isStaleSendingBroadcast(b, now)) continue
    const created = new Date(b.created_at).getTime()
    if (!Number.isFinite(created) || now.getTime() - created > BROADCAST_DUPLICATE_WINDOW_MS) continue
    if (normalizeBroadcastText(b.message) === text) return b
  }
  return null
}

// Гонка двух одновременных нажатий (проверка -> сбор получателей -> вставка):
// обе проверки могли не увидеть друг друга и разослать текст дважды. Поэтому
// маршрут сначала вставляет свою строку 'sending', а потом ищет дубль заново;
// из двух одинаковых рассылок продолжает только более ранняя (created_at, при
// равенстве -- меньший id), более поздняя отменяется до первой отправки.
// Каждый запрос читает уже после своей вставки, поэтому хотя бы один из двух
// обязательно видит другого.
export function findOlderDuplicateBroadcast<T extends { id: string; agent_id: string; channel: string; message: string; status: string; created_at: string }>(
  own: { id: string; created_at: string },
  recent: T[],
  now: Date,
): T | null {
  const ownMeta = recent.find(b => b.id === own.id)
  const ownTime = new Date(own.created_at).getTime()
  const others = recent.filter(b => {
    if (b.id === own.id) return false
    const t = new Date(b.created_at).getTime()
    if (!Number.isFinite(t) || !Number.isFinite(ownTime)) return false
    return t < ownTime || (t === ownTime && b.id < own.id)
  })
  if (!ownMeta) return null
  return findRecentDuplicateBroadcast({ agentId: ownMeta.agent_id, channel: ownMeta.channel, message: ownMeta.message }, others, now)
}

// Для страницы после обрыва связи: есть ли в только что перезагруженной
// истории эта рассылка (уходит или уже ушла). Нет -- значит, до сервера
// запрос не дошёл, и её надо отправить ещё раз.
export function findBroadcastAfterDrop<T extends { agentId: string; channel: string; message: string; status: string; createdAt: string }>(
  candidate: { agentId: string; channel: string; message: string },
  list: T[],
  now: Date,
): T | null {
  const text = normalizeBroadcastText(candidate.message)
  for (const b of list) {
    if (b.agentId !== candidate.agentId || b.channel !== candidate.channel) continue
    if (b.status !== 'sending' && b.status !== 'done') continue
    const created = new Date(b.createdAt).getTime()
    if (!Number.isFinite(created) || now.getTime() - created > BROADCAST_DUPLICATE_WINDOW_MS) continue
    if (normalizeBroadcastText(b.message) === text) return b
  }
  return null
}
