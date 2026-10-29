// Фейк supabase-клиента для тестов слежения за БИН: таблицы в памяти и ровно те
// цепочки, которые используют service.ts и run.ts (select/insert/update/delete +
// eq/in/or/not/order/limit/maybeSingle/single, count head). Не часть приложения.

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, any>

export interface FakeWatchDb {
  client: SupabaseClient
  tables: Record<string, Row[]>
  /** Журнал: сколько update/insert/delete сделано по таблицам. */
  writes: Array<{ table: string; op: 'insert' | 'update' | 'delete'; row?: Row }>
  /** Таблица, запросы к которой возвращают ошибку «таблицы нет». */
  missing: Set<string>
  /** После какой по счёту вставки в таблицу эмулировать гонку (кто-то вставил ещё строку). */
  onInsert?: (table: string, row: Row) => void
}

const UNIQUE: Record<string, string[]> = {
  bin_watch: ['user_id', 'bin'],
  bin_watch_mail_log: ['user_id', 'day'],
}

export function makeFakeWatchDb(initial: Record<string, Row[]> = {}): FakeWatchDb {
  const db: FakeWatchDb = { client: null as any, tables: initial, writes: [], missing: new Set() }

  const matchOr = (row: Row, expr: string): boolean =>
    expr.split(/,(?=[a-z_]+\.(?:is|lt|gt|eq)\.)/).some(part => {
      const m = /^([a-z_]+)\.(is|lt|gt|eq)\.(.*)$/.exec(part)
      if (!m) return false
      const [, col, op, val] = m
      const v = row[col]
      if (op === 'is') return val === 'null' ? v === null || v === undefined : String(v) === val
      if (op === 'eq') return String(v) === val
      if (v === null || v === undefined) return false
      return op === 'lt' ? String(v) < val : String(v) > val
    })

  db.client = {
    from(table: string) {
      const rows = (db.tables[table] ||= [])
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let payload: Row = {}
      let head = false
      let wantCount = false
      let orderBy: { col: string; asc: boolean; nullsFirst: boolean } | null = null
      let max = Infinity
      const filters: Array<(r: Row) => boolean> = []

      const exec = (mode: 'many' | 'maybeSingle' | 'single') => {
        if (db.missing.has(table)) {
          return { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` }, count: null }
        }
        if (op === 'insert') {
          const keys = UNIQUE[table]
          if (keys && rows.some(r => keys.every(k => r[k] === payload[k]))) {
            return { data: null, error: { code: '23505', message: 'duplicate key' }, count: null }
          }
          const row: Row = table === 'bin_watch'
            ? { id: randomUUID(), name: null, baseline: null, last_result: null, last_checked_at: null, last_attempt_at: null, last_status: null, pending_changes: [], created_at: new Date().toISOString(), ...payload }
            : { ...payload }
          rows.push(row)
          db.writes.push({ table, op: 'insert', row: { ...row } })
          db.onInsert?.(table, row)
          return { data: mode === 'many' ? [{ ...row }] : { ...row }, error: null, count: null }
        }
        let hit = rows.filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          for (const r of hit) Object.assign(r, payload)
          db.writes.push({ table, op: 'update', row: { ...payload } })
        } else if (op === 'delete') {
          for (const r of hit) rows.splice(rows.indexOf(r), 1)
          db.writes.push({ table, op: 'delete' })
        }
        if (orderBy) {
          const { col, asc, nullsFirst } = orderBy
          hit = [...hit].sort((a, b) => {
            const av = a[col], bv = b[col]
            if (av == null && bv == null) return 0
            if (av == null) return nullsFirst ? -1 : 1
            if (bv == null) return nullsFirst ? 1 : -1
            return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1)
          })
        }
        const out = hit.slice(0, max).map(r => ({ ...r }))
        const count = wantCount ? hit.length : null
        if (head) return { data: null, error: null, count }
        if (mode === 'many') return { data: out, error: null, count }
        return { data: out[0] ?? null, error: null, count }
      }

      const b: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          if (op === 'select') op = 'select'
          if (opts?.count) wantCount = true
          if (opts?.head) head = true
          return b
        },
        insert(p: Row) { op = 'insert'; payload = p; return b },
        update(p: Row) { op = 'update'; payload = p; return b },
        delete() { op = 'delete'; return b },
        eq(col: string, v: any) { filters.push(r => r[col] === v); return b },
        in(col: string, vs: any[]) { filters.push(r => vs.includes(r[col])); return b },
        or(expr: string) { filters.push(r => matchOr(r, expr)); return b },
        not(col: string, opName: string, v: any) {
          if (opName === 'eq' && v === '{}') filters.push(r => Array.isArray(r[col]) && r[col].length > 0)
          else filters.push(r => r[col] !== v)
          return b
        },
        order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
          orderBy = { col, asc: o?.ascending !== false, nullsFirst: o?.nullsFirst === true }
          return b
        },
        limit(n: number) { max = n; return b },
        maybeSingle: () => Promise.resolve(exec('maybeSingle')),
        single: () => Promise.resolve(exec('single')),
        then: (res: any, rej: any) => Promise.resolve(exec('many')).then(res, rej),
      }
      return b
    },
  } as unknown as SupabaseClient

  return db
}
