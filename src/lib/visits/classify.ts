// Откуда пришёл посетитель публичной страницы (16.10.2026, отчёт «Машина/QR»).
// Чистые функции без браузера и Supabase: их зовут и клиент (первое касание
// для атрибуции регистрации), и сервер (строка в site_visits), и тесты.
//
// Классы — те же, что в CHECK-ограничениях supabase/migrations/site_visits.sql:
//   car_exact    — точно с машины: utm_source=car (короткие адреса /car, /qr
//                  редиректят на «/» с этой меткой) или сам путь /car|/qr —
//                  один раз на браузер: повтор с той же меткой (перезагрузка,
//                  вкладка из фона, ссылка из адресной строки) — direct_other;
//   car_likely   — оценка: телефон, без реферера (или реферер — Google Lens /
//                  приложение Google на Android, ими сканируют QR), без utm,
//                  главная «/» на invoices.kz/www, впервые, не вошедший. Так выглядит скан
//                  QR без метки и человек, набравший адрес с наклейки, — но
//                  так же выглядит и любой другой «набрал адрес сам»;
//   search       — поисковики (по utm или рефереру);
//   social       — Instagram, Facebook, Telegram, WhatsApp, TikTok и т.п.;
//   referral     — любой другой внешний сайт или незнакомая utm-кампания;
//   direct_other — остальное прямое (компьютер, повторный визит, вошедший,
//                  переход с собственного домена).

export const SOURCE_CLASSES = ['car_exact', 'car_likely', 'search', 'social', 'direct_other', 'referral'] as const
export type SourceClass = (typeof SOURCE_CLASSES)[number]

// Регистрация может не знать источник (ссылку из письма открыли в другом браузере).
export const SIGNUP_SOURCE_CLASSES = [...SOURCE_CLASSES, 'unknown'] as const
export type SignupSourceClass = (typeof SIGNUP_SOURCE_CLASSES)[number]

export const CAR_CLASSES: readonly SourceClass[] = ['car_exact', 'car_likely']

export const isSourceClass = (v: unknown): v is SourceClass =>
  typeof v === 'string' && (SOURCE_CLASSES as readonly string[]).includes(v)
export const isSignupSourceClass = (v: unknown): v is SignupSourceClass =>
  typeof v === 'string' && (SIGNUP_SOURCE_CLASSES as readonly string[]).includes(v)

export const BASE_DOMAIN = 'invoices.kz'

// Короткие адреса печатных QR (next.config.ts → redirects).
export const CAR_PATHS = ['/car', '/qr']
export const CAR_UTM_SOURCE = 'car'

export interface VisitSignals {
  path: string
  host: string
  referrerHost: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  isMobile: boolean
  isNew: boolean
  signedIn: boolean
  // Этот браузер уже засчитан как car_exact (метка invoices.carSeen).
  carSeen?: boolean
}

const SEARCH_UTM = new Set(['google', 'yandex', 'bing', 'duckduckgo', 'yahoo', 'mail.ru', '2gis'])
const SOCIAL_UTM = new Set([
  'instagram', 'ig', 'facebook', 'fb', 'meta', 'telegram', 'tg', 'whatsapp', 'wa',
  'tiktok', 'vk', 'youtube', 'threads', 'twitter', 'x', 'linkedin',
])

// Метки по плану трафика: tg_<чат>, ig_…, — это тоже соцсети, а не «чужой сайт».
// Префикс с подчёркиванием, чтобы не зацепить чужое (например, «tgx»).
const SOCIAL_UTM_PREFIXES = ['tg_', 'ig_', 'fb_', 'wa_', 'tiktok_', 'meta_']

// Хосты; совпадение — точное или поддомен (l.instagram.com, m.facebook.com).
// android-app://<пакет> из приложений Android парсится в хост = имя пакета.
const SEARCH_HOSTS = [
  'yandex.ru', 'yandex.kz', 'yandex.com', 'ya.ru', 'bing.com', 'duckduckgo.com', 'yahoo.com',
  'go.mail.ru', 'search.brave.com', 'ecosia.org',
  'com.google.android.googlequicksearchbox', 'ru.yandex.searchplugin', 'com.yandex.browser',
]
const SOCIAL_HOSTS = [
  'instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'messenger.com',
  't.me', 'telegram.org', 'telegram.me', 'org.telegram.messenger',
  'whatsapp.com', 'wa.me', 'com.whatsapp',
  'tiktok.com', 'vk.com', 'youtube.com', 'threads.net', 'x.com', 't.co', 'twitter.com', 'linkedin.com',
  'com.instagram.android', 'com.facebook.katana', 'com.zhiliaoapp.musically',
]

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some(d => host === d || host.endsWith(`.${d}`))
}

// google.com, google.kz, google.co.uk, www.google.ru …
const GOOGLE_RE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/

// Сканер QR на Android: Google Lens (lens.google.*) или приложение Google, из
// которого ссылка открывается во вкладке Chrome с реферером android-app://<пакет>.
// Через то же приложение приходят и клики из поиска, поэтому это сканом
// считается только при остальных признаках car_likely — иначе это search.
const SCANNER_PACKAGES = ['com.google.android.googlequicksearchbox', 'com.google.ar.lens']
const LENS_RE = /(^|\.)lens\.google\.[a-z]{2,3}(\.[a-z]{2})?$/
export function isScannerReferrer(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase()
  return SCANNER_PACKAGES.includes(h) || LENS_RE.test(h)
}

// Боевые хосты: invoices.kz и его поддомены. localhost и *.vercel.app — нет
// (локальный dev пишет в боевой Supabase, его заходы в отчёт попадать не должны).
export function isProductionHost(host: string, baseDomain = BASE_DOMAIN): boolean {
  const h = host.toLowerCase()
  return h === baseDomain || h.endsWith(`.${baseDomain}`)
}

export function isOwnHost(host: string, baseDomain = BASE_DOMAIN): boolean {
  return host === baseDomain || host.endsWith(`.${baseDomain}`) || host === 'localhost' || host === '127.0.0.1'
}

export function referrerKind(host: string | null, baseDomain = BASE_DOMAIN): 'none' | 'own' | 'search' | 'social' | 'other' {
  if (!host) return 'none'
  const h = host.toLowerCase()
  if (isOwnHost(h, baseDomain)) return 'own'
  if (GOOGLE_RE.test(h) || hostMatches(h, SEARCH_HOSTS)) return 'search'
  if (hostMatches(h, SOCIAL_HOSTS)) return 'social'
  return 'other'
}

export function normalizePath(path: string): string {
  const p = (path || '/').split(/[?#]/)[0].toLowerCase()
  return p.length > 1 ? p.replace(/\/+$/, '') || '/' : '/'
}

export function isApexLanding(host: string, path: string, baseDomain = BASE_DOMAIN): boolean {
  const h = host.toLowerCase()
  return (h === baseDomain || h === `www.${baseDomain}`) && normalizePath(path) === '/'
}

// Заход по машинной метке: utm_source=car или сам путь /car|/qr.
export function isCarSignal(path: string, utmSource: string | null | undefined): boolean {
  return (utmSource || '').trim().toLowerCase() === CAR_UTM_SOURCE || CAR_PATHS.includes(normalizePath(path))
}

export function classifySource(s: VisitSignals, baseDomain = BASE_DOMAIN): SourceClass {
  const path = normalizePath(s.path)
  const utmSource = (s.utmSource || '').trim().toLowerCase()
  const hasUtm = !!(utmSource || (s.utmMedium || '').trim() || (s.utmCampaign || '').trim())

  if (isCarSignal(path, utmSource)) return s.carSeen ? 'direct_other' : 'car_exact'

  // Метка сильнее реферера: её ставим мы сами.
  if (utmSource) {
    if (SEARCH_UTM.has(utmSource)) return 'search'
    if (SOCIAL_UTM.has(utmSource) || SOCIAL_UTM_PREFIXES.some(p => utmSource.startsWith(p))) return 'social'
  }

  const ref = referrerKind(s.referrerHost, baseDomain)
  const scanLike = ref === 'none' || isScannerReferrer(s.referrerHost)
  if (s.isMobile && scanLike && !hasUtm && isApexLanding(s.host, path, baseDomain) && s.isNew && !s.signedIn) {
    return 'car_likely'
  }

  if (ref === 'search') return 'search'
  if (ref === 'social') return 'social'

  if (ref === 'other' || hasUtm) return 'referral'
  return 'direct_other'
}

// Телефон или нет. Сначала клиентская подсказка (Sec-CH-UA-Mobile «?1»/«?0» на
// сервере, navigator.userAgentData.mobile в браузере), иначе — по UA. Планшеты
// (iPad, Android без «Mobile») считаем телефоном: QR сканируют и ими.
const MOBILE_UA_RE = /android|iphone|ipod|ipad|mobile|windows phone|opera mini|iemobile/i
export function isMobileUA(ua: string | null | undefined, chMobile?: string | boolean | null): boolean {
  if (chMobile === true || chMobile === '?1') return true
  if (chMobile === false || chMobile === '?0') return false
  return !!ua && MOBILE_UA_RE.test(ua)
}

// ── Первое касание для атрибуции регистрации (localStorage, 30 дней) ──

export const FIRST_SOURCE_KEY = 'invoices.firstSource'
export const FIRST_SOURCE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface FirstSource {
  cls: SourceClass
  at: number
}

export function parseFirstSource(raw: string | null, now: number): FirstSource | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || !isSourceClass(v.cls) || typeof v.at !== 'number') return null
    const age = now - v.at
    if (age >= FIRST_SOURCE_TTL_MS || age < -60 * 60 * 1000) return null
    return { cls: v.cls, at: v.at }
  } catch {
    return null
  }
}

// Что записать при заходе: null — ничего (свежее первое касание уже есть).
export function nextFirstSource(existingRaw: string | null, cls: SourceClass, now: number): FirstSource | null {
  if (parseFirstSource(existingRaw, now)) return null
  return { cls, at: now }
}
