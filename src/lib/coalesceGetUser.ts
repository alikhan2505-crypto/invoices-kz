// supabase.auth.getUser() в браузере идёт в сеть (запрос /auth/v1/user) ПОД
// блокировкой сессии. Каждому компоненту кабинета нужен пользователь (меню,
// верхняя панель, обёртка продукта, сама страница, тур), и на одном переходе
// набиралось 5-6 таких запросов подряд: они выстраиваются в очередь на
// блокировке (измерено на /dashboard: старты 3856, 4305, 4673, 5026 мс по
// ~350-450 мс каждый), страница ждёт скелетоном, а при медленном обновлении
// токена блокировка не отпускается дольше 5 секунд («Lock ... was not
// released within 5000ms»).
//
// Здесь одновременные вызовы без аргумента сливаются в один запрос, а успешный
// ответ живёт короткое время и сбрасывается любым событием входа/выхода/
// обновления. Вызов с готовым токеном (getUser(jwt)) идёт как раньше. Ответ
// по-прежнему приходит от сервера, просто один раз вместо шести.

export const GET_USER_CACHE_MS = 20_000

interface AuthLike<R> {
  getUser: (jwt?: string) => Promise<R>
  onAuthStateChange: (callback: () => void) => unknown
}

interface Options {
  ttlMs?: number
  now?: () => number
}

// R — тип ответа getUser: { data: { user }, error }. Кэшируется только успех.
export function coalesceGetUser<R extends { error: unknown; data: { user: unknown } }>(
  auth: AuthLike<R>,
  { ttlMs = GET_USER_CACHE_MS, now = Date.now }: Options = {},
): void {
  const original = auth.getUser.bind(auth)
  let inflight: Promise<R> | null = null
  let cached: { at: number; value: R } | null = null
  // Событие может прийти, пока запрос в полёте: его ответ уже устарел.
  let generation = 0

  auth.getUser = (jwt?: string): Promise<R> => {
    if (jwt) return original(jwt)
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value)
    if (inflight) return inflight
    const startedIn = generation
    const request = original().then(
      res => {
        if (!res.error && res.data.user && startedIn === generation) cached = { at: now(), value: res }
        return res
      },
    ).finally(() => {
      if (inflight === request) inflight = null
    })
    inflight = request
    return request
  }

  // Колбэк только сбрасывает кэш: вызывать здесь supabase нельзя (событие
  // приходит изнутри блокировки сессии, это был бы взаимный затор).
  auth.onAuthStateChange(() => {
    generation++
    cached = null
    inflight = null
  })
}
