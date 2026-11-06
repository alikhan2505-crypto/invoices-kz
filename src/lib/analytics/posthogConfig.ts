// PostHog (подключён 04.11.2026 по просьбе основателя): просмотры страниц, нажатия,
// ошибки JS и записи сессий гостей на публичных страницах, чтобы видеть, где люди
// уходят по дороге к регистрации (замер 30.10: пятеро нажали «регистрация», писем 0).
// Здесь только чистые правила (что и где собираем), браузерная часть в posthogClient.ts.
// Правила дополнены по трём независимым ревью 04–05.11 (приватность, корректность, скорость).

// Публичный ключ проекта (phc_): PostHog задумывал его видимым в коде любой страницы.
// Секретные ключи phs_ сюда не кладём никогда. Пустая строка = аналитика выключена.
export const POSTHOG_KEY: string = 'phc_rCRxj9Yo4vrhqg6R5Q8yG5Sm6fnCaKpaZKGcDQ4dakvE'
// Проект создан в регионе US. Запросы идут напрямую, без прокси через наш домен:
// прокси в Next требует skipTrailingSlashRedirect, а он меняет адреса всех страниц.
export const POSTHOG_API_HOST = 'https://us.i.posthog.com'
export const POSTHOG_UI_HOST = 'https://us.posthog.com'

const BASE_DOMAIN = 'invoices.kz'
// Хосты платформы. Сайты салонов на своих поддоменах, превью Vercel и localhost не считаем.
const PLATFORM_SUBDOMAINS = ['www', 'kaspi', 'agent', 'salon', 'cfo', 'api', 'docs']

export function isTrackedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === BASE_DOMAIN || PLATFORM_SUBDOMAINS.some(sub => host === `${sub}.${BASE_DOMAIN}`)
}

// Публичные разделы: здесь человек решает, регистрироваться ли, и только здесь
// пишем сессии и собираем нажатия. Корень «/» на любом хосте платформы - лендинг.
// Не публичные: кабинет, счета по ссылке (/view), договоры, проверка подписи, возврат
// из письма входа (/auth), сайты салонов и витрины, документация API (/kaspi-api/docs и
// api.invoices.kz/docs гостя отправляют на вход, содержимое видят только вошедшие).
const PUBLIC_PREFIXES = [
  '/tools', '/guides', '/bik', '/login', '/lp', '/products', '/invoices-landing',
  '/cashier-api', '/privacy', '/terms', '/data-deletion',
]

export function normalizePath(pathname: string): string {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
}

export function isPublicPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/' || PUBLIC_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Те же разделы для autocapture.url_allowlist (PostHog сверяет его с полным адресом страницы).
export function publicUrlAllowlist(): RegExp[] {
  const sections = PUBLIC_PREFIXES.map(p => escapeRe(p.slice(1))).join('|')
  const host = `(?:[a-z0-9-]+\\.)?${escapeRe(BASE_DOMAIN)}`
  return [new RegExp(`^https://${host}(?:/(?:${sections})(?:[/?#]|$)|/?(?:[?#]|$))`, 'i')]
}

// Секрет в самом пути: ссылка на счёт, договор, проверка подписи и их API.
const SECRET_PATHS: [RegExp, string][] = [
  [/^\/view\/[^/]+/, '/view/[token]'],
  [/^\/contract-view\/[^/]+/, '/contract-view/[token]'],
  [/^\/verify\/[^/]+/, '/verify/[id]'],
  [/^\/api\/public\/(invoice|contract|signature)\/[^/]+/, '/api/public/$1/[token]'],
]

// Страницы, на которых PostHog не запускаем вовсе: секрет в адресе (счёт, договор,
// подпись) или код из письма входа (/auth). PostHog запоминает адрес первой страницы
// целиком и потом шлёт его в свойствах человека, мимо before_send.
export function isSecretPage(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/auth' || path.startsWith('/auth/') || SECRET_PATHS.some(([re]) => re.test(path))
}

// Параметры, которые нельзя отправлять: коды и токены входа из письма, почта,
// телефон, БИН/ИИН. Метки utm и прочие оставляем.
export const SECRET_PARAMS: string[] = [
  'code', 'token', 'token_hash', 'access_token', 'refresh_token', 'type', 'state',
  'error_description', 'email', 'phone', 'bin', 'iin',
]
const SECRET_PARAM_SET = new Set(SECRET_PARAMS)

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value // битая кодировка: сравниваем как есть
  }
}

function scrubUrl(value: string, depth: number): { clean: string; changed: boolean } | null {
  const isAbsolute = /^https?:\/\//i.test(value)
  if (!isAbsolute && !value.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(value, `https://${BASE_DOMAIN}`)
  } catch {
    return null
  }
  let path = url.pathname
  for (const [re, replacement] of SECRET_PATHS) path = path.replace(re, replacement)
  let changed = path !== url.pathname || url.hash !== ''
  // Параметры разбираем по сырой строке, чтобы оставшиеся не перекодировались.
  const kept: string[] = []
  for (const pair of url.search.slice(1).split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    if (SECRET_PARAM_SET.has(decode(rawKey).toLowerCase())) {
      changed = true
      continue
    }
    // Адрес внутри параметра (?next=/view/…, обёртка ссылок Instagram ?u=https://…).
    const inner = eq === -1 || depth >= 2 ? null : scrubUrl(decode(pair.slice(eq + 1)), depth + 1)
    if (inner?.changed) {
      kept.push(`${rawKey}=${encodeURIComponent(inner.clean)}`)
      changed = true
      continue
    }
    kept.push(pair)
  }
  const rest = `${path}${kept.length ? `?${kept.join('&')}` : ''}`
  return { clean: isAbsolute ? `${url.origin}${rest}` : rest, changed }
}

// Чистит адрес (полный или только путь): секреты в пути, секретные параметры, весь
// #фрагмент (Supabase кладёт туда токены входа), такие же адреса внутри параметров.
// Остальное оставляет как было.
export function sanitizeUrl(value: string): string {
  return scrubUrl(value, 0)?.clean ?? value
}

// Почта, телефоны и 12 цифр подряд (ИИН/БИН) в свободном тексте: подписи нажатых
// кнопок, сообщения об ошибках, текст записи сессии. Без lookbehind: старый Safari
// внутри Instagram падает на нём при разборе всего файла.
const TEXT_SCRUBS: [RegExp, string][] = [
  [/[^\s@"'<>()]+@[^\s@"'<>()]+/g, '[email]'],
  [/(^|[^\d+])(?:\+?7|8)[\s(-]{0,2}\d{3}[\s)-]{0,2}\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g, '$1[phone]'],
  [/(^|\D)\d{12}(?!\d)/g, '$1[iin]'],
]
// Адреса в тексте (например, в сообщении об ошибке запроса) чистим так же, как в свойствах.
const URL_IN_TEXT = /https?:\/\/[^\s"'<>()]+|\/(?:view|contract-view|verify|auth)\/[^\s"'<>()]+/g

export function scrubText(text: string): string {
  let out = text.replace(URL_IN_TEXT, m => sanitizeUrl(m))
  for (const [re, replacement] of TEXT_SCRUBS) out = out.replace(re, replacement)
  return out
}

// Блоки, где на экране повторяются введённые данные (итоги, расчёты, имена файлов,
// почта): в записи сессии их текст и подписи-атрибуты скрыты целиком.
const MASKED_ZONE = '.ph-mask, [contenteditable]'

function inMaskedZone(element: Element | null | undefined): boolean {
  try {
    return !element || typeof element.closest !== 'function' || element.closest(MASKED_ZONE) !== null
  } catch {
    return true
  }
}

// Скрытый текст заменяется одной меткой, а не звёздочками по буквам: иначе по длине и пробелам
// видно порядок суммы. Пробельные узлы не трогаем, вёрстка записи от этого не ломается.
const MASK = '•••'
const maskValue = (text: string) => (/\S/.test(text) ? MASK : text)

// maskTextFn записи сессии: rrweb зовёт её для каждого текста страницы (maskTextSelector '*').
export function maskReplayText(text: string, element?: HTMLElement | null): string {
  return inMaskedZone(element) ? maskValue(text) : scrubText(text)
}

// Атрибуты с текстом: подписи для экранного диктора, подсказки, alt. rrweb прячет только
// текст, а суммы и имена файлов сидят и в aria-label.
const TEXT_ATTRIBUTES = new Set(['aria-label', 'aria-valuetext', 'aria-description', 'title', 'alt', 'placeholder', 'value', 'data-value'])

// maskAttributeFn записи сессии.
export function maskReplayAttribute(name: string, value: string, element?: Element | null): string {
  // В адресе могут быть БИН/ИИН (ссылки на реестры): после чистки секретов вырезаем и их.
  if (name === 'href' || name === 'action') return scrubText(sanitizeUrl(value))
  // Картинки из данных страницы (data: и blob:) в записи не нужны: в них может быть что угодно.
  if ((name === 'src' || name === 'srcset') && /^\s*(data|blob):/i.test(value)) return ''
  if (!TEXT_ATTRIBUTES.has(name) && !name.startsWith('data-')) return value
  return inMaskedZone(element) ? maskValue(value) : scrubText(value)
}

type Props = Record<string, unknown>
// Адреса на любой глубине события: $current_url, $referrer, href нажатой ссылки, адреса
// файлов в стеке ошибки (filename, abs_path).
const URL_KEY = /(?:url|href|pathname|referrer|filename|abs_path)$/i
// Сырые данные записи сессии чистит сам рекордер (maskReplayText и т.д.).
const SKIP_KEYS = new Set(['$snapshot_data'])

function scrubUrls(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 6) return
  if (Array.isArray(value)) {
    for (const item of value) scrubUrls(item, depth + 1)
    return
  }
  const obj = value as Props
  for (const [key, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue
    if (typeof v === 'string') {
      if (URL_KEY.test(key)) obj[key] = sanitizeUrl(v)
    } else if (v && typeof v === 'object') {
      scrubUrls(v, depth + 1)
    }
  }
}

// Текст элементов в цепочке autocapture: подпись, aria-label, title, alt, placeholder, value.
const ELEMENT_TEXT = /((?:text|attr__aria-label|attr__title|attr__alt|attr__placeholder|attr__value)=")((?:[^"\\]|\\.)*)"/g
const ELEMENT_TEXT_KEYS = ['$el_text', 'attr__aria-label', 'attr__title', 'attr__alt', 'attr__placeholder', 'attr__value']
const CHAIN_HREF = /((?:attr__)?href=")((?:[^"\\]|\\.)*)"/g
// Нажатие внутри блока с данными: класс ph-mask у элемента или предка, поле contenteditable.
const MASKED_CHAIN = /(?:^|[\s.;:"])ph-mask(?=$|[\s.;:"])|attr__contenteditable=/

function hasMaskedElement(props: Props): boolean {
  if (typeof props.$elements_chain === 'string' && MASKED_CHAIN.test(props.$elements_chain)) return true
  if (!Array.isArray(props.$elements)) return false
  return props.$elements.some(el => {
    if (!el || typeof el !== 'object') return false
    const e = el as Props
    return (Array.isArray(e.classes) && e.classes.includes('ph-mask')) || 'attr__contenteditable' in e
  })
}

function scrubElements(props: Props, fn: (text: string) => string | null): void {
  if (typeof props.$el_text === 'string') {
    const text = fn(props.$el_text)
    if (text === null) delete props.$el_text
    else props.$el_text = text
  }
  if (typeof props.$elements_chain === 'string') {
    props.$elements_chain = props.$elements_chain.replace(ELEMENT_TEXT, (_m, head: string, text: string) => {
      const clean = fn(text)
      return clean === null ? '' : `${head}${clean}"`
    })
  }
  if (Array.isArray(props.$elements)) {
    for (const el of props.$elements) {
      if (!el || typeof el !== 'object') continue
      for (const key of ELEMENT_TEXT_KEYS) {
        const value = (el as Props)[key]
        if (typeof value !== 'string') continue
        const clean = fn(value)
        if (clean === null) delete (el as Props)[key]
        else (el as Props)[key] = clean
      }
    }
  }
}

function scrubException(props: Props): void {
  if (typeof props.$exception_message === 'string') props.$exception_message = scrubText(props.$exception_message)
  if (!Array.isArray(props.$exception_list)) return
  for (const item of props.$exception_list) {
    if (item && typeof item === 'object' && typeof (item as Props).value === 'string') {
      (item as Props).value = scrubText((item as Props).value as string)
    }
  }
}

// Выключены в init (posthogClient). Если их всё же включат в настройках проекта PostHog,
// не отправляем: у тепловой карты адрес страницы стоит ключом, а мёртвые клики не смотрят
// ни на список публичных страниц, ни на ph-no-capture.
const DROPPED_EVENTS = new Set(['$$heatmap', '$dead_click', '$dead_swipe'])

export interface AnalyticsEvent {
  event?: string
  properties?: Props
  $set?: Props
  $set_once?: Props
}

// before_send: чистит адреса во всём событии и текст ошибок; текст нажатых элементов
// оставляет только на публичных страницах и не из блоков с данными (там вырезает почту,
// телефоны и ИИН/БИН), в кабинете убирает и заголовок страницы (там бывают имена клиентов).
export function sanitizeEvent<T extends AnalyticsEvent>(event: T | null): T | null {
  if (!event) return event
  if (event.event && DROPPED_EVENTS.has(event.event)) return null
  const props = event.properties
  scrubUrls(props)
  scrubUrls(event.$set)
  scrubUrls(event.$set_once)
  if (props) {
    scrubException(props)
    if (typeof props.$elements_chain === 'string') {
      props.$elements_chain = props.$elements_chain.replace(CHAIN_HREF, (_m, head: string, href: string) => `${head}${sanitizeUrl(href)}"`)
    }
    const where = typeof props.$pathname === 'string' ? props.$pathname
      : typeof props.$current_url === 'string' ? props.$current_url : ''
    let pathname = where
    try {
      pathname = new URL(where, `https://${BASE_DOMAIN}`).pathname
    } catch {
      // оставляем как есть
    }
    const isPublic = where !== '' && isPublicPath(pathname)
    if (!isPublic || hasMaskedElement(props)) scrubElements(props, () => null)
    else scrubElements(props, scrubText)
    // Заголовок у $pageview при переходе внутри сайта ещё от страницы, которую покинули (счёт или договор),
    // а у остальных событий его нет: адрес страницы и так есть в $current_url.
    delete props.title
  }
  return event
}
