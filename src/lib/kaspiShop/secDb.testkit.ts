// Мини-фейк supabase-клиента для тестов безопасности и уведомлений Kaspi Bot:
// таблицы в памяти, select/update/insert/delete + eq/in/is/maybeSingle/single.
// В отличие от fakeDb.testkit умеет delete и ошибки по (таблица, операция).
// Не часть приложения.

type Row = Record<string, any>
type Op = 'select' | 'update' | 'insert' | 'delete' | 'upsert'

export interface SecDb {
  client: any
  tables: Record<string, Row[]>
  /** Журнал записей: { table, op, payload }. */
  writes: Array<{ table: string; op: Op; payload?: Row }>
  /** Запросы 'таблица' или 'таблица:операция' отвечают ошибкой. */
  fail: Set<string>
}

export function makeSecDb(initial: Record<string, Row[]> = {}): SecDb {
  const db: SecDb = { client: null, tables: initial, writes: [], fail: new Set() }
  db.client = {
    from(table: string) {
      const rows = (db.tables[table] ||= [])
      let op: Op = 'select'
      let payload: Row = {}
      const filters: Array<(r: Row) => boolean> = []
      const run = (mode: 'many' | 'maybeSingle' | 'single') => {
        if (db.fail.has(table) || db.fail.has(`${table}:${op}`)) return { data: null, error: { message: `${table} ${op} failed`, code: 'XX000' } }
        if (op === 'insert') {
          if (payload.key !== undefined && rows.some(r => r.key === payload.key)) return { data: null, error: { message: 'dup', code: '23505' } }
          rows.push({ ...payload })
          db.writes.push({ table, op, payload })
          return { data: null, error: null }
        }
        if (op === 'upsert') {
          const existing = rows.find(r => r.user_id === payload.user_id && r.merchant_id === payload.merchant_id)
          if (existing) Object.assign(existing, payload)
          else rows.push({ id: 'c' + (rows.length + 1), ...payload })
          db.writes.push({ table, op, payload })
          return { data: null, error: null }
        }
        const hit = rows.filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          for (const r of hit) Object.assign(r, payload)
          db.writes.push({ table, op, payload })
        }
        if (op === 'delete') {
          db.tables[table] = db.tables[table].filter(r => !hit.includes(r))
          db.writes.push({ table, op })
        }
        const out = hit.map(r => ({ ...r }))
        if (mode === 'many') return { data: out, error: null }
        return { data: out[0] ?? null, error: null }
      }
      const b: any = {
        select() { return b },
        update(p: Row) { op = 'update'; payload = p; return b },
        insert(p: Row) { op = 'insert'; payload = p; return b },
        delete() { op = 'delete'; return b },
        upsert(p: Row) { op = 'upsert'; payload = p; return b },
        eq(c: string, v: any) { filters.push(r => r[c] === v); return b },
        // Для маршрутов с «широкими» запросами (cron): диапазоны и or() не
        // фильтруют, not(col, 'is', null) работает.
        lt() { return b }, gte() { return b }, neq() { return b }, or() { return b }, order() { return b }, limit() { return b },
        not(c: string, _op: string, v: any) { filters.push(r => (r[c] ?? null) !== v); return b },
        in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return b },
        is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return b },
        maybeSingle: () => Promise.resolve(run('maybeSingle')),
        single: () => Promise.resolve(run('single')),
        then: (res: any, rej: any) => Promise.resolve(run('many')).then(res, rej),
      }
      return b
    },
  }
  return db
}
