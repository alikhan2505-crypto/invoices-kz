import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COUNTER_TABLE, readCounter, claimCounterSlot } from '@/lib/toolQuota'

// Счётчики лимитов публичных точек агента (виджет сайта, внешний API) в уже
// существующей таблице tool_kontragent_checks (key, day, count) -- без новой
// схемы. Прежний лимит по агенту выбирал ВСЕ id диалогов и делал .in(ids): после
// ~1000 диалогов PostgREST обрезал список (или URL становился слишком длинным),
// ошибка превращалась в «0 сообщений» и лимит исчезал (аудит 24.10.2026).
// Здесь фиксированное окно: одна строка на (область, окно), занять слот можно
// только compare-and-swap'ом (claimCounterSlot), любая ошибка = отказ.
//
// Строки не должны попадать в дневной предохранитель реестров КГД: он суммирует
// счётчики с day = сегодня (registryLoadToday). Поэтому day у наших строк всегда
// 1970-01-01 (now = 0 в claimCounterSlot), а ключи начинаются с 'wgl:'.

export const LIMITER_KEY_PREFIX = 'wgl:'
// Строки с этой датой никогда не считаются «нагрузкой на реестры сегодня».
const LIMITER_FIXED_NOW = 0

export type LimitUnit = 'm' | 'd'
export interface LimitSpec {
  /** Короткая метка области: 'wa' агент виджета, 'wi' IP виджета, 'ea' агент внешнего API. */
  scope: string
  /** Идентификатор внутри области (agentId или хэш IP). */
  id: string
  unit: LimitUnit
  limit: number
}
export type LimitVerdict = 'ok' | 'limited' | 'error'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
// Параллельные запросы дерутся за один слот (CAS): даём несколько попыток, а
// если не вышло -- это уже плотный поток и отказ безопасная сторона.
const MAX_CLAIM_ATTEMPTS = 6

function pad(n: number): string {
  return String(Math.max(0, n)).padStart(10, '0')
}

export function bucketOf(unit: LimitUnit, now: number): number {
  return Math.floor(now / (unit === 'm' ? MINUTE_MS : DAY_MS))
}

/** Ключ счётчика: 'wgl:<m|d><бакет, 10 цифр>:<область>:<id>'. Бакет впереди -- по нему чистим старьё. */
export function limiterKey(spec: Pick<LimitSpec, 'scope' | 'id' | 'unit'>, now: number): string {
  return `${LIMITER_KEY_PREFIX}${spec.unit}${pad(bucketOf(spec.unit, now))}:${spec.scope}:${spec.id}`
}

/** Хэш IP для ключа: сырой адрес в базу не пишем. */
export function hashIpForLimiter(ip: string): string {
  return createHash('sha256').update(`wgl-ip|${ip}`).digest('hex').slice(0, 32)
}

/**
 * Занять один слот окна. 'limited' -- лимит исчерпан; 'error' -- счётчик не
 * читается или не пишется (вызывающий отвечает отказом, модель не вызывается).
 */
export async function claimWindowSlot(supabase: SupabaseClient, spec: LimitSpec, now = Date.now()): Promise<LimitVerdict> {
  const key = limiterKey(spec, now)
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const read = await readCounter(supabase, key)
    if (!read.ok) return 'error'
    if (read.used >= spec.limit) return 'limited'
    const claim = await claimCounterSlot(supabase, key, read.used, LIMITER_FIXED_NOW)
    if (claim === 'claimed') return 'ok'
    if (claim === 'error') return 'error'
    // 'raced': слот перехватил параллельный запрос -- перечитываем.
  }
  return 'limited'
}

/**
 * Проверить набор лимитов по порядку; первый отказ возвращается сразу.
 * Слоты, занятые до отказа, не возвращаем: отказ -- это уже спам-сценарий,
 * а для честного посетителя лишняя единица в минуте не заметна.
 */
export async function checkLimits(supabase: SupabaseClient, specs: LimitSpec[], now = Date.now()): Promise<LimitVerdict> {
  for (const spec of specs) {
    const verdict = await claimWindowSlot(supabase, spec, now)
    if (verdict !== 'ok') return verdict
  }
  return 'ok'
}

/**
 * Убрать устаревшие строки (минутные старше 10 минут, суточные старше 2 суток).
 * Best-effort: вызывается редко и не влияет на ответ.
 */
export async function pruneLimiterRows(supabase: SupabaseClient, now = Date.now()): Promise<void> {
  try {
    const minuteCutoff = `${LIMITER_KEY_PREFIX}m${pad(bucketOf('m', now) - 10)}`
    const dayCutoff = `${LIMITER_KEY_PREFIX}d${pad(bucketOf('d', now) - 2)}`
    await supabase.from(COUNTER_TABLE).delete().like('key', `${LIMITER_KEY_PREFIX}m%`).lt('key', minuteCutoff)
    await supabase.from(COUNTER_TABLE).delete().like('key', `${LIMITER_KEY_PREFIX}d%`).lt('key', dayCutoff)
  } catch (err) {
    console.error('widgetLimiter: prune failed:', err instanceof Error ? err.message : err)
  }
}

/** Раз примерно в 200 запросов -- чтобы таблица не росла вечно. */
export function shouldPrune(random = Math.random()): boolean {
  return random < 1 / 200
}

export type CappedBody = { ok: true; json: unknown } | { ok: false; reason: 'too_large' | 'invalid' }

/**
 * Прочитать тело запроса с потолком размера. 'too_large' -- отвечаем 413.
 * Content-Length проверяется до чтения; для chunked без заголовка тело читается и
 * сверяется по длине (Vercel сам режет тела выше нескольких МБ).
 */
export async function readBodyCapped(req: Request, maxChars: number): Promise<CappedBody> {
  const declared = Number(req.headers.get('content-length') || '0')
  if (Number.isFinite(declared) && declared > maxChars * 4) return { ok: false, reason: 'too_large' }
  const raw = await req.text().catch(() => null)
  if (raw === null) return { ok: false, reason: 'invalid' }
  if (raw.length > maxChars) return { ok: false, reason: 'too_large' }
  try {
    return { ok: true, json: JSON.parse(raw) }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}
