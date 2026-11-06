// Постраничная загрузка списка заказов Kaspi (одна страница = 10 заказов, больше
// Kaspi не отдаёт, см. PAGE_SIZE в cabinetApi.ts). Одна и та же логика нужна
// странице «Заказы» (по HTTP, постранично) и выгрузке в Excel (на сервере, прямо
// через listOrders), поэтому она вынесена в чистую функцию без сети и React.
//
// Что она гарантирует (аудит K1/K3/K35):
//   * сбой страницы НЕ превращается в «страница пустая» и не затирает total нулём:
//     failed=true, error, а уже собранные заказы остаются в orders;
//   * частичный результат никогда не помечен complete;
//   * устаревший запуск (shouldStop сказал «хватит», например вкладка уже другая)
//     останавливается и помечен aborted: вызывающий не должен записывать его результат;
//   * потолок заказов (cap) и потолок страниц ограничивают цикл.

export type PagePart<T> = {
  orders: T[]
  total: number
  sessionExpired?: boolean
  failed?: boolean
  error?: string
}

export type PagingOutcome<T> = {
  orders: T[]
  // Последний подтверждённый Kaspi общий итог. При сбое НЕ обнуляется.
  total: number
  // Загружено всё, что Kaspi сообщил (orders.length >= total), без сбоев и обрывов.
  complete: boolean
  // Какая-то страница не получена (см. error), orders содержит то, что успели набрать.
  failed: boolean
  sessionExpired: boolean
  // Остановились на потолке при том, что заказов больше.
  capped: boolean
  // shouldStop прервал цикл (устаревший запуск или исчерпанное время).
  aborted: boolean
  error?: string
}

export async function paginateOrders<T>(opts: {
  fetchPage: (page: number) => Promise<PagePart<T>>
  pageSize: number
  cap: number
  shouldStop?: () => boolean
  onProgress?: (loadedSoFar: number) => void
}): Promise<PagingOutcome<T>> {
  const { fetchPage, pageSize, cap, shouldStop, onProgress } = opts
  const orders: T[] = []
  let total = 0
  let failed = false
  let sessionExpired = false
  let aborted = false
  let error: string | undefined
  let lastPageWasShort = false

  for (let page = 0; page * pageSize < cap; page++) {
    if (shouldStop?.()) { aborted = true; break }
    let part: PagePart<T>
    try {
      part = await fetchPage(page)
    } catch (e) {
      failed = true
      error = e instanceof Error ? e.message : 'Не удалось загрузить заказы'
      break
    }
    if (shouldStop?.()) { aborted = true; break }
    if (part.sessionExpired) { sessionExpired = true; failed = true; error = part.error; break }
    if (part.failed) { failed = true; error = part.error; break }
    orders.push(...part.orders)
    total = part.total
    onProgress?.(orders.length)
    lastPageWasShort = part.orders.length < pageSize
    if (lastPageWasShort || orders.length >= total) break
  }

  const reachedEnd = !failed && !aborted && (lastPageWasShort || orders.length >= total)
  // «Обрезано потолком»: цикл вышел по cap, а Kaspi говорит, что заказов больше.
  const capped = !failed && !aborted && !reachedEnd && orders.length < total
  const complete = !failed && !aborted && orders.length >= total
  return { orders, total, complete, failed, sessionExpired, capped, aborted, error }
}

// Дата для имени файла по Алматы (UTC+5, без перехода на летнее время): в 01:30 по
// Алматы toISOString() даёт ещё вчерашнее число (аудит, минор по Заказам).
export function almatyDateStamp(now: Date = new Date()): string {
  return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Человеческая подпись неполной загрузки (одна для списка и выгрузки).
export function partialLoadMessage(loaded: number, total: number, failed: boolean): string {
  return failed
    ? `Загружено ${loaded} из ${total || '?'} — Kaspi прервал ответ, повторите`
    : `Загружено ${loaded} из ${total}`
}
