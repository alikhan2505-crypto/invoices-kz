// Мини-фейк supabase-клиента для тестов лимитов: таблицы в памяти, цепочки
// select/update/insert + eq/is/maybeSingle/single. Достаточно для
// compare-and-swap счётчиков (windowLimits, cfo/askClaim). Не часть приложения.

import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, any>

export interface FakeDb {
  client: SupabaseClient
  tables: Record<string, Row[]>
  /** Сколько запросов к БД сделано (для проверки «не ходили в БД»). */
  calls: { count: number }
  /** Если задан — каждый запрос к этой таблице возвращает ошибку. */
  failTable?: string
}

export function makeFakeDb(initial: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = { client: null as any, tables: initial, calls: { count: 0 } }

  db.client = {
    from(table: string) {
      db.calls.count++
      const rows = (db.tables[table] ||= [])
      let op: 'select' | 'update' | 'insert' = 'select'
      let payload: Row = {}
      const filters: Array<(r: Row) => boolean> = []
      const matching = () => rows.filter(r => filters.every(f => f(r)))
      const failure = () => (db.failTable === table ? { message: 'boom', code: 'XX000' } : null)

      const run = (mode: 'many' | 'maybeSingle' | 'single') => {
        const err = failure()
        if (err) return { data: null, error: err }
        if (op === 'insert') {
          const key = payload.key
          if (key !== undefined && rows.some(r => r.key === key)) return { data: null, error: { message: 'dup', code: '23505' } }
          rows.push({ ...payload })
          return { data: null, error: null }
        }
        const hit = matching()
        if (op === 'update') for (const r of hit) Object.assign(r, payload)
        const out = hit.map(r => ({ ...r }))
        if (mode === 'many') return { data: out, error: null }
        return { data: out[0] ?? null, error: null }
      }

      const b: any = {
        select() { return b },
        update(p: Row) { op = 'update'; payload = p; return b },
        insert(p: Row) { op = 'insert'; payload = p; return b },
        eq(col: string, v: any) { filters.push(r => r[col] === v); return b },
        is(col: string, v: any) { filters.push(r => (r[col] ?? null) === v); return b },
        maybeSingle: () => Promise.resolve(run('maybeSingle')),
        single: () => Promise.resolve(run('single')),
        then: (res: any, rej: any) => Promise.resolve(run('many')).then(res, rej),
      }
      return b
    },
  } as unknown as SupabaseClient

  return db
}
