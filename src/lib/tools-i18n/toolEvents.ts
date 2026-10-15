import {
  FIRST_TOUCH_TTL_MS, isToolEventTool, VISITOR_ID_RE,
  type ToolEventLang, type ToolEventMedium, type ToolEventName, type ToolEventPayload,
  type ToolEventTool, type ToolEventToolOrNone, type ToolEventUtm,
} from '@/lib/toolEvents/schema'

// Клиентская половина своей аналитики бесплатных инструментов (15.10.2026,
// Vercel Web Analytics у проекта не включён). logToolEvent — «выстрелил и
// забыл»: никогда не бросает, ничего не ждёт и ничего не меняет на странице.
// Через navigator.sendBeacon, чтобы клик по CTA, уводящий со страницы, всё
// равно дошёл; без него — fetch с keepalive. Сервер: /api/tools/event.
//
// Ничего личного: случайный id браузера (invoices.visitor), utm из адреса,
// только хост реферера, «телефон/компьютер» по ширине окна.

export const VISITOR_KEY = 'invoices.visitor'
export const INTERNAL_KEY = 'invoices.internal'
export const FIRST_TOOL_KEY = 'invoices.firstTool'
const ENDPOINT = '/api/tools/event'

export interface FirstTouch {
  tool: ToolEventTool
  at: number
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

// Свежее (младше 30 дней) первое касание из сырого значения localStorage, или null.
export function parseFreshFirstTouch(raw: string | null, now: number): FirstTouch | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || !isToolEventTool(v.tool) || typeof v.at !== 'number') return null
    const age = now - v.at
    // «Из будущего» больше часа — сбитые часы или подделка: считаем протухшим.
    if (age >= FIRST_TOUCH_TTL_MS || age < -60 * 60 * 1000) return null
    const str = (x: unknown) => (typeof x === 'string' && x ? x.slice(0, 100) : undefined)
    return { tool: v.tool, at: v.at, utm_source: str(v.utm_source), utm_medium: str(v.utm_medium), utm_campaign: str(v.utm_campaign) }
  } catch {
    return null
  }
}

// Что записать в invoices.firstTool при просмотре инструмента: null — ничего
// (свежее касание уже есть, первое не перезаписываем).
export function nextFirstTouch(existingRaw: string | null, tool: ToolEventTool, utm: ToolEventUtm, now: number): FirstTouch | null {
  if (parseFreshFirstTouch(existingRaw, now)) return null
  const ft: FirstTouch = { tool, at: now }
  if (utm.source) ft.utm_source = utm.source
  if (utm.medium) ft.utm_medium = utm.medium
  if (utm.campaign) ft.utm_campaign = utm.campaign
  return ft
}

function storageGet(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function storageSet(key: string, value: string): boolean {
  try { window.localStorage.setItem(key, value); return true } catch { return false }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {}
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

// Id браузера; undefined, если хранилище закрыто (тогда каждый визит — новый человек).
function visitorId(): string | undefined {
  const existing = storageGet(VISITOR_KEY)
  if (existing && VISITOR_ID_RE.test(existing)) return existing
  const id = randomId()
  return storageSet(VISITOR_KEY, id) ? id : undefined
}

function currentUtm(): ToolEventUtm {
  try {
    const p = new URLSearchParams(window.location.search)
    const utm: ToolEventUtm = {}
    const s = p.get('utm_source'); if (s) utm.source = s.slice(0, 100)
    const m = p.get('utm_medium'); if (m) utm.medium = m.slice(0, 100)
    const c = p.get('utm_campaign'); if (c) utm.campaign = c.slice(0, 100)
    return utm
  } catch {
    return {}
  }
}

function referrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined
    return new URL(document.referrer).hostname || undefined
  } catch {
    return undefined
  }
}

export function isInternalBrowser(): boolean {
  try {
    if (storageGet(INTERNAL_KEY) === '1') return true
    return typeof navigator !== 'undefined' && navigator.webdriver === true
  } catch {
    return false
  }
}

// Свежее первое касание этого браузера — для события регистрации.
export function readFirstTouch(now = Date.now()): FirstTouch | null {
  if (typeof window === 'undefined') return null
  return parseFreshFirstTouch(storageGet(FIRST_TOOL_KEY), now)
}

export interface ToolEventExtra {
  lang?: ToolEventLang
  medium?: ToolEventMedium
  // Подменяет utm из адреса (регистрация шлёт utm первого касания).
  utm?: ToolEventUtm
  // Токен сессии: сервер возьмёт из него user_id. С ним — fetch с заголовком
  // (sendBeacon заголовков не умеет).
  accessToken?: string
}

export function logToolEvent(event: ToolEventName, tool: ToolEventToolOrNone, extra: ToolEventExtra = {}): void {
  try {
    if (typeof window === 'undefined') return
    const now = Date.now()
    const urlUtm = currentUtm()

    if (event === 'view' && tool !== 'none') {
      const ft = nextFirstTouch(storageGet(FIRST_TOOL_KEY), tool, urlUtm, now)
      if (ft) storageSet(FIRST_TOOL_KEY, JSON.stringify(ft))
    }

    const payload: ToolEventPayload = {
      event,
      tool,
      lang: extra.lang,
      visitor: visitorId(),
      medium: extra.medium,
      utm: extra.utm ?? urlUtm,
      referrerHost: referrerHost(),
      device: window.innerWidth < 768 ? 'mobile' : 'desktop',
      internal: isInternalBrowser() || undefined,
    }
    const body = JSON.stringify(payload)

    if (!extra.accessToken && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // Строка уходит как text/plain — без CORS-предзапроса; сервер читает текст.
      try { if (navigator.sendBeacon(ENDPOINT, body)) return } catch {}
    }
    const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=UTF-8' }
    if (extra.accessToken) headers.Authorization = `Bearer ${extra.accessToken}`
    fetch(ENDPOINT, { method: 'POST', body, headers, keepalive: true, cache: 'no-store' }).catch(() => {})
  } catch {
    // Аналитика не имеет права ломать инструмент.
  }
}
