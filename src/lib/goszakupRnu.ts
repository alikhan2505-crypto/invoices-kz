// Реестр недобросовестных участников государственных закупок (РНУ, портал goszakup.gov.kz,
// Минфин РК). 30.10.2026: публичная страница реестра принимает поиск по БИН/ИИН участника и
// по БИН/ИИН учредителя или руководителя обычным GET, без входа и без капчи:
//   https://old.goszakup.gov.kz/ru/registry/rnu?filter[biin]=<id>&smb=
//   https://old.goszakup.gov.kz/ru/registry/rnu?filter[head_biin]=<id>&smb=
// Ответ - HTML со счётчиком «Показано c 1 по N из M записей» и таблицей (№, наименование,
// БИН/ИИН, ИНН/УНП). Официального JSON у этого адреса нет: разбираем HTML, поэтому любое
// отклонение от известной формы даёт null («не проверили»), а не «чисто». Проверено живыми
// запросами: БИН в реестре даёт 1 запись, чистый БИН даёт «из 0 записей», без параметра
// smb= фильтр игнорируется и счётчик показывает общий размер (10000).
//
// Риск: адрес на поддомене old.; если портал уберёт его или поменяет вёрстку, проверка
// молча станет null. Выключатель без деплоя: RNU_CHECK_DISABLED=1 (в этом случае строку на
// странице не показываем вовсе, см. rnuDisabled).
//
// Вежливость к чужому порталу: у old.goszakup.gov.kz в robots.txt указан Crawl-delay: 5, поэтому
// запросы с одного экземпляра идут не чаще раза в 5 секунд (очередь; если ждать дольше
// MAX_WAIT_MS, отвечаем null «не проверили»), успешный ответ живёт 10 минут в памяти, а
// сама проверка запрашивается только там, где результат показывают человеку
// (публичный /api/tools/kontragent и проверка физлица), не в ночном слежении и не в /create.
//
// Персональные данные: в таблице наименования ИП и БИН/ИИН участников. Наружу уходят только
// число записей и факт: имён и номеров решений мы не отдаём.

export const RNU_SEARCH_URL = 'https://old.goszakup.gov.kz/ru/registry/rnu'
/** Ссылка-источник рядом с результатом (человеку открывается тот же поиск). */
export function rnuSourceUrl(id: string, mode: RnuMode = 'biin'): string {
  return `${RNU_SEARCH_URL}?${encodeURIComponent(`filter[${mode}]`)}=${encodeURIComponent(id)}&smb=`
}

/** biin: сам участник; head_biin: учредитель или руководитель недобросовестного участника. */
export type RnuMode = 'biin' | 'head_biin'

export interface RnuResult {
  /** false = реестр ответил и записей нет. */
  found: boolean
  count: number
}

/** Больше этого - значит фильтр не сработал (общий счётчик), а не «найдено». */
const MAX_PLAUSIBLE = 1000

const SHOWN = /Показано\s+[cс]\s+\d+\s+по\s+\d+\s+из\s+(\d+)\s+записей/i

const cellTexts = (row: string): string[] =>
  Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
    .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())

/**
 * Разбор ответа поиска. null, если форма не та, которую мы знаем: нет счётчика, общий счётчик
 * вместо отфильтрованного, строки не сходятся со счётчиком или (для mode=biin) ни в одной
 * строке нет искомого БИН/ИИН.
 */
export function parseRnuSearch(html: unknown, id: string, mode: RnuMode = 'biin'): RnuResult | null {
  if (typeof html !== 'string') return null
  const m = SHOWN.exec(html)
  if (!m) return null
  const total = Number(m[1])
  if (!Number.isFinite(total) || total > MAX_PLAUSIBLE) return null
  if (total === 0) return { found: false, count: 0 }

  const start = html.indexOf('id="search-result"')
  if (start < 0) return null
  const rows = Array.from(html.slice(start).matchAll(/<tr[\s\S]*?<\/tr>/gi)).map(r => cellTexts(r[0]))
  const data = rows.filter(c => c.length >= 3 && /^\d+-\d+$/.test(c[0]))
  if (data.length === 0) return null
  if (mode === 'biin' && !data.some(c => c[2] === id)) return null
  return { found: true, count: total }
}

// ---- сеть ----

const TIMEOUT_MS = 8_000
/** Crawl-delay: 5 из robots.txt портала. Переопределяется RNU_MIN_INTERVAL_MS (тесты ставят 0). */
const MIN_INTERVAL_MS = 5_000
/** Дольше этого в очереди не ждём: честнее ответить «не проверили». */
const MAX_WAIT_MS = 6_000
const RESULT_TTL_MS = 10 * 60_000
const RESULT_CACHE_MAX = 500
const BREAKER_FAILURES = 3
const BREAKER_PAUSE_MS = 60_000

let consecutiveFailures = 0
let breakerOpenUntil = 0
let nextSlotAt = 0
const cache = new Map<string, { at: number; value: RnuResult }>()

/** Только для тестов. */
export function resetRnuState(): void {
  consecutiveFailures = 0
  breakerOpenUntil = 0
  nextSlotAt = 0
  cache.clear()
}

/** Проверка выключена переменной окружения: строку не показываем (undefined), а не «не удалось проверить». */
export function rnuDisabled(): boolean {
  return process.env.RNU_CHECK_DISABLED === '1'
}

function minInterval(): number {
  const raw = process.env.RNU_MIN_INTERVAL_MS
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 60_000) return n
  }
  return MIN_INTERVAL_MS
}

function record(ok: boolean): void {
  if (ok) { consecutiveFailures = 0; return }
  consecutiveFailures += 1
  if (consecutiveFailures >= BREAKER_FAILURES) {
    breakerOpenUntil = Date.now() + BREAKER_PAUSE_MS
    consecutiveFailures = 0
  }
}

/**
 * Один GET в реестр. null = не удалось проверить (сеть, таймаут, не 200, незнакомая форма,
 * выключатель, автомат после серии сбоев): НЕ «чисто». Успешный ответ живёт 10 минут в памяти
 * экземпляра, чтобы повторный показ карточки не ходил в чужой портал.
 */
export async function fetchRnu(id: string, mode: RnuMode = 'biin'): Promise<RnuResult | null> {
  if (!/^\d{12}$/.test(id)) return null
  if (rnuDisabled()) return null

  const key = `${mode}:${id}`
  const hit = cache.get(key)
  if (hit) {
    if (Date.now() - hit.at < RESULT_TTL_MS) return hit.value
    cache.delete(key)
  }
  if (Date.now() < breakerOpenUntil) return null

  // Очередь на слот: не чаще одного запроса в minInterval() с этого экземпляра.
  const interval = minInterval()
  const now = Date.now()
  const slot = Math.max(now, nextSlotAt)
  if (slot - now > MAX_WAIT_MS) return null
  nextSlotAt = slot + interval
  if (slot > now) await new Promise<void>(r => setTimeout(r, slot - now))

  try {
    const res = await fetch(rnuSourceUrl(id, mode), {
      headers: { 'User-Agent': 'invoices.kz-counterparty-check (support@invoices.kz)', Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    if (res.status !== 200) { record(false); return null }
    const parsed = parseRnuSearch(await res.text(), id, mode)
    if (!parsed) { record(false); return null }
    record(true)
    if (cache.size >= RESULT_CACHE_MAX) cache.clear()
    cache.set(key, { at: Date.now(), value: parsed })
    return parsed
  } catch (e) {
    console.error('bin-lookup: goszakup РНУ request failed:', e instanceof Error ? e.message : e)
    record(false)
    return null
  }
}
