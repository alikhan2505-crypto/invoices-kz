import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { looksLikeBot } from '@/lib/toolEvents/validate'
import { isSignupSourceClass } from './classify'
import { MAX_VISIT_BODY_CHARS, parseVisitBody } from './validate'

// Серверная половина POST /api/track/visit и POST /api/track/signup-source.
// Живёт в lib/, потому что файл маршрута Next экспортирует только обработчики.
//
// Всегда 204 + no-store: счётчик не должен ни ломать страницу, ни
// рассказывать публичному эндпоинту, что пошло не так. Пока основатель не
// применил supabase/migrations/site_visits.sql, вставка падает — это тоже
// 204, а в лог одна строка на каждый разный сбой.

const RATE_WINDOW_MS = 60 * 1000

// IP живёт только в памяти инстанса минуту и никуда не пишется.
export function makeRateLimiter(limit: number, windowMs = RATE_WINDOW_MS) {
  const hits = new Map<string, number[]>()
  return (ip: string, now = Date.now()): boolean => {
    const recent = (hits.get(ip) || []).filter(t => now - t < windowMs)
    recent.push(now)
    hits.set(ip, recent)
    if (hits.size > 5000) hits.clear()
    return recent.length > limit
  }
}
export const visitRateLimited = makeRateLimiter(30)
// Регистрация — одна на человека; 5 в минуту с IP с запасом.
export const signupSourceRateLimited = makeRateLimiter(5)

// Тело больше лимита отбрасывается по Content-Length, не читая его в память.
const SIGNUP_BODY_MAX = 512
export function bodyTooLarge(req: Request, max: number): boolean {
  const len = Number(req.headers.get('content-length') || '0')
  return Number.isFinite(len) && len > max
}

// Access-токен Supabase — JWT: три base64url-части через точку.
const JWT_RE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/
export function looksLikeJwt(token: string | null | undefined): token is string {
  return !!token && token.length <= 4096 && JWT_RE.test(token)
}

const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

let service: SupabaseClient | null = null
let auth: SupabaseClient | null = null
function clients() {
  if (!service) service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  if (!auth) auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  return { service, auth }
}

export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  return /does not exist|schema cache/i.test(error.message || '')
}

const warned = new Set<string>()
function warnOnce(where: string, what: string, detail?: string, code?: string) {
  const key = `${where}:${what}:${code ?? ''}`
  if (warned.has(key) || warned.size > 50) return
  warned.add(key)
  console.error(`${where}: ${what}${detail ? `: ${detail}` : ''} (repeats of this failure are not logged)`)
}

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function handleVisit(req: NextRequest): Promise<Response> {
  try {
    const ua = req.headers.get('user-agent')
    if (looksLikeBot(ua)) return noContent()
    if (bodyTooLarge(req, MAX_VISIT_BODY_CHARS * 4)) return noContent()
    if (visitRateLimited(clientIp(req))) return noContent()

    const row = parseVisitBody(await req.text().catch(() => ''), {
      host: req.headers.get('host'),
      userAgent: ua,
      chMobile: req.headers.get('sec-ch-ua-mobile'),
    })
    if (!row) return noContent()

    // Повтор бикона той же загрузки страницы (pagehide после idle, ретрай
    // браузера) упирается в уникальный load_id и молча пропускается.
    const { error } = await clients().service
      .from('site_visits')
      .upsert(row, { onConflict: 'load_id', ignoreDuplicates: true })
    if (error && !isMissingTableError(error)) warnOnce('track/visit', 'insert failed', error.message, error.code)
    else if (error) warnOnce('track/visit', 'site_visits table missing (apply supabase/migrations/site_visits.sql)')
  } catch (e) {
    warnOnce('track/visit', 'handler threw', e instanceof Error ? e.message : String(e))
  }
  return noContent()
}

// Регистрация засчитывается только свежему аккаунту (профиль моложе суток):
// иначе любой вошедший мог бы переписывать себе источник.
const SIGNUP_MAX_AGE_MS = 24 * 60 * 60 * 1000

// От клиента берём ровно одно — метку из фиксированного списка. user_id — из
// токена, свежесть — из profiles, первая запись выигрывает (ignoreDuplicates).
export async function handleSignupSource(req: NextRequest): Promise<Response> {
  try {
    if (bodyTooLarge(req, SIGNUP_BODY_MAX * 4)) return noContent()
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!looksLikeJwt(token)) return noContent()
    if (looksLikeBot(req.headers.get('user-agent')) || signupSourceRateLimited(clientIp(req))) return noContent()
    let body: unknown = null
    try { body = JSON.parse((await req.text().catch(() => '')).slice(0, 512)) } catch {}
    const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).source : null
    const source = isSignupSourceClass(raw) ? raw : 'unknown'

    const { service, auth } = clients()
    const { data: { user } } = await auth.auth.getUser(token)
    if (!user) return noContent()
    const { data: profile } = await service.from('profiles').select('created_at').eq('id', user.id).maybeSingle()
    const createdMs = profile?.created_at ? Date.parse(profile.created_at) : NaN
    if (!Number.isFinite(createdMs) || Date.now() - createdMs > SIGNUP_MAX_AGE_MS) return noContent()

    const { error } = await service
      .from('signup_sources')
      .upsert({ user_id: user.id, source_class: source }, { onConflict: 'user_id', ignoreDuplicates: true })
    if (error && !isMissingTableError(error)) warnOnce('track/signup-source', 'insert failed', error.message, error.code)
    else if (error) warnOnce('track/signup-source', 'signup_sources table missing (apply supabase/migrations/site_visits.sql)')
  } catch (e) {
    warnOnce('track/signup-source', 'handler threw', e instanceof Error ? e.message : String(e))
  }
  return noContent()
}
