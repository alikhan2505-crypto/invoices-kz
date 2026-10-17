// Страховка для загрузчиков страниц (аудит 17.10.2026, P2-25). Страницы
// AI-агента загружали данные цепочкой `await getSession()` + `fetch` без
// try/catch и без таймаута: любое зависание или исключение оставляло
// loading=true навсегда -- человек видел вечную заставку и не мог ни
// повторить, ни понять, что случилось.

export const LOAD_TIMEOUT_MS = 20_000

export class LoadTimeoutError extends Error {
  constructor() {
    super('load_timeout')
    this.name = 'LoadTimeoutError'
  }
}

// Ждёт promise не дольше ms; потом отклоняет LoadTimeoutError. Сам promise
// не отменяется (для этого нужен AbortController у fetch), но страница уже
// не ждёт его и показывает ошибку с «Повторить».
export function withTimeout<T>(promise: Promise<T>, ms: number = LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LoadTimeoutError()), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

// fetch с прерыванием по таймауту: запрос реально отменяется, а не висит.
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms: number = LOAD_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) throw new LoadTimeoutError()
    throw err
  } finally {
    clearTimeout(timer)
  }
}
