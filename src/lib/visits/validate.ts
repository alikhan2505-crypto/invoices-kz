import { classifySource, isMobileUA, isProductionHost, normalizePath, type SourceClass } from './classify'

// Серверная проверка тела POST /api/track/visit. Эндпоинт публичный, поэтому
// всё по белым спискам и с ограничением длины. Ни IP, ни UA, ни email в
// строку не попадают: UA нужен только чтобы решить «телефон или нет» и
// «бот или нет», и дальше этой функции не уходит.

export const MAX_VISIT_BODY_CHARS = 2048
export const LOAD_ID_RE = /^[a-zA-Z0-9-]{8,64}$/
const HOST_RE = /^[a-z0-9.-]{1,253}$/
const PATH_RE = /^\/[a-z0-9\-_/.]{0,99}$/
const UTM_MAX = 100

export interface SiteVisitRow {
  load_id: string
  path: string
  host: string
  source_class: SourceClass
  is_mobile: boolean
  is_new: boolean
  signed_in: boolean
  utm_source: string | null
  utm_campaign: string | null
}

function utmValue(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, UTM_MAX)
  return s || null
}

export function cleanHost(raw: string | null | undefined): string | null {
  const h = (raw || '').split(':')[0].trim().toLowerCase()
  return HOST_RE.test(h) ? h : null
}

export interface VisitRequestMeta {
  host: string | null // заголовок Host запроса: бикон шлётся на тот же адрес, что и страница
  userAgent: string | null
  chMobile: string | null // Sec-CH-UA-Mobile
}

export function parseVisitBody(text: string, meta: VisitRequestMeta): SiteVisitRow | null {
  if (!text || text.length > MAX_VISIT_BODY_CHARS) return null
  let b: Record<string, unknown>
  try {
    const raw = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    b = raw as Record<string, unknown>
  } catch {
    return null
  }

  if (typeof b.loadId !== 'string' || !LOAD_ID_RE.test(b.loadId)) return null
  const host = cleanHost(meta.host) ?? cleanHost(typeof b.host === 'string' ? b.host : null)
  // Только invoices.kz и поддомены: локальный dev и превью Vercel пишут в тот
  // же боевой Supabase, но в отчёт основателю попадать не должны.
  if (!host || !isProductionHost(host)) return null
  const path = normalizePath(typeof b.path === 'string' ? b.path : '/')
  if (!PATH_RE.test(path)) return null

  const utm = b.utm && typeof b.utm === 'object' && !Array.isArray(b.utm) ? (b.utm as Record<string, unknown>) : {}
  const utmSource = utmValue(utm.source)
  const utmMedium = utmValue(utm.medium)
  const utmCampaign = utmValue(utm.campaign)
  const refRaw = typeof b.referrerHost === 'string' ? b.referrerHost.trim().toLowerCase() : ''
  const referrerHost = refRaw && HOST_RE.test(refRaw) ? refRaw : null
  const isNew = b.isNew === true
  const signedIn = b.signedIn === true
  const carSeen = b.carSeen === true
  const isMobile = isMobileUA(meta.userAgent, meta.chMobile)

  return {
    load_id: b.loadId,
    path,
    host,
    source_class: classifySource({ path, host, referrerHost, utmSource, utmMedium, utmCampaign, isMobile, isNew, signedIn, carSeen }),
    is_mobile: isMobile,
    is_new: isNew,
    signed_in: signedIn,
    utm_source: utmSource,
    utm_campaign: utmCampaign,
  }
}
