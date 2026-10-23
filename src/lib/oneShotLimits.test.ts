import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COUNTER_SENTINEL_DAY, claimDailySlot, claimOnce, notifyOnceKey, releaseDailySlot, sendInvoiceKey,
  SEND_INVOICE_KEY_PREFIX, NOTIFY_ONCE_KEY_PREFIX,
} from './oneShotLimits'
import { registryLoadToday } from './toolQuota'

type Row = { key: string; day: string; count: number }

// Мини-фейк таблицы tool_kontragent_checks: ровно те цепочки вызовов, что
// использует oneShotLimits (select/eq/maybeSingle, update/eq/eq/select, insert).
function fakeDb(opts: { failReads?: boolean; failWrites?: boolean; beforeUpdate?: (rows: Map<string, Row>) => void } = {}) {
  const rows = new Map<string, Row>()
  const client = {
    from() {
      return {
        select(cols: string) {
          const filters: Array<[string, unknown]> = []
          const q: any = {
            eq(c: string, v: unknown) { filters.push([c, v]); return q },
            not() { return q },
            maybeSingle: async () => {
              if (opts.failReads) return { data: null, error: { message: 'boom' } }
              const key = filters.find(f => f[0] === 'key')?.[1] as string
              const r = rows.get(key)
              return { data: r ? { count: r.count } : null, error: null }
            },
            then(res: (v: unknown) => unknown) {
              const day = filters.find(f => f[0] === 'day')?.[1]
              const data = [...rows.values()].filter(r => r.day === day).map(r => ({ count: r.count }))
              return Promise.resolve({ data, error: null }).then(res)
            },
          }
          void cols
          return q
        },
        update(patch: Partial<Row>) {
          const filters: Array<[string, unknown]> = []
          const q: any = {
            eq(c: string, v: unknown) { filters.push([c, v]); return q },
            select: async () => {
              if (opts.failWrites) return { data: null, error: { message: 'boom' } }
              opts.beforeUpdate?.(rows)
              const key = filters.find(f => f[0] === 'key')?.[1] as string
              const cnt = filters.find(f => f[0] === 'count')?.[1]
              const r = rows.get(key)
              if (r && r.count === cnt) { Object.assign(r, patch); return { data: [{ key }], error: null } }
              return { data: [], error: null }
            },
          }
          return q
        },
        insert: async (row: Row) => {
          if (opts.failWrites) return { error: { message: 'boom' } }
          if (rows.has(row.key)) return { error: { code: '23505', message: 'dup' } }
          rows.set(row.key, { ...row })
          return { error: null }
        },
      }
    },
  }
  return { rows, client: client as unknown as SupabaseClient }
}

describe('keys', () => {
  it('are namespaced, hashed and day-scoped for sends', () => {
    const a = sendInvoiceKey('invoice', 'abc', Date.parse('2026-10-20T10:00:00Z'))
    const b = sendInvoiceKey('invoice', 'abc', Date.parse('2026-10-21T10:00:00Z'))
    const u = sendInvoiceKey('user', 'abc', Date.parse('2026-10-20T10:00:00Z'))
    expect(a.startsWith(SEND_INVOICE_KEY_PREFIX)).toBe(true)
    expect(a).not.toContain('abc')
    expect(a).not.toBe(b)
    expect(a).not.toBe(u)
    // тот же день по Алматы (UTC+5) — тот же ключ
    expect(sendInvoiceKey('invoice', 'abc', Date.parse('2026-10-20T11:00:00Z'))).toBe(a)
  })
  it('one-shot keys differ by event and invoice and have no day', () => {
    expect(notifyOnceKey('viewed', 'i1')).not.toBe(notifyOnceKey('paid', 'i1'))
    expect(notifyOnceKey('paid', 'i1')).not.toBe(notifyOnceKey('paid', 'i2'))
    expect(notifyOnceKey('paid', 'i1').startsWith(NOTIFY_ONCE_KEY_PREFIX)).toBe(true)
  })
  it('contain a colon, so the weekly digest (bare keys only) ignores them', () => {
    expect(sendInvoiceKey('user', 'x')).toContain(':')
    expect(notifyOnceKey('paid', 'x')).toContain(':')
  })
})

describe('claimDailySlot', () => {
  it('allows exactly `limit` claims, then reports the limit', async () => {
    const { client } = fakeDb()
    for (let i = 1; i <= 3; i++) {
      expect(await claimDailySlot(client, 'k', 3)).toEqual({ ok: true, used: i })
    }
    expect(await claimDailySlot(client, 'k', 3)).toEqual({ ok: false, reason: 'limit' })
  })

  it('writes rows outside "today", so the registry load guard never counts them', async () => {
    const { client, rows } = fakeDb()
    await claimDailySlot(client, 'k', 5)
    expect(rows.get('k')!.day).toBe(COUNTER_SENTINEL_DAY)
    expect(await registryLoadToday(client)).toBe(0)
  })

  it('does not let parallel requests exceed the limit', async () => {
    const { client, rows } = fakeDb()
    const results = await Promise.all(Array.from({ length: 12 }, () => claimDailySlot(client, 'k', 5)))
    expect(results.filter(r => r.ok).length).toBeLessThanOrEqual(5)
    expect(rows.get('k')!.count).toBeLessThanOrEqual(5)
  })

  it('fails closed when the counter is unreadable or unwritable', async () => {
    expect(await claimDailySlot(fakeDb({ failReads: true }).client, 'k', 5)).toEqual({ ok: false, reason: 'error' })
    expect(await claimDailySlot(fakeDb({ failWrites: true }).client, 'k', 5)).toEqual({ ok: false, reason: 'error' })
  })

  it('stops with "limit" after repeated lost races instead of looping forever', async () => {
    const { client } = fakeDb({ beforeUpdate: rows => { const r = rows.get('k'); if (r) r.count += 1 } })
    // строка уже есть и каждый раз «уезжает» из-под нас
    await claimDailySlot(client, 'k', 100)
    const res = await claimDailySlot(client, 'k', 100)
    expect(res).toEqual({ ok: false, reason: 'limit' })
  })
})

describe('releaseDailySlot', () => {
  it('gives a slot back', async () => {
    const { client, rows } = fakeDb()
    await claimDailySlot(client, 'k', 2)
    await claimDailySlot(client, 'k', 2)
    expect(await claimDailySlot(client, 'k', 2)).toEqual({ ok: false, reason: 'limit' })
    await releaseDailySlot(client, 'k')
    expect(rows.get('k')!.count).toBe(1)
    expect(await claimDailySlot(client, 'k', 2)).toEqual({ ok: true, used: 2 })
  })
  it('never goes below zero and never throws', async () => {
    const { client, rows } = fakeDb()
    await releaseDailySlot(client, 'missing')
    await claimDailySlot(client, 'k', 2)
    await releaseDailySlot(client, 'k')
    await releaseDailySlot(client, 'k')
    expect(rows.get('k')!.count).toBe(0)
    await expect(releaseDailySlot(fakeDb({ failReads: true }).client, 'k')).resolves.toBeUndefined()
  })
})

describe('claimOnce', () => {
  it('is true exactly once per key', async () => {
    const { client } = fakeDb()
    const key = notifyOnceKey('viewed', 'inv-1')
    expect(await claimOnce(client, key)).toBe(true)
    expect(await claimOnce(client, key)).toBe(false)
    expect(await claimOnce(client, key)).toBe(false)
    expect(await claimOnce(client, notifyOnceKey('paid', 'inv-1'))).toBe(true)
  })
  it('lets exactly one of many parallel callers through', async () => {
    const { client } = fakeDb()
    const res = await Promise.all(Array.from({ length: 10 }, () => claimOnce(client, 'k')))
    expect(res.filter(Boolean).length).toBe(1)
  })
  it('is false (stay silent) when the counter is down', async () => {
    expect(await claimOnce(fakeDb({ failWrites: true }).client, 'k')).toBe(false)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    spy.mockRestore()
  })
})
