import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { looksLikeBot, parseToolEventBody } from './validate'

// Серверная половина POST /api/tools/event. Живёт в lib/, потому что файл
// маршрута Next может экспортировать только обработчики.
//
// Всегда 204 + no-store: аналитика не должна ни ломать страницу, ни
// рассказывать публичному эндпоинту, что пошло не так. Пока основатель не
// применил supabase/migrations/tool_events.sql, вставка падает — это тоже
// 204, а в лог одна строка за жизнь инстанса.

const RATE_WINDOW_MS = 60 * 1000
const RATE_LIMIT = 60
const hits = new Map<string, number[]>()

export function eventRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > RATE_LIMIT
}

let service: SupabaseClient | null = null
let auth: SupabaseClient | null = null
function clients() {
  if (!service) service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  if (!auth) auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  return { service, auth }
}

// Одна строка в лог на каждый РАЗНЫЙ сбой (вид + код ошибки), а не одна на
// весь инстанс: иначе «таблицы нет» до миграции навсегда заглушила бы
// следующую, другую ошибку (CHECK, сбой dedupe) после её применения.
const warned = new Set<string>()
function warnOnce(what: string, detail?: string, code?: string) {
  const key = `${what}:${code ?? ''}`
  if (warned.has(key) || warned.size > 50) return
  warned.add(key)
  console.error(`tools/event: ${what}${detail ? `: ${detail}` : ''} (repeats of this failure are not logged)`)
}

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

// Регистрация засчитывается только свежему аккаунту (профиль моложе суток):
// иначе любой вошедший мог бы «регистрироваться» по кругу.
const SIGNUP_MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function handleToolEvent(req: NextRequest): Promise<Response> {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (eventRateLimited(ip)) return noContent()

    const row = parseToolEventBody(await req.text().catch(() => ''))
    if (!row) return noContent()

    const { service, auth } = clients()
    let userId: string | null = null
    let internal = row.internal || looksLikeBot(req.headers.get('user-agent'))

    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    let profileCreatedAt: string | null = null
    if (token) {
      try {
        const { data: { user } } = await auth.auth.getUser(token)
        if (user) {
          userId = user.id
          const { data: profile } = await service.from('profiles').select('is_admin, created_at').eq('id', user.id).maybeSingle()
          if (profile?.is_admin) internal = true
          profileCreatedAt = profile?.created_at ?? null
        }
      } catch {}
    }

    if (row.event === 'signup') {
      if (!userId) return noContent()
      const createdMs = profileCreatedAt ? Date.parse(profileCreatedAt) : NaN
      if (!Number.isFinite(createdMs) || Date.now() - createdMs > SIGNUP_MAX_AGE_MS) return noContent()
      const { count, error } = await service.from('tool_events')
        .select('id', { count: 'exact', head: true })
        .eq('event', 'signup').eq('user_id', userId)
      if (error) { warnOnce('signup dedupe failed', error.message, error.code); return noContent() }
      if ((count ?? 0) > 0) return noContent()
    }

    const { error } = await service.from('tool_events').insert({ ...row, internal, user_id: userId })
    if (error) {
      // Код задеплоен, а tool_events_utm_content.sql ещё не применён: колонки utm_content
      // нет (Postgres 42703 / PostgREST PGRST204). Событие не теряем, пишем без токена.
      if (row.utm_content && (error.code === '42703' || error.code === 'PGRST204')) {
        warnOnce('utm_content column missing, event stored without it', undefined, error.code)
        const { utm_content: _drop, ...rest } = row
        const retry = await service.from('tool_events').insert({ ...rest, internal, user_id: userId })
        if (retry.error) warnOnce('insert failed', retry.error.message, retry.error.code)
      } else {
        warnOnce('insert failed', error.message, error.code)
      }
    }
  } catch (e) {
    warnOnce('handler threw', e instanceof Error ? e.message : String(e))
  }
  return noContent()
}
