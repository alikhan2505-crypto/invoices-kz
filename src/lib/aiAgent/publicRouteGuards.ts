import { createBurstLimiter } from '@/lib/memoryGuards'
import { clientIp, quotaIp } from '@/lib/toolQuota'

// Защиты публичных GET/POST агента, где счётчик в базе (widgetLimiter.ts) не
// годится (аудит 02.11.2026, раздел 4). Опрос виджета идёт раз в 5 с с каждой
// открытой панели; счётчик в базе добавил бы к каждому опросу ещё чтение и
// запись -- нагрузка на базу выросла бы сильнее, чем её защитил бы лимит. Поэтому
// здесь заслон в памяти инстанса: он режет поток с одного адреса до обращения
// к базе, а деньги и вызовы модели по-прежнему охраняют счётчики в базе.

const WINDOW_MS = 60_000

/**
 * Опросов виджета с одного IP в минуту. Одна открытая панель шлёт 12 (раз в 5 с)
 * плюс по одному после каждого отправленного сообщения; 120 хватает на ~10
 * посетителей за одним NAT (офис, мобильный оператор) и всё равно не даёт одному
 * адресу гонять по три запроса в базу без предела.
 */
export const WIDGET_POLL_IP_PER_MIN = 120

/**
 * Неудачных проверок ключа внешнего API с одного IP в минуту. Считаются только
 * отказы (неизвестный ключ): честная интеграция на них не нарывается, а перебор
 * случайных ключей упирается в лимит, не доходя до базы.
 */
export const EXTERNAL_API_AUTH_FAIL_IP_PER_MIN = 30

// 'unknown' (адрес не определился) не считаем: общий счётчик закрыл бы виджет и API всем сразу.
export const widgetPollLimiter = createBurstLimiter({ limit: WIDGET_POLL_IP_PER_MIN, windowMs: WINDOW_MS, exemptKeys: ['unknown'] })
export const externalApiAuthFailLimiter = createBurstLimiter({ limit: EXTERNAL_API_AUTH_FAIL_IP_PER_MIN, windowMs: WINDOW_MS, exemptKeys: ['unknown'] })

/** Ключ лимита по адресу: IPv6 сводим к /64 (смена хвоста адреса не даёт свежий лимит). */
export function publicClientKey(headers: Headers): string {
  return quotaIp(clientIp(headers))
}

/**
 * Параметр since опроса сообщений: метка времени ISO (как createdAt, который виджет уже получил).
 * Мусор отвергаем до базы: Postgres не принимает «garbage» как timestamp, и анонимный вызов
 * превращался в 500 и строку в логе при каждом запросе.
 */
const SINCE_RE = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}(:\d{2})?)?$/

export function isValidSince(since: string): boolean {
  if (since.length > 40) return false
  const m = SINCE_RE.exec(since)
  if (!m || Number.isNaN(Date.parse(since))) return false
  // Date.parse мирится с 30 февраля (сдвигает на март), Postgres - нет: сверяем календарную дату.
  const day = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}`
}

/** Только для тестов: сбросить счётчики. */
export function resetPublicRouteGuards(): void {
  widgetPollLimiter.reset()
  externalApiAuthFailLimiter.reset()
}
