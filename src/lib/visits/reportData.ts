import type { SupabaseClient } from '@supabase/supabase-js'
import { almatyDay, formatAlmatyTime } from './almatyDay'
import { CAR_CLASSES } from './classify'
import type { CarReportData, DayCounts } from './report'
import { isMissingTableError } from './server'

// Числа для отчёта «Машина/QR» (service-role). Только счётчики (head: true):
// строки не выгружаются, лимит PostgREST в 1000 строк не мешает. Каждая
// метрика независима — сбой одной даёт «н/д», а не падение всего отчёта.

type Range = { from: string; to: string }
// Билдер PostgREST после .select() — тип громоздкий, фильтры ниже простые.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (q: any) => any

async function countRows(sb: SupabaseClient, table: string, r: Range, filter?: Filter): Promise<{ n: number | null; missing: boolean }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from(table).select('*', { count: 'exact', head: true }).gte('created_at', r.from).lt('created_at', r.to)
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) return { n: null, missing: isMissingTableError(error) }
    // Нет числа без ошибки — не ноль, а «н/д».
    return { n: typeof count === 'number' ? count : null, missing: false }
  } catch {
    return { n: null, missing: false }
  }
}

// HEAD-запрос (head: true) к несуществующей таблице приходит 404 без тела, и
// supabase-js не отдаёт по нему ни ошибки, ни кода — «таблицы нет» выглядело
// бы как «ноль заходов». Поэтому наличие таблицы проверяется обычным GET.
async function tableMissing(sb: SupabaseClient, table: string, column: string): Promise<boolean> {
  try {
    const { error } = await sb.from(table).select(column).limit(1)
    return isMissingTableError(error)
  } catch {
    return false
  }
}

// День (по Алматы) первой строки site_visits — для оговорки о первой неделе.
async function trackingSince(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await sb.from('site_visits').select('created_at').order('created_at', { ascending: true }).limit(1)
    const first = !error && Array.isArray(data) ? (data[0] as { created_at?: string } | undefined)?.created_at : undefined
    return first ? almatyDay(new Date(first)).day : null
  } catch {
    return null
  }
}

const notAdmin: Filter = q => q.not('is_admin', 'is', true)
const carSource: Filter = q => q.in('source_class', CAR_CLASSES as string[])

async function dayCounts(sb: SupabaseClient, r: Range): Promise<DayCounts> {
  const [visits, newVisitors, carExact, carLikely, carSignups, signups] = await Promise.all([
    countRows(sb, 'site_visits', r),
    countRows(sb, 'site_visits', r, q => q.eq('is_new', true)),
    countRows(sb, 'site_visits', r, q => q.eq('source_class', 'car_exact')),
    countRows(sb, 'site_visits', r, q => q.eq('source_class', 'car_likely')),
    countRows(sb, 'signup_sources', r, carSource),
    countRows(sb, 'profiles', r, notAdmin),
  ])
  return {
    visits: visits.n, newVisitors: newVisitors.n, carExact: carExact.n, carLikely: carLikely.n,
    carSignups: carSignups.n, signups: signups.n,
  }
}

export async function loadCarReportData(sb: SupabaseClient, now: Date): Promise<CarReportData> {
  const today = almatyDay(now)
  const yesterday = almatyDay(now, -1)
  const weekStart = almatyDay(now, -6)
  const week: Range = { from: weekStart.startIso, to: today.endIso }

  const [visitsMissing, sourcesMissing, since, t, y, weekCar, weekCarSignups, weekSignups] = await Promise.all([
    tableMissing(sb, 'site_visits', 'id'),
    tableMissing(sb, 'signup_sources', 'user_id'),
    trackingSince(sb),
    dayCounts(sb, { from: today.startIso, to: today.endIso }),
    dayCounts(sb, { from: yesterday.startIso, to: yesterday.endIso }),
    countRows(sb, 'site_visits', week, carSource),
    countRows(sb, 'signup_sources', week, carSource),
    countRows(sb, 'profiles', week, notAdmin),
  ])

  return {
    day: today.day,
    asOf: formatAlmatyTime(now),
    trackingSince: since,
    tablesMissing: visitsMissing || sourcesMissing,
    today: t,
    yesterday: y,
    week: { carVisits: weekCar.n, carSignups: weekCarSignups.n, signups: weekSignups.n },
  }
}
