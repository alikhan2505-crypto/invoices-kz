import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFounderTelegram } from '@/lib/founderTelegram'
import { isCronAuthorized } from '@/lib/cronAuth'
import { almatyDay, formatAlmatyDay, ALMATY_OFFSET_MS } from '@/lib/visits/almatyDay'
import { isMissingTableError } from '@/lib/visits/server'
import { aggregateToolFunnel, type ToolEventDbRow } from '@/lib/toolEvents/funnel'
import { buildDailyFunnelText } from '@/lib/funnelDaily/report'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Утренняя сводка основателю «воронка за вчера»: 04:00 UTC = 09:00 в Алматы
// (vercel.json). Регистрации, инструменты, страница входа, публикации Instagram
// за прошедшие сутки по Алматы. Один отчёт в сутки: день «захватывается»
// строкой daily_reports (kind 'funnel'), как у cron/car-report; при сбое
// отправки захват снимается, чтобы повтор дошёл.
//
// ?dry=1 (с тем же CRON_SECRET) — вернуть текст, ничего не отправляя.
// ?day=YYYY-MM-DD — собрать сводку за указанный день (только с dry=1).
export const maxDuration = 60

const PAGE = 1000

async function count(table: string, from: string, to: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let q: any = supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to)
    if (filter) q = filter(q)
    const { count: c, error } = await q
    return error || typeof c !== 'number' ? null : c
  } catch { return null }
}

async function run(request: Request) {

  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const dayParam = url.searchParams.get('day')
  const now = new Date()
  let target = almatyDay(now, -1)
  if (dry && dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
    const noon = new Date(Date.parse(`${dayParam}T12:00:00Z`) - ALMATY_OFFSET_MS)
    target = almatyDay(noon)
  }
  const prev = almatyDay(new Date(Date.parse(target.startIso) - 1))

  const rows: ToolEventDbRow[] = []
  let eventsOk = true
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('tool_events')
      .select('created_at, event, tool, visitor, user_id, internal, medium, utm_source, utm_medium, utm_campaign')
      .gte('created_at', target.startIso).lt('created_at', target.endIso)
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) { eventsOk = false; console.error('cron/funnel-daily: tool_events read failed:', error.message); break }
    rows.push(...((data as ToolEventDbRow[]) || []))
    if (!data || data.length < PAGE || rows.length >= 50_000) break
  }
  if (!eventsOk) return NextResponse.json({ ok: false, error: 'events read failed' }, { status: 502 })

  const funnel = aggregateToolFunnel(rows, { days: 1, includeInternal: false, now: Date.parse(target.endIso) - 1 })

  let igPosts: { kind: string; at: string }[] | null = null
  try {
    const { data, error } = await supabase.from('instagram_drafts').select('media_kind, published_at')
      .eq('status', 'published').gte('published_at', target.startIso).lt('published_at', target.endIso).order('published_at')
    if (!error) {
      igPosts = (data ?? []).map(p => {
        const local = new Date(Date.parse(p.published_at as string) + ALMATY_OFFSET_MS)
        const hhmm = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
        return { kind: p.media_kind === 'reel' ? 'Reel' : p.media_kind === 'image' ? 'картинка' : String(p.media_kind ?? 'пост'), at: hhmm }
      })
    }
  } catch { /* н/д */ }

  const notAdmin = (q: any) => q.not('is_admin', 'is', true)
  const [signups, signupsPrev, invoices, binWatch] = await Promise.all([
    count('profiles', target.startIso, target.endIso, notAdmin),
    count('profiles', prev.startIso, prev.endIso, notAdmin),
    count('invoices', target.startIso, target.endIso),
    count('bin_watch', target.startIso, target.endIso),
  ])

  const text = buildDailyFunnelText({ label: formatAlmatyDay(target.day), funnel, signups, signupsPrev, invoices, binWatch, igPosts })
  if (dry) return NextResponse.json({ dry: true, day: target.day, text })

  const KIND = 'funnel'
  let claimed = false
  const { error: claimError } = await supabase.from('daily_reports').insert({ day: target.day, kind: KIND })
  if (claimError) {
    if (claimError.code === '23505') return NextResponse.json({ ok: true, already: true, day: target.day })
    if (!isMissingTableError(claimError)) console.error('cron/funnel-daily: claim failed:', claimError.message)
  } else {
    claimed = true
  }

  const sent = await sendFounderTelegram(text)
  if (!sent.ok) {
    console.error('cron/funnel-daily: send failed:', sent.reason)
    if (claimed) await supabase.from('daily_reports').delete().eq('day', target.day).eq('kind', KIND)
    return NextResponse.json({ ok: false, error: 'send failed' }, { status: 502 })
  }
  if (claimed) await supabase.from('daily_reports').update({ sent_at: new Date().toISOString() }).eq('day', target.day).eq('kind', KIND)
  return NextResponse.json({ ok: true, day: target.day })
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return await run(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('cron/funnel-daily: failed:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
