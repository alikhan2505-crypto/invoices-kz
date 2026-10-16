import { INTERNAL_KEY, VISITOR_KEY } from '@/lib/tools-i18n/toolEvents'
import {
  classifySource, FIRST_SOURCE_KEY, isCarSignal, isMobileUA, isProductionHost, nextFirstSource,
  parseFirstSource, type SignupSourceClass,
} from './classify'

// Клиентская половина счётчика заходов (отчёт «Машина/QR»). sendVisitBeacon —
// «выстрелил и забыл»: никогда не бросает и ничего не ждёт. Один бикон на
// загрузку документа: повторный монтаж (клиентский переход назад на «/»,
// StrictMode) ничего не шлёт. Отправка — когда браузер освободится
// (requestIdleCallback), или раньше, если человек уходит со страницы.
//
// Ничего личного: случайный id ЭТОЙ загрузки страницы (для отсева повторов),
// путь, хост реферера, utm, флаги «впервые» и «вошёл».

const ENDPOINT = '/api/track/visit'
// Метка «этот браузер уже был у нас» — дата первого захода, без id.
export const SEEN_KEY = 'invoices.seen'
// Метка «этот браузер уже пришёл с машины» — car_exact считается один раз.
export const CAR_SEEN_KEY = 'invoices.carSeen'

let startedThisDocument = false

function storageGet(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function storageSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) } catch {}
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {}
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

// Есть ли сохранённая сессия Supabase (localStorage или общая кука sb-*-auth-token,
// см. src/lib/sharedSessionStorage.ts). Без загрузки клиента Supabase.
function hasSupabaseSession(): boolean {
  try {
    const ls = window.localStorage
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k && /^sb-.+-auth-token/.test(k)) return true
    }
  } catch {}
  try {
    return /(?:^|;\s*)sb-[^=;]+-auth-token/.test(document.cookie)
  } catch {
    return false
  }
}

// Убрать utm_* из адресной строки после того, как метка прочитана: перезагрузка,
// вкладка из фона и ссылка, скопированная из адресной строки, уже без неё.
// Нативный replaceState Next.js сам синхронизирует с роутером (docs:
// linking-and-navigating → Native History API); лендинг utm не читает.
function stripUtmFromAddressBar(): void {
  try {
    const url = new URL(window.location.href)
    let changed = false
    for (const k of [...url.searchParams.keys()]) {
      if (k.toLowerCase().startsWith('utm_')) { url.searchParams.delete(k); changed = true }
    }
    if (changed) window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {}
}

function referrerHost(): string | null {
  try {
    if (!document.referrer) return null
    return new URL(document.referrer).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

function clientIsMobile(): boolean {
  try {
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    return isMobileUA(navigator.userAgent, typeof uaData?.mobile === 'boolean' ? uaData.mobile : null)
  } catch {
    return false
  }
}

export function sendVisitBeacon(): void {
  try {
    if (typeof window === 'undefined' || startedThisDocument) return
    startedThisDocument = true
    // Наши собственные прогоны и браузер основателя, помеченный как внутренний.
    if (navigator.webdriver === true || storageGet(INTERNAL_KEY) === '1') return

    const now = Date.now()
    const params = new URLSearchParams(window.location.search)
    const utm = {
      source: params.get('utm_source')?.slice(0, 100) || undefined,
      medium: params.get('utm_medium')?.slice(0, 100) || undefined,
      campaign: params.get('utm_campaign')?.slice(0, 100) || undefined,
    }
    // «Впервые» — ни нашей метки, ни id браузера бесплатных инструментов.
    const isNew = !storageGet(SEEN_KEY) && !storageGet(VISITOR_KEY)
    if (isNew) storageSet(SEEN_KEY, String(now))
    const signedIn = hasSupabaseSession()
    const ref = referrerHost()
    const path = window.location.pathname
    const host = window.location.hostname.toLowerCase()

    // Машинная метка: в зачёт «точно по QR» — один раз на браузер.
    let carSeen = false
    if (isCarSignal(path, utm.source)) {
      carSeen = !!storageGet(CAR_SEEN_KEY)
      if (!carSeen) storageSet(CAR_SEEN_KEY, String(now))
      stripUtmFromAddressBar()
    }

    // Первое касание для атрибуции будущей регистрации (30 дней, не перезаписываем).
    if (!signedIn) {
      const cls = classifySource({
        path, host, referrerHost: ref,
        utmSource: utm.source ?? null, utmMedium: utm.medium ?? null, utmCampaign: utm.campaign ?? null,
        isMobile: clientIsMobile(), isNew, signedIn, carSeen,
      })
      const ft = nextFirstSource(storageGet(FIRST_SOURCE_KEY), cls, now)
      if (ft) storageSet(FIRST_SOURCE_KEY, JSON.stringify(ft))
    }

    // Локальный dev и превью Vercel сервер всё равно отбросит — не шлём.
    if (!isProductionHost(host)) return

    const body = JSON.stringify({ loadId: randomId(), path, host, referrerHost: ref, utm, isNew, signedIn, carSeen })

    let sent = false
    const flush = () => {
      if (sent) return
      sent = true
      window.removeEventListener('pagehide', flush)
      try {
        // Строка уходит как text/plain — без CORS-предзапроса; сервер читает текст.
        if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, body)) return
      } catch {}
      fetch(ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, cache: 'no-store' }).catch(() => {})
    }
    window.addEventListener('pagehide', flush)
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(flush, { timeout: 4000 })
    else setTimeout(flush, 1500)
  } catch {
    // Счётчик не имеет права ломать страницу.
  }
}

// Источник для регистрации: первое касание этого браузера, иначе метка из
// метаданных письма (ссылку открыли в другом браузере), иначе 'unknown'.
export function readSignupSource(metaSource: unknown, now = Date.now()): SignupSourceClass {
  if (typeof window !== 'undefined') {
    const ft = parseFirstSource(storageGet(FIRST_SOURCE_KEY), now)
    if (ft) return ft.cls
  }
  const fromMeta = parseFirstSource(typeof metaSource === 'string' ? metaSource : null, now)
  return fromMeta ? fromMeta.cls : 'unknown'
}

// Сырое значение первого касания — для метаданных signInWithOtp на /login.
export function rawFreshFirstSource(now = Date.now()): string | null {
  if (typeof window === 'undefined') return null
  const raw = storageGet(FIRST_SOURCE_KEY)
  return parseFirstSource(raw, now) ? raw : null
}
