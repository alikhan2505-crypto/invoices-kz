import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, serviceSupabase } from '@/lib/salonSites/adminAuth'
import { aggregateToolFunnel, parsePeriod, periodStart, type ToolEventDbRow } from './funnel'
import { VISITOR_ID_RE } from './schema'

// GET /api/admin/tool-funnel?days=7|30|90&internal=0|1 — только админ
// (общий requireAdmin, Bearer). Читает tool_events за период страницами по
// 1000 (потолок PostgREST) и сворачивает чистой aggregateToolFunnel.
// &self=<visitor> — id браузера, открывшего вкладку: его события считаются
// нашими, даже те, что были до первого открытия /admin.
// Читаем от новых к старым: если упёрлись в потолок строк, теряются самые
// старые дни периода, а не последние.
// Нет таблицы (миграцию ещё не применили) — { missingTable: true }.

const PAGE = 1000
const MAX_ROWS = 200_000

export const MIGRATION_PATH = 'supabase/migrations/tool_events.sql'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const m = (error.message || '').toLowerCase()
  return m.includes('tool_events') && (m.includes('does not exist') || m.includes('schema cache'))
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function handleToolFunnel(req: NextRequest): Promise<Response> {
  const auth = await requireAdmin(req)
  if ('error' in auth) return json({ error: auth.error }, auth.status)

  const url = new URL(req.url)
  const days = parsePeriod(url.searchParams.get('days'))
  const includeInternal = url.searchParams.get('internal') === '1'
  const self = url.searchParams.get('self')
  const selfVisitors = self && VISITOR_ID_RE.test(self) ? [self] : []
  const now = Date.now()
  const since = new Date(periodStart(days, now)).toISOString()

  const rows: ToolEventDbRow[] = []
  let truncated = false
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await serviceSupabase
      .from('tool_events')
      .select('created_at, event, tool, visitor, user_id, internal, medium, utm_source, utm_medium, utm_campaign')
      .gte('created_at', since)
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      if (isMissingTable(error)) return json({ missingTable: true, migration: MIGRATION_PATH })
      console.error('admin/tool-funnel: read failed:', error.message)
      return json({ error: 'read_failed' }, 500)
    }
    rows.push(...((data as ToolEventDbRow[]) || []))
    if (!data || data.length < PAGE) break
    if (rows.length >= MAX_ROWS) { truncated = true; break }
  }

  return json({ ...aggregateToolFunnel(rows, { days, includeInternal, now, selfVisitors }), truncated })
}
