// Мини-фейк supabase-клиента для тестов маршрутов /api/kaspi-shop/*: таблицы в
// памяти, цепочки select/update/insert/delete + eq/in/gte/maybeSingle/single и
// auth.getUser. Один общий экземпляр `db` на тестовый файл: тест наполняет
// db.tables и db.userId, а vi.mock('@supabase/supabase-js') отдаёт createFakeClient().
// Не часть приложения.

type Row = Record<string, any>

export const db = {
  tables: {} as Record<string, Row[]>,
  /** id пользователя, которого вернёт auth.getUser; null -- токен недействителен. */
  userId: 'u1' as string | null,
  /** Запросы к этим таблицам отвечают ошибкой. */
  failTables: new Set<string>(),
  /** Журнал записей: { table, op, payload, ids }. */
  writes: [] as Array<{ table: string; op: 'update' | 'insert' | 'delete'; payload?: Row; ids: unknown[] }>,
}

export function resetDb() {
  db.tables = {}
  db.userId = 'u1'
  db.failTables = new Set()
  db.writes = []
}

export function createFakeClient(): any {
  return {
    auth: {
      getUser: async () => (db.userId ? { data: { user: { id: db.userId } }, error: null } : { data: { user: null }, error: { message: 'bad token' } }),
    },
    from(table: string) {
      let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
      let payload: Row = {}
      const filters: Array<(r: Row) => boolean> = []
      const rows = () => (db.tables[table] ||= [])
      const run = (mode: 'many' | 'single' | 'maybeSingle') => {
        if (db.failTables.has(table)) return { data: null, error: { message: `${table} failed` } }
        if (op === 'insert') {
          rows().push({ ...payload })
          db.writes.push({ table, op, payload, ids: [] })
          return { data: null, error: null }
        }
        const hit = rows().filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          for (const r of hit) Object.assign(r, payload)
          db.writes.push({ table, op, payload, ids: hit.map(r => r.id) })
        }
        if (op === 'delete') {
          db.tables[table] = rows().filter(r => !hit.includes(r))
          db.writes.push({ table, op, ids: hit.map(r => r.id) })
        }
        const out = hit.map(r => ({ ...r }))
        if (mode === 'many') return { data: out, error: null }
        if (mode === 'single' && out.length === 0) return { data: null, error: { message: 'no rows' } }
        return { data: out[0] ?? null, error: null }
      }
      const b: any = {
        select() { return b },
        update(p: Row) { op = 'update'; payload = p; return b },
        insert(p: Row) { op = 'insert'; payload = p; return b },
        delete() { op = 'delete'; return b },
        eq(c: string, v: any) { filters.push(r => r[c] === v); return b },
        in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return b },
        gte(c: string, v: any) { filters.push(r => r[c] !== undefined && r[c] !== null && r[c] >= v); return b },
        order() { return b },
        maybeSingle: () => Promise.resolve(run('maybeSingle')),
        single: () => Promise.resolve(run('single')),
        then: (res: any, rej: any) => Promise.resolve(run('many')).then(res, rej),
      }
      return b
    },
  }
}
