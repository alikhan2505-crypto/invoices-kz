// Счётчик бесплатных ответов WhatsApp, этап 1 (16.10.2026).
//
// С 01.10.2026 Meta не берёт денег за первые N служебных сообщений в месяц на
// номер (N -- WA_FREE_SERVICE_PER_MONTH в src/lib/whatsapp.ts), дальше
// платит сам продавец со своего WhatsApp-аккаунта. Этап 1 считает по тому,
// что уже лежит в базе (ai_agent_messages), поэтому цифра «примерная»:
// сценарии и ответ «не понимаю такой формат» в базу не пишутся. Отвечать мы
// НИКОГДА не перестаём -- счётчик только предупреждает.
//
// Модуль чистый: без сети и env, лимит приходит параметром (константа живёт в
// whatsapp.ts, который тянет node-crypto и в клиентский бандл не годится).

// Казахстан с марта 2024 живёт в едином UTC+5 -- та же константа, что в
// overviewStats.ts / analytics. Meta считает месяц по своему времени, отсюда
// ещё одна причина пометки «примерно».
const KZ_OFFSET_MS = 5 * 60 * 60 * 1000

// Текущий календарный месяц по Алматы: начало (включительно) и начало
// следующего (когда счётчик обнулится), оба -- настоящие моменты UTC.
export function waUsageMonthWindow(nowMs: number): { startIso: string; resetIso: string } {
  const shifted = new Date(nowMs + KZ_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const startMs = Date.UTC(y, m, 1) - KZ_OFFSET_MS
  const resetMs = Date.UTC(y, m + 1, 1) - KZ_OFFSET_MS
  return { startIso: new Date(startMs).toISOString(), resetIso: new Date(resetMs).toISOString() }
}

export type WaUsageLevel = 'normal' | 'warn' | 'over'

// < 80% обычный, 80–99% жёлтый, ≥ 100% красный.
export function waUsageLevel(used: number, limit: number): WaUsageLevel {
  if (!(limit > 0)) return 'normal'
  if (used >= limit) return 'over'
  if (used >= limit * 0.8) return 'warn'
  return 'normal'
}

// Доля для полосы, 0..1 (за лимитом полоса просто полная).
export function waUsageFraction(used: number, limit: number): number {
  if (!(limit > 0) || used <= 0) return 0
  return Math.min(1, used / limit)
}

// Рассылки пишут историю в ai_agent_messages с 16.10.2026 (коммит aafc2a89,
// 09:02 по Алматы). Для рассылок ДО этого истории нет -- их отправленное
// берётся из ai_agent_broadcasts.sent_count; для более поздних -- только из
// истории, иначе каждое сообщение посчиталось бы дважды.
export const BROADCAST_HISTORY_SINCE_ISO = '2026-10-16T04:00:00.000Z'

export function broadcastSentWithoutHistory(
  broadcasts: { created_at: string; sent_count: number | null }[],
): number {
  const cutoff = new Date(BROADCAST_HISTORY_SINCE_ISO).getTime()
  let sum = 0
  for (const b of broadcasts) {
    if (new Date(b.created_at).getTime() < cutoff) sum += Math.max(0, b.sent_count || 0)
  }
  return sum
}
