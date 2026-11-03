// Лёгкие защиты в памяти процесса для публичных маршрутов, где счётчик в базе
// был бы дороже самой защиты (опрос виджета раз в 5 с, вход по passkey).
//
// Счётчик живёт в одном инстансе функции: холодный старт или второй инстанс
// начинают с нуля. Поэтому это заслон от потока с одного адреса и от
// зациклившегося клиента, а не точный счёт; деньги и расход модели охраняют
// счётчики в базе (widgetLimiter.ts).

export interface BurstLimiter {
  /** Записать обращение. true -- в пределах лимита, false -- лимит окна исчерпан. */
  hit(key: string, now?: number): boolean
  /** Исчерпан ли лимит. Обращение НЕ записывает: для счётчика только неудач. */
  isOver(key: string, now?: number): boolean
  /** Записать обращение без проверки лимита (неудачная попытка уже случилась). */
  record(key: string, now?: number): void
  reset(): void
  size(): number
}

export interface BurstLimiterOptions {
  limit: number
  windowMs: number
  /** Сколько ключей держим одновременно; сверх этого вытесняем самый давний. */
  maxKeys?: number
  /**
   * Ключи, которые не считаем и не ограничиваем. Нужны для «unknown» (адрес не определился): общий
   * счётчик на всех безадресных вызывающих заблокировал бы их ВСЕХ из-за одного, а настоящий вызов на
   * Vercel без адреса не приходит. Лучше пропустить, чем закрыть всем доступ.
   */
  exemptKeys?: readonly string[]
}

const DEFAULT_MAX_KEYS = 5000
const SWEEP_MIN_GAP_MS = 1000

/**
 * Скользящее окно: не больше `limit` обращений на ключ за `windowMs`.
 * Отказанные обращения НЕ записываются -- иначе клиент, который продолжает
 * опрашивать за общим NAT, не вышел бы из блокировки никогда; заодно массив
 * на ключ не длиннее limit.
 */
export function createBurstLimiter(opts: BurstLimiterOptions): BurstLimiter {
  const { limit, windowMs } = opts
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS
  const exempt = new Set(opts.exemptKeys ?? [])
  const hits = new Map<string, number[]>()
  let lastSweep = -Infinity

  function fresh(key: string, now: number): number[] {
    const arr = hits.get(key)
    if (!arr) return []
    // now раньше записанного времени (часы шагнули назад) -- запись считаем свежей.
    return arr.filter(t => now - t < windowMs)
  }

  function makeRoom(now: number): void {
    if (hits.size < maxKeys) return
    if (now - lastSweep >= SWEEP_MIN_GAP_MS) {
      lastSweep = now
      for (const [k, arr] of hits) {
        if (!arr.some(t => now - t < windowMs)) hits.delete(k)
      }
    }
    // Всё ещё полно живых ключей: уступаем место, вытесняя давно не трогавшийся
    // (порядок вставки Map = порядок последнего обращения, см. store).
    while (hits.size >= maxKeys) {
      const oldest = hits.keys().next()
      if (oldest.done) break
      hits.delete(oldest.value)
    }
  }

  function store(key: string, arr: number[], now: number): void {
    const existed = hits.has(key)
    if (existed) hits.delete(key)
    else makeRoom(now)
    hits.set(key, arr)
  }

  return {
    hit(key, now = Date.now()) {
      if (exempt.has(key)) return true
      const arr = fresh(key, now)
      if (arr.length >= limit) {
        // Только обновляем обрезанный массив: отказ в окно не засчитывается.
        if (hits.has(key)) hits.set(key, arr)
        return false
      }
      arr.push(now)
      store(key, arr, now)
      return true
    },
    isOver(key, now = Date.now()) {
      if (exempt.has(key)) return false
      return fresh(key, now).length >= limit
    },
    record(key, now = Date.now()) {
      if (exempt.has(key)) return
      const arr = fresh(key, now)
      if (arr.length < limit) arr.push(now)
      store(key, arr, now)
    },
    reset() {
      hits.clear()
      lastSweep = -Infinity
    },
    size() {
      return hits.size
    },
  }
}

export interface IntervalGate {
  /** true -- пора выполнять (и момент запоминается); false -- рано, прошло меньше minGapMs. */
  due(now?: number): boolean
  reset(): void
}

/**
 * «Не чаще раза в minGapMs в этом инстансе» для редкой уборки. Момент
 * запоминается сразу, до самой работы: параллельные запросы не стартуют
 * уборку одновременно.
 */
export function createIntervalGate(minGapMs: number): IntervalGate {
  let last = -Infinity
  return {
    due(now = Date.now()) {
      const elapsed = now - last
      // Отрицательный elapsed -- часы ушли назад; не застреваем в «рано» надолго.
      if (elapsed >= 0 && elapsed < minGapMs) return false
      last = now
      return true
    },
    reset() {
      last = -Infinity
    },
  }
}
