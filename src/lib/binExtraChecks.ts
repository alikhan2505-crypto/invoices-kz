// Дополнительные проверки контрагента по БИН (25.10.2026): категории списка
// неблагонадёжных КГД (бездействующий, банкрот, недействительная регистрация),
// налоговый режим и реестр должников Минюста. Только сервер: токены КГД и ключ
// egov не покидают его.
//
// Правило, общее с binLookupServer.ts: null означает «не проверили» (нет токена,
// таймаут, не 200, незнакомая форма) и никогда не превращается в «чисто». Каждая
// проверка изолирована: своя ошибка, свой таймаут, и одна упавшая не ломает
// остальные.
//
// В базе кэша нет намеренно: таблица bin_lookup_cache не имеет JSON-колонки, а схему
// базы мы не меняем. Платим запросами: два на каждый поиск (режим и реестр
// должников), категории перезапрашиваются только у тех, кто уже в списке
// неблагонадёжных. Только ответ Минюста держится в памяти экземпляра 10 минут.
//
// Что НЕ реализовано и почему (решения по итогам исследования 25.10.2026):
//  - реабилитационная процедура (КГД debtors/all): фильтра по БИН нет, ответ 650 КБ
//    за 17 секунд, нужна суточная выгрузка в новую таблицу (SQL от основателя);
//  - сделки без фактического выполнения работ (КГД): официального API нет, только
//    бэкенд веб-страницы без токена, решение о риске за основателем;
//  - лицензии (elicense.kz): открытого API нет, поиск за капчей, даём только ссылку.

import {
  KGD_SNR_URL, KGD_UNRELIABLE_URL, parseTaxRegime, parseUnreliableDetail,
  type TaxRegime, type UnreliableDetail,
} from './kgdTaxpayer'
import {
  AISOIP_ENDPOINT, buildAisoipRequest, parseAisoipResponse, type EnforcementResult,
} from './aisoip'

const KGD_TIMEOUT_MS = 12_000

const isBin = (bin: string) => /^\d{12}$/.test(bin)

/** Список неблагонадёжных с категориями. null = не удалось проверить. */
export async function fetchUnreliableDetail(bin: string): Promise<UnreliableDetail | null> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token || !isBin(bin)) return null
  try {
    const res = await fetch(KGD_UNRELIABLE_URL, {
      method: 'POST',
      headers: { 'X-Portal-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxPayerCode: bin, language: 'ru' }),
      signal: AbortSignal.timeout(KGD_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseUnreliableDetail(await res.json())
  } catch (e) {
    console.error('bin-lookup: КГД unreliable check failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Налоговые режимы (СНР). null = не удалось проверить, это НЕ «режима нет». */
export async function fetchTaxRegime(bin: string): Promise<TaxRegime[] | null> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token || !isBin(bin)) return null
  try {
    // Параметр именно `uin`: с другими именами сервис отвечает 500.
    const res = await fetch(`${KGD_SNR_URL}?uin=${encodeURIComponent(bin)}`, {
      headers: { 'X-Portal-Token': token },
      signal: AbortSignal.timeout(KGD_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseTaxRegime(await res.json())
  } catch (e) {
    console.error('bin-lookup: КГД tax regime check failed:', e instanceof Error ? e.message : e)
    return null
  }
}

export interface EnforcementOptions {
  /** Пауза между повторами, мс. Тесты ставят 0. */
  retryDelayMs?: number
  /** Сколько раз повторить после первой попытки (по умолчанию 2). */
  retries?: number
  /** Таймаут одной попытки, мс. */
  attemptTimeoutMs?: number
  /** Общий бюджет времени, мс: после него повторов нет. */
  budgetMs?: number
}

/**
 * Пауза между повторами aisoip. Измерено 25.10.2026: повтор через 700 мс почти
 * всегда попадает в тот же nginx 403 (9 из 9 запросов), через 1.5 с второй
 * запрос проходил. Меньше 1500 мс ставить нельзя. Переопределяется переменной
 * AISOIP_RETRY_DELAY_MS (тесты ставят 0).
 */
export const AISOIP_RETRY_DELAY_MS = 1_500

const sleep = (ms: number) => (ms > 0 ? new Promise<void>(r => setTimeout(r, ms)) : Promise.resolve())

function defaultRetryDelay(): number {
  const raw = process.env.AISOIP_RETRY_DELAY_MS
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 5_000) return n
  }
  return AISOIP_RETRY_DELAY_MS
}

// Общий ключ egov на 40 запросов в минуту кормит ещё gbd_ul и поиск названия в
// /tools/kp, поэтому здесь две защиты от лишних запросов (на один экземпляр
// сервера, чего достаточно, чтобы сгладить всплеск):
//  - автомат: после двух подряд полностью проваленных проверок aisoip на минуту
//    не спрашиваем (результат null, «не проверили»);
//  - память: успешный ответ по БИН живёт 10 минут. Реестр обновляется не чаще
//    раза в сутки, а повторный показ той же карточки не должен тратить запросы.
const BREAKER_FAILURES = 2
const BREAKER_PAUSE_MS = 60_000
const RESULT_TTL_MS = 10 * 60_000
const RESULT_CACHE_MAX = 500

let consecutiveFailures = 0
let breakerOpenUntil = 0
const resultCache = new Map<string, { at: number; value: EnforcementResult }>()

/** Только для тестов: сбросить автомат и память. */
export function resetEnforcementState(): void {
  consecutiveFailures = 0
  breakerOpenUntil = 0
  resultCache.clear()
}

function recordOutcome(ok: boolean): void {
  if (ok) {
    consecutiveFailures = 0
    return
  }
  consecutiveFailures += 1
  if (consecutiveFailures >= BREAKER_FAILURES) {
    breakerOpenUntil = Date.now() + BREAKER_PAUSE_MS
    consecutiveFailures = 0
  }
}

/**
 * Реестр должников Минюста через data.egov.kz (SOAP, индекс aisoip).
 *
 * nginx портала часто отвечает 403 (HTML, без Retry-After); повтор через 1.5 с
 * и больше обычно проходит. Повторяем только 403, 5xx, таймаут и сетевую
 * ошибку, до двух повторов. 429 и прочие коды (квота, неверный ключ) сразу
 * дают null: повтор только жёг бы общую квоту ключа. Только HTTP 200 с кодом
 * SCSS001 считается ответом; 200, который не разобрался, тоже сразу null.
 *
 * Выключатель: AISOIP_CHECK_DISABLED=1 в окружении отключает проверку целиком
 * (результат всегда null) без деплоя кода: нужен на случай, если с исходящих IP
 * Vercel доля 403 окажется слишком высокой.
 */
export async function fetchEnforcement(bin: string, opts: EnforcementOptions = {}): Promise<EnforcementResult | null> {
  const key = process.env.EGOV_API_KEY
  if (!key || !isBin(bin)) return null
  if (process.env.AISOIP_CHECK_DISABLED === '1') return null

  const hit = resultCache.get(bin)
  if (hit) {
    if (Date.now() - hit.at < RESULT_TTL_MS) return hit.value
    resultCache.delete(bin)
  }
  if (Date.now() < breakerOpenUntil) return null

  const retries = opts.retries ?? 2
  const delay = opts.retryDelayMs ?? defaultRetryDelay()
  const attemptTimeout = opts.attemptTimeoutMs ?? 5_000
  const budget = opts.budgetMs ?? 9_000
  const startedAt = Date.now()

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      if (Date.now() - startedAt + delay >= budget) break
      await sleep(delay)
    }
    try {
      const res = await fetch(AISOIP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: buildAisoipRequest(bin, key, crypto.randomUUID()),
        signal: AbortSignal.timeout(attemptTimeout),
      })
      if (res.status !== 200) {
        // 403 (nginx) и 5xx бывают временными. Остальное (429, 401, 400) повтор
        // не лечит, а квоту тратит.
        if (res.status === 403 || res.status >= 500) continue
        recordOutcome(false)
        return null
      }
      const parsed = parseAisoipResponse(await res.text(), bin)
      if (parsed) {
        recordOutcome(true)
        if (resultCache.size >= RESULT_CACHE_MAX) resultCache.clear()
        resultCache.set(bin, { at: Date.now(), value: parsed })
        return parsed
      }
      recordOutcome(false)
      return null
    } catch (e) {
      console.error('bin-lookup: aisoip request failed:', e instanceof Error ? e.message : e)
    }
  }
  recordOutcome(false)
  return null
}
