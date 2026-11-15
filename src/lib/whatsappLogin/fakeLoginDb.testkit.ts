// Мини-фейк базы для тестов входа через WhatsApp: таблицы в памяти, цепочки insert/update/select
// с eq/gt/neq/maybeSingle и уникальными колонками. Не часть приложения.
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, any>
const UNIQUE: Record<string, string[]> = {
  whatsapp_login_codes: ['code_hash', 'token_hash'],
  whatsapp_identities: ['wa_id', 'user_id'],
  tool_kontragent_checks: ['key'],
}

// Значения по умолчанию колонок, как в whatsapp_login.sql.
const DEFAULTS: Record<string, Row> = { whatsapp_login_codes: { status: 'pending', purpose: 'login', confirm_attempts: 0 }, email_claim_codes: { attempts: 0 } }

export function makeLoginDb(initial: Record<string, Row[]> = {}, rpcs: Record<string, (args: any) => any> = {}) {
  const tables: Record<string, Row[]> = initial
  const client = {
    rpc(name: string, args: any) {
      const fn = rpcs[name]
      return Promise.resolve(fn ? { data: fn(args), error: null } : { data: null, error: { message: `no rpc ${name}` } })
    },
    from(table: string) {
      const rows = (tables[table] ||= [])
      let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
      let payload: Row = {}
      const filters: Array<(r: Row) => boolean> = []
      let countOnly = false
      const run = (mode: 'many' | 'one') => {
        if (op === 'insert') {
          for (const col of UNIQUE[table] || []) {
            if (payload[col] != null && rows.some(r => r[col] === payload[col])) return { data: null, error: { code: '23505', message: `duplicate ${col}` } }
          }
          rows.push({ ...(DEFAULTS[table] || {}), ...payload })
          return { data: null, error: null }
        }
        const hit = rows.filter(r => filters.every(f => f(r)))
        if (countOnly) return { data: null, count: hit.length, error: null }
        if (op === 'update') for (const r of hit) Object.assign(r, payload)
        if (op === 'delete') { for (const r of hit) rows.splice(rows.indexOf(r), 1); return { data: null, error: null } }
        const out = hit.map(r => ({ ...r }))
        return { data: mode === 'many' ? out : (out[0] ?? null), error: null }
      }
      const b: any = {
        select(_cols?: string, opts?: { head?: boolean; count?: string }) { if (opts?.head) countOnly = true; return b },
        is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return b },
        order() { return b },
        limit() { return b },
        update(p: Row) { op = 'update'; payload = p; return b },
        insert(p: Row) { op = 'insert'; payload = p; return b },
        delete() { op = 'delete'; return b },
        eq(c: string, v: any) { filters.push(r => r[c] === v); return b },
        gt(c: string, v: any) { filters.push(r => r[c] != null && r[c] > v); return b },
        neq(c: string, v: any) { filters.push(r => r[c] !== v); return b },
        maybeSingle: () => Promise.resolve(run('one')),
        single: () => Promise.resolve(run('one')),
        then: (res: any, rej: any) => Promise.resolve(run('many')).then(res, rej),
      }
      return b
    },
  } as unknown as SupabaseClient
  return { client, tables }
}

/** Фейк admin API: createUser заводит пользователя и профиль (как триггер), generateLink отдаёт ссылку. */
export function makeFakeAdmin(tables: Record<string, Row[]>) {
  const users: Array<{ id: string; email: string; user_metadata: Row }> = []
  const log = { deleted: [] as string[], links: [] as string[] }
  const admin = {
    async createUser(attrs: Row) {
      if (users.some(u => u.email === attrs.email)) return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }
      const id = `user-${users.length + 1}`
      users.push({ id, email: attrs.email, user_metadata: attrs.user_metadata })
      ;(tables.profiles ||= []).push({ id, email: attrs.email })
      return { data: { user: { id } }, error: null }
    },
    async getUserById(id: string) {
      const u = users.find(x => x.id === id)
      return { data: { user: u ? { email: u.email } : null }, error: null }
    },
    async updateUserById(id: string, attrs: Row) {
      const u = users.find(x => x.id === id)
      if (u && attrs.email) u.email = attrs.email
      return { error: null }
    },
    async deleteUser(id: string) { log.deleted.push(id); const i = users.findIndex(x => x.id === id); if (i >= 0) users.splice(i, 1); return { error: null } },
    async generateLink(params: Row) {
      const url = `https://supabase.test/auth/v1/verify?type=${params.type}&email=${encodeURIComponent(params.email)}&redirect_to=${encodeURIComponent(params.options?.redirectTo)}`
      log.links.push(url)
      return { data: { properties: { action_link: url } }, error: null }
    },
  }
  return { admin, users, log }
}
