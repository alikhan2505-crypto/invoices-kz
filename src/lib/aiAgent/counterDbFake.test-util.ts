import type { SupabaseClient } from '@supabase/supabase-js'

// In-memory stand-in for the supabase-js query builder, just enough for the
// tool_kontragent_checks counter helpers (select/update/insert/delete with
// eq/like/lt) plus a hook for any other table. Shared by the widgetLimiter
// and the two message-route tests.

export interface CounterRow { key: string; day: string; count: number }
type Q = { table: string; op: 'select' | 'update' | 'insert' | 'delete'; payload: any; filters: Array<[string, string, any]>; head: boolean }
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null }

export interface FakeDb {
  client: SupabaseClient
  rows: Map<string, CounterRow>
  /** Ошибка для операций над счётчиком: сломать чтение/обновление/вставку. */
  fail: { read?: boolean; update?: boolean; insert?: boolean }
  /** Все запросы к НЕ счётчиковым таблицам (для проверок). */
  other: Q[]
  /** Обработчик прочих таблиц; по умолчанию пустой результат. */
  otherHandler: (q: Q, mode: string) => Result
}

const COUNTER = 'tool_kontragent_checks'

export function createCounterDbFake(): FakeDb {
  const db: FakeDb = {
    rows: new Map(),
    fail: {},
    other: [],
    otherHandler: () => ({ data: null, error: null }),
    client: null as unknown as SupabaseClient,
  }

  function matches(row: CounterRow, q: Q): boolean {
    return q.filters.every(([kind, col, val]) => {
      const v = (row as any)[col]
      if (kind === 'eq') return v === val
      if (kind === 'like') return typeof v === 'string' && new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(v)
      if (kind === 'lt') return v < val
      return true
    })
  }

  function runCounter(q: Q, mode: string): Result {
    if (q.op === 'select') {
      if (db.fail.read) return { data: null, error: { message: 'read failed' } }
      const hit = [...db.rows.values()].filter(r => matches(r, q))
      return mode === 'maybeSingle' ? { data: hit[0] ?? null, error: null } : { data: hit, error: null }
    }
    if (q.op === 'update') {
      if (db.fail.update) return { data: null, error: { message: 'update failed' } }
      const hit = [...db.rows.values()].filter(r => matches(r, q))
      for (const r of hit) Object.assign(r, q.payload)
      return { data: hit.map(r => ({ key: r.key })), error: null }
    }
    if (q.op === 'insert') {
      if (db.fail.insert) return { data: null, error: { message: 'insert failed' } }
      if (db.rows.has(q.payload.key)) return { data: null, error: { message: 'duplicate', code: '23505' } }
      db.rows.set(q.payload.key, { key: q.payload.key, day: q.payload.day, count: q.payload.count })
      return { data: null, error: null }
    }
    for (const r of [...db.rows.values()]) if (matches(r, q)) db.rows.delete(r.key)
    return { data: null, error: null }
  }

  db.client = {
    from(table: string) {
      const q: Q = { table, op: 'select', payload: null, filters: [], head: false }
      const run = (mode: string) => {
        if (table === COUNTER) return Promise.resolve(runCounter(q, mode))
        db.other.push({ ...q, filters: [...q.filters] })
        return Promise.resolve(db.otherHandler(q, mode))
      }
      const b: any = {
        select(_cols?: string, opts?: { head?: boolean }) { q.head = !!opts?.head; return b },
        insert(p: any) { q.op = 'insert'; q.payload = p; return b },
        update(p: any) { q.op = 'update'; q.payload = p; return b },
        delete() { q.op = 'delete'; return b },
        eq(c: string, v: any) { q.filters.push(['eq', c, v]); return b },
        gte(c: string, v: any) { q.filters.push(['gte', c, v]); return b },
        like(c: string, v: any) { q.filters.push(['like', c, v]); return b },
        lt(c: string, v: any) { q.filters.push(['lt', c, v]); return b },
        single: () => run('single'),
        maybeSingle: () => run('maybeSingle'),
        then: (res: any, rej: any) => run('await').then(res, rej),
      }
      return b
    },
  } as unknown as SupabaseClient
  return db
}
