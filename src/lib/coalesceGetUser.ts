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
// ответ живёт короткое время. Сбрасывают его события, после которых пользователь
// мог измениться: выход, смена данных, вход другого человека. Начальная загрузка
// сессии, обновление токена и вход того же пользователя (supabase шлёт SIGNED_IN
// при старте страницы и при возврате на вкладку) ответ не меняют, и сбрасывать из-за
// них нельзя: на замере /dashboard такое событие во время первого запроса запускало
// второй. Вызов с готовым токеном
// (getUser(jwt)) идёт как раньше. Ответ по-прежнему приходит от сервера, просто
// один раз вместо шести.

export const GET_USER_CACHE_MS = 20_000

interface SessionLike { user?: { id?: string } | null }

interface AuthLike<R> {
  getUser: (jwt?: string) => Promise<R>
  onAuthStateChange: (callback: (event: string, session: SessionLike | null) => void) => unknown
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
  const userIdOf = (res: R | null | undefined) => (res?.data.user as { id?: string } | null)?.id
  // Кто сейчас вошёл по последнему событию сессии (null - никто / ещё не знаем).
  let sessionUserId: string | null = null
  // Событие может прийти, пока запрос в полёте: его ответ уже устарел.
  let generation = 0

  auth.getUser = (jwt?: string): Promise<R> => {
    if (jwt) return original(jwt)
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value)
    if (inflight) return inflight
    const startedIn = generation
    const request = original().then(
      res => {
        // Ответ принадлежит тому, кто вошёл сейчас (иначе пришёл от прошлой сессии).
        const current = !sessionUserId || userIdOf(res) === sessionUserId
        if (!res.error && res.data.user && startedIn === generation && current) cached = { at: now(), value: res }
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
  const reset = () => {
    generation++
    cached = null
    inflight = null
  }
  auth.onAuthStateChange((event, session) => {
    const previous = sessionUserId
    if (event !== 'SIGNED_OUT') sessionUserId = session?.user?.id ?? sessionUserId
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
    if (event === 'SIGNED_IN') {
      // Тот же человек (старт страницы, возврат на вкладку): ничего не меняется.
      const sameUser = (!previous || previous === sessionUserId) && (!cached || userIdOf(cached.value) === sessionUserId)
      if (sameUser) return
    }
    if (event === 'SIGNED_OUT') sessionUserId = null
    reset()
  })
}
