import {
  isToolEventName, isToolEventTool, TOOL_EVENT_LANGS, TOOL_EVENT_MEDIUMS, UTM_CONTENT_RE, VISITOR_ID_RE,
  type ToolEventLang, type ToolEventMedium, type ToolEventName, type ToolEventToolOrNone,
} from './schema'

// Серверная проверка тела POST /api/tools/event. Маршрут публичный, поэтому
// всё — по белым спискам и с ограничением длины: в таблицу не попадает ни
// одна произвольная строка длиннее UTM-метки. Нарушение обязательного поля
// (событие, инструмент) — null, событие не пишется; необязательное поле с
// мусором просто отбрасывается, а не губит всё событие.

export const MAX_BODY_CHARS = 4096
const UTM_MAX = 100
const HOST_RE = /^[a-z0-9.-]{1,253}$/

// Строка такой, как её запишем: тот же набор колонок, что в tool_events.
export interface ToolEventRow {
  event: ToolEventName
  tool: ToolEventToolOrNone
  lang: ToolEventLang | null
  visitor: string | null
  medium: ToolEventMedium | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  // Есть в строке ТОЛЬКО когда пришёл валидный токен: до миграции
  // tool_events_utm_content.sql колонки нет, и лишний ключ ронял бы вставку всех событий.
  utm_content?: string
  referrer_host: string | null
  device: 'mobile' | 'desktop' | null
  internal: boolean
}

function utmValue(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // Управляющие символы — вон; длинное обрезаем, а не выбрасываем.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, UTM_MAX)
  return s || null
}

export function parseToolEventPayload(raw: unknown): ToolEventRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const b = raw as Record<string, unknown>
  if (!isToolEventName(b.event)) return null
  const tool: ToolEventToolOrNone | null = isToolEventTool(b.tool) ? b.tool : b.tool === 'none' ? 'none' : null
  if (!tool) return null
  // 'none' допустим только у регистрации и шагов страницы входа (login_*): просмотр
  // «никакого» инструмента — мусор.
  if (tool === 'none' && b.event !== 'signup' && !b.event.startsWith('login_')) return null

  const lang = typeof b.lang === 'string' && (TOOL_EVENT_LANGS as readonly string[]).includes(b.lang) ? (b.lang as ToolEventLang) : null
  const visitor = typeof b.visitor === 'string' && VISITOR_ID_RE.test(b.visitor) ? b.visitor : null
  const medium = typeof b.medium === 'string' && (TOOL_EVENT_MEDIUMS as readonly string[]).includes(b.medium) ? (b.medium as ToolEventMedium) : null
  const utm = b.utm && typeof b.utm === 'object' && !Array.isArray(b.utm) ? (b.utm as Record<string, unknown>) : {}
  const host = typeof b.referrerHost === 'string' ? b.referrerHost.trim().toLowerCase() : ''
  const device = b.device === 'mobile' || b.device === 'desktop' ? b.device : null
  const content = typeof utm.content === 'string' && UTM_CONTENT_RE.test(utm.content.trim()) ? utm.content.trim() : null

  return {
    event: b.event,
    tool,
    lang,
    visitor,
    medium,
    utm_source: utmValue(utm.source),
    utm_medium: utmValue(utm.medium),
    utm_campaign: utmValue(utm.campaign),
    ...(content ? { utm_content: content } : {}),
    referrer_host: HOST_RE.test(host) ? host : null,
    device,
    internal: b.internal === true,
  }
}

// Тело приходит и как application/json (fetch), и как text/plain
// (navigator.sendBeacon со строкой) — читаем текстом и разбираем сами.
export function parseToolEventBody(text: string): ToolEventRow | null {
  if (!text || text.length > MAX_BODY_CHARS) return null
  try {
    return parseToolEventPayload(JSON.parse(text))
  } catch {
    return null
  }
}

// Боты, краулеры и безголовые браузеры (в т.ч. наши собственные Playwright-
// прогоны) — помечаем internal, чтобы не раздували воронку.
const BOT_UA_RE = /headlesschrome|headless|bot\b|bot\/|crawler|spider|crawl|playwright|puppeteer|lighthouse|slurp|bingpreview|facebookexternalhit|python-requests|curl\/|wget\//i

export function looksLikeBot(ua: string | null | undefined): boolean {
  if (!ua) return true
  return BOT_UA_RE.test(ua)
}
