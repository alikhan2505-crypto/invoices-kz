import type { Source1688Suggestion } from './source1688'

// Кэш по названию и лимит на пользователя для «Найти на 1688». Всё в памяти экземпляра: это защита
// кошелька (платный вызов Anthropic) от всплеска, а не учёт. Названия товаров публичные, поэтому кэш
// общий для всех пользователей. Лежит не в route.ts: файл маршрута Next 16 может экспортировать
// только свои фиксированные имена.

const CACHE_TTL_MS = 24 * 3_600_000
const CACHE_MAX = 300
const cache = new Map<string, { at: number; value: Source1688Suggestion }>()

export const LIMIT_PER_HOUR = 30
const WINDOW_MS = 3_600_000
const hits = new Map<string, number[]>()

export function getCached(key: string, now: number): Source1688Suggestion | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (now - hit.at >= CACHE_TTL_MS) { cache.delete(key); return null }
  return hit.value
}

export function putCached(key: string, value: Source1688Suggestion, now: number): void {
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(key, { at: now, value })
}

/** true = пользователь исчерпал лимит; иначе запрос засчитан. */
export function overLimit(userId: string, now: number): boolean {
  const recent = (hits.get(userId) ?? []).filter(t => now - t < WINDOW_MS)
  if (recent.length >= LIMIT_PER_HOUR) { hits.set(userId, recent); return true }
  recent.push(now)
  hits.set(userId, recent)
  return false
}

/** Только для тестов. */
export function resetSource1688State(): void {
  cache.clear()
  hits.clear()
}
