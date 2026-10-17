import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, serviceSupabase } from '@/lib/salonSites/adminAuth'
import { periodStart } from '@/lib/toolEvents/funnel'
import { isMissingTableError } from './server'
import { aggregateTraffic, TRAFFIC_WINDOWS, type SignupSourceDbRow, type TrafficSources, type VisitDbRow } from './sources'

// GET /api/admin/traffic-sources — только админ (общий requireAdmin, Bearer).
// Читает site_visits и signup_sources за 30 дней страницами по 1000 (потолок
// PostgREST), от новых к старым, и сворачивает чистой aggregateTraffic.
// Нет таблиц (supabase/migrations/site_visits.sql ещё не применён) —
// флаги visitsMissing / signupsMissing, остальное считается.

const PAGE = 1000
const MAX_ROWS = 200_000

export const TRAFFIC_MIGRATION_PATH = 'supabase/migrations/site_visits.sql'

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

type Read<T> = { rows: T[]; missing: boolean; failed: boolean; truncated: boolean }

async function readAll<T>(table: string, columns: string, since: string): Promise<Read<T>> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await serviceSupabase
      .from(table)
      .select(columns)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      if (isMissingTableError(error)) return { rows: [], missing: true, failed: false, truncated: false }
      console.error(`admin/traffic-sources: read ${table} failed:`, error.message)
      return { rows: [], missing: false, failed: true, truncated: false }
    }
    rows.push(...((data as unknown as T[]) || []))
    if (!data || data.length < PAGE) break
    if (rows.length >= MAX_ROWS) return { rows, missing: false, failed: false, truncated: true }
  }
  return { rows, missing: false, failed: false, truncated: false }
}

export type TrafficResponse = TrafficSources & {
  visitsMissing: boolean
  signupsMissing: boolean
  failed: boolean
  truncated: boolean
  migration: string
}

export async function handleTrafficSources(req: NextRequest): Promise<Response> {
  const auth = await requireAdmin(req)
  if ('error' in auth) return json({ error: auth.error }, auth.status)

  const now = Date.now()
  const since = new Date(periodStart(TRAFFIC_WINDOWS[TRAFFIC_WINDOWS.length - 1], now)).toISOString()
  const [visits, signups] = await Promise.all([
    readAll<VisitDbRow>('site_visits', 'created_at, source_class, utm_source, utm_campaign', since),
    readAll<SignupSourceDbRow>('signup_sources', 'created_at, source_class', since),
  ])

  const body: TrafficResponse = {
    ...aggregateTraffic(visits.rows, signups.rows, now),
    visitsMissing: visits.missing,
    signupsMissing: signups.missing,
    failed: visits.failed || signups.failed,
    truncated: visits.truncated || signups.truncated,
    migration: TRAFFIC_MIGRATION_PATH,
  }
  return json(body)
}
