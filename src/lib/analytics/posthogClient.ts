// Браузерная часть PostHog. posthog-js грузится отдельным куском, когда страница уже
// загружена и браузер простаивает (startPosthog из instrumentation-client).
//
// Запись сессий (по ревью 04–05.11): только гость и только на публичной странице.
// - Гость: в браузере нет сохранённого входа Supabase и Supabase не сообщал о входе.
//   Если вход сохранён, ждём события Supabase; где Supabase нет, такого человека не пишем.
// - Включаем запись, только когда публичная страница уже на экране (routeCommitted из
//   AnalyticsRouteSync), а выключаем сразу в начале перехода (trackNavigation): иначе
//   рекордер снял бы уходящую страницу кабинета, например при «Выйти».
// - Что запись запрошена, помним сами: sessionRecordingStarted() становится true только
//   когда рекордер уже пишет, и выключение во время его загрузки терялось бы.
// Рекордер и перехват ошибок собраны в наш бандл из того же пакета posthog-js: с CDN
// PostHog чужой код не загружается (disable_external_dependency_loading).
import type { PostHog } from 'posthog-js'
import { mightHaveStoredSession } from '@/lib/hasStoredSession'
import {
  POSTHOG_API_HOST,
  POSTHOG_KEY,
  POSTHOG_UI_HOST,
  SECRET_PARAMS,
  isPublicPath,
  isSecretPage,
  isTrackedHost,
  maskReplayAttribute,
  maskReplayText,
  normalizePath,
  publicUrlAllowlist,
  sanitizeEvent,
  sanitizeUrl,
} from './posthogConfig'

// Цель перехода на другой хост: страница уйдёт целиком, запись выключаем.
const EXTERNAL = '/__external'
const MAX_PENDING = 20

let ph: PostHog | null = null
let wanted = false
let started = false
// null = ещё неизвестно (в браузере есть сохранённый вход, ждём Supabase).
let signedIn: boolean | null = null
// Страница, которая сейчас на экране.
let committedPath = typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname)
// Цели начатых, но ещё не показанных переходов, по порядку.
let pendingPaths: string[] = []
let replayRequested = false
let recorder: Promise<boolean> | null = null
// Вход/выход, случившиеся до загрузки posthog-js: применяем после загрузки.
let pendingUser: { id: string } | 'reset' | 'reset-if-identified' | null = null

function enabled(): boolean {
  return typeof window !== 'undefined' && POSTHOG_KEY !== '' && isTrackedHost(window.location.hostname)
}

// «Не отслеживать» и Global Privacy Control: respect_dnt и так выключит PostHog, но тогда
// незачем и скачивать его.
function doNotTrack(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.doNotTrack === '1' || (window as Window & { doNotTrack?: string }).doNotTrack === '1' || nav.globalPrivacyControl === true
}

function wantReplay(): boolean {
  return signedIn === false
    && !mightHaveStoredSession()
    && isPublicPath(committedPath)
    && isPublicPath(window.location.pathname)
    && pendingPaths.every(isPublicPath)
}

function loadRecorder(): Promise<boolean> {
  recorder ??= import('posthog-js/dist/lazy-recorder').then(
    () => true,
    () => {
      recorder = null
      return false
    },
  )
  return recorder
}

function applyReplay(): void {
  if (!ph) return
  const want = wantReplay()
  if (want === replayRequested) return
  replayRequested = want
  if (!want) {
    try {
      ph.stopSessionRecording()
    } catch {
      // запись сессий не должна ломать страницу
    }
    return
  }
  void loadRecorder().then(ok => {
    // Пока грузился рекордер, человек мог войти или уйти со страницы: проверяем заново.
    if (!ok || !ph || !replayRequested || !wantReplay()) return
    try {
      ph.startSessionRecording()
    } catch {
      // запись сессий не должна ломать страницу
    }
  })
}

function applyUser(): void {
  if (!ph || !pendingUser) return
  const action = pendingUser
  pendingUser = null
  try {
    const identified = ph.get_property('$user_state') === 'identified'
    // reset(true) меняет и идентификатор устройства: следующий человек за этим
    // браузером не склеится с предыдущим.
    if (action === 'reset') ph.reset(true)
    else if (action === 'reset-if-identified') {
      if (identified) ph.reset(true)
    } else {
      if (identified && ph.get_distinct_id() !== action.id) ph.reset(true)
      ph.identify(action.id)
    }
  } catch {
    // аналитика не должна ломать вход
  }
}

function onPageShow(e: PageTransitionEvent): void {
  // Страница вернулась из кэша «назад/вперёд»: переходы, начатые до ухода, уже не идут.
  if (!e.persisted) return
  pendingPaths = []
  committedPath = normalizePath(window.location.pathname)
  applyReplay()
}

function initPosthog(): void {
  if (started || !wanted || !enabled() || doNotTrack()) return
  if (isSecretPage(window.location.pathname)) return
  started = true
  if (signedIn === null && !mightHaveStoredSession()) signedIn = false
  window.addEventListener('pageshow', onPageShow)
  Promise.all([
    import('posthog-js'),
    // Перехват ошибок из пакета (иначе PostHog скачал бы его со своего CDN).
    import('posthog-js/dist/exception-autocapture').catch(() => null),
  ])
    .then(([{ default: posthog }]) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_API_HOST,
        ui_host: POSTHOG_UI_HOST,
        defaults: '2026-08-30',
        person_profiles: 'identified_only',
        respect_dnt: true,
        capture_exceptions: true,
        // Нажатия собираем только на публичных страницах.
        autocapture: { url_allowlist: publicUrlAllowlist() },
        disable_external_dependency_loading: true,
        // Всё, что не разобрано в before_send и не проверено ревью, выключено здесь:
        // иначе галочка в настройках проекта PostHog включила бы это без правки кода.
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_performance: false,
        enable_recording_console_log: false,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        advanced_disable_feature_flags: true,
        remote_config_refresh_interval_ms: 0,
        // Коды входа, почта, телефон, БИН/ИИН в адресе первой страницы и в метках кампаний.
        mask_personal_data_properties: true,
        custom_personal_data_properties: SECRET_PARAMS,
        // Запись включаем сами (applyReplay), а не сразу при загрузке.
        disable_session_recording: true,
        // Идентификатор человека живёт только в localStorage: в cookie на .invoices.kz лежал бы сырой адрес
        // первой страницы и реферер (в том числе ссылка со счётом), и уходил бы на каждый наш поддомен.
        persistence: 'localStorage',
        session_recording: {
          maskAllInputs: true,
          // Значение поля скрыто одной меткой, а не звёздочками по длине: по длине видны сумма и категория.
          maskInputFn: (text: string) => (text ? '•••' : text),
          // Скрытые и файловые поля replay пишет открытыми: убираем их целиком. .ks-wrap -
          // анимированные сцены лендингов продуктов: данных в них нет, а писать их дорого.
          blockSelector: 'input[type="hidden"], input[type="file"], .ks-wrap',
          // Весь текст страницы проходит через maskReplayText: в блоках с данными (.ph-mask)
          // он скрыт целиком, в остальном вырезаются почта, телефоны и ИИН/БИН.
          maskTextSelector: '*',
          maskTextFn: maskReplayText,
          maskAttributeFn: maskReplayAttribute,
          maskCapturedNetworkRequestFn: request => ({
            ...request,
            // Тела и заголовки запросов не нужны, даже если в проекте PostHog включат их запись.
            requestHeaders: undefined,
            requestBody: undefined,
            responseHeaders: undefined,
            responseBody: undefined,
            name: typeof request.name === 'string' ? sanitizeUrl(request.name) : request.name,
          }),
          recordHeaders: false,
          recordBody: false,
          captureCanvas: { recordCanvas: false },
          captureJsonLd: false,
          // Ревью скорости: без сжатия каждого события в браузере телефону легче,
          // запросы всё равно уходят сжатыми.
          compress_events: false,
        },
        before_send: event => sanitizeEvent(event),
        loaded: () => {
          ph = posthog
          // Входа в браузере нет, а PostHog помнит человека (сессия пропала без «Выйти», Supabase на странице не грузится).
          if (signedIn === false && !pendingUser && ph.get_property('$user_state') === 'identified') pendingUser = 'reset-if-identified'
          applyUser()
          applyReplay()
        },
      })
    })
    .catch(() => {
      // posthog-js не загрузился (блокировщик, сеть): сайт работает как раньше
    })
}

// Из instrumentation-client, когда страница загружена и браузер простаивает.
export function startPosthog(): void {
  try {
    wanted = true
    initPosthog()
  } catch {
    // аналитика не должна ломать сайт
  }
}

// Начало перехода (onRouterTransitionStart): если цель непубличная, запись выключается
// сразу, пока старая страница ещё на экране. Включить запись отсюда нельзя.
export function trackNavigation(url: string): void {
  if (!enabled()) return
  try {
    const target = new URL(url, window.location.href)
    pendingPaths.push(target.origin === window.location.origin ? normalizePath(target.pathname) : EXTERNAL)
  } catch {
    return
  }
  if (pendingPaths.length > MAX_PENDING) pendingPaths = pendingPaths.slice(-MAX_PENDING)
  applyReplay()
}

// Новая страница уже на экране (AnalyticsRouteSync в корневом layout).
export function routeCommitted(pathname: string): void {
  if (!enabled()) return
  const path = normalizePath(pathname)
  committedPath = path
  // Этот переход и все начатые до него завершены. Если адреса нет среди начатых (сервер
  // перенаправил), завершённым считаем самый старый.
  const i = pendingPaths.lastIndexOf(path)
  pendingPaths = i >= 0 ? pendingPaths.slice(i + 1) : pendingPaths.slice(1)
  // Первая страница была с секретом в адресе (счёт по ссылке): запускаемся на следующей.
  if (!started) initPosthog()
  applyReplay()
}

// Вызывается из src/lib/supabase.ts на каждое событие сессии.
export function setAnalyticsUser(userId: string | null, event: string): void {
  if (!enabled()) return
  signedIn = userId !== null
  pendingUser = userId ? { id: userId } : event === 'SIGNED_OUT' ? 'reset' : 'reset-if-identified'
  applyUser()
  applyReplay()
}
