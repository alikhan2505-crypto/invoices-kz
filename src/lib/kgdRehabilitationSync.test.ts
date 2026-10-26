import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncRehabilitation, MIN_REHAB_ROWS, MIN_TERMINATED_ROWS } from './kgdRehabilitationSync'

// Крон-выгрузка: защита от пустой и сломанной выгрузки, порядок upsert -> delete,
// блокировка массового удаления, сухой прогон. База и КГД подменены.

const item = (id: string) => ({
  debtorData: { identifier: id, debtorNameRu: 'ТОО Тест', regionRu: 'город Астана', procedureType: 'REHABILITATION' },
  entryForceDate: '07.06.2024',
})
const termItem = (id: string) => ({
  debtorData: { identifier: id, debtorNameRu: 'ТОО Тест', regionRu: 'город Астана', procedureType: 'REHABILITATION' },
  courtDecision: { status: 'PROCEDURE_TERMINATED', entryForceDate: '2024-08-21T19:00:00Z' },
})
const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(100000000000 + from + i))
const rehabPayload = (n: number) => ({ response: ids(0, n).map(item) })
const termPayload = (n: number) => ({ response: ids(5000, n).map(termItem) })

interface Opts {
  probeError?: { code?: string; message?: string } | null
  total?: number | null
  stale?: number | null
  upsertError?: { message: string } | null
  deleteError?: { message: string } | null
}
function fakeDb(o: Opts = {}) {
  const calls = { upsert: [] as unknown[][], delete: 0, lt: [] as string[] }
  const count = (n: number | null | undefined, error: unknown = null) => ({ count: n ?? null, error })
  const db = {
    from: () => ({
      select: (_c: string, _o?: unknown) => {
        const base = Promise.resolve(o.probeError ? { count: null, error: o.probeError } : count(o.total ?? 400))
        return Object.assign(base, {
          lt: (_col: string, v: string) => { calls.lt.push(v); return Promise.resolve(count(o.stale === undefined ? 0 : o.stale)) },
        })
      },
      upsert: async (rows: unknown[]) => { calls.upsert.push(rows); return { error: o.upsertError ?? null } },
      delete: () => ({ lt: async () => { calls.delete += 1; return { error: o.deleteError ?? null } } }),
    }),
  }
  return { db: db as never, calls }
}

const fetchList = (all: unknown, term: unknown) => vi.fn(async (kind: 'all' | 'terminated') => (kind === 'all' ? all : term))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('syncRehabilitation', () => {
  it('table missing: no request to KGD at all, no writes', async () => {
    const { db, calls } = fakeDb({ probeError: { code: '42P01' } })
    const f = fetchList(rehabPayload(100), termPayload(10))
    const r = await syncRehabilitation(db, { fetchList: f })
    expect(r).toMatchObject({ ok: false, reason: 'table_missing' })
    expect(f).not.toHaveBeenCalled()
    expect(calls.upsert).toHaveLength(0)
  })

  it('happy path: upserts every merged row with one stamp, then deletes the stale ones', async () => {
    const { db, calls } = fakeDb({ total: 400, stale: 3 })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)), now: () => new Date('2026-10-26T02:00:00Z') })
    expect(r).toMatchObject({ ok: true, rehabilitation: 300, terminated: 20, merged: 320, upserted: 320, deleted: 3 })
    const rows = calls.upsert.flat() as { fetched_at: string; identifier: string; kind: string }[]
    expect(rows).toHaveLength(320)
    expect(new Set(rows.map(x => x.fetched_at))).toEqual(new Set(['2026-10-26T02:00:00.000Z']))
    expect(rows.filter(x => x.kind === 'terminated')).toHaveLength(20)
    expect(calls.delete).toBe(1)
    expect(calls.lt).toEqual(['2026-10-26T02:00:00.000Z'])
  })

  it('an empty export writes nothing and deletes nothing', async () => {
    const { db, calls } = fakeDb({ total: 400, stale: 400 })
    const r = await syncRehabilitation(db, { fetchList: fetchList({ response: [] }, termPayload(20)) })
    expect(r).toMatchObject({ ok: false, reason: 'rehabilitation_list_too_small' })
    expect(calls.upsert).toHaveLength(0)
    expect(calls.delete).toBe(0)
  })

  it('a suspiciously short rehabilitation list is refused', async () => {
    const { db, calls } = fakeDb()
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(MIN_REHAB_ROWS - 1), termPayload(20)) })
    expect(r).toMatchObject({ ok: false, reason: 'rehabilitation_list_too_small' })
    expect(calls.upsert).toHaveLength(0)
  })

  it('an empty terminated list is refused too: otherwise terminated companies would flip back to listed', async () => {
    const { db, calls } = fakeDb()
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(MIN_TERMINATED_ROWS - 1)) })
    expect(r).toMatchObject({ ok: false, reason: 'terminated_list_too_small' })
    expect(calls.upsert).toHaveLength(0)
  })

  it('an unexpected response shape writes nothing', async () => {
    const { db, calls } = fakeDb()
    expect(await syncRehabilitation(db, { fetchList: fetchList({ error: 'maintenance' }, termPayload(20)) }))
      .toMatchObject({ ok: false, reason: 'unexpected_shape' })
    expect(await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), '<html>') }))
      .toMatchObject({ ok: false, reason: 'unexpected_shape' })
    expect(calls.upsert).toHaveLength(0)
    expect(calls.delete).toBe(0)
  })

  it('a KGD failure (timeout, 5xx) writes nothing', async () => {
    const { db, calls } = fakeDb()
    const f = vi.fn(async () => { throw new Error('КГД ответил 504') })
    expect(await syncRehabilitation(db, { fetchList: f })).toMatchObject({ ok: false, reason: 'fetch_failed' })
    expect(calls.upsert).toHaveLength(0)
  })

  it('an upsert failure stops before any delete', async () => {
    const { db, calls } = fakeDb({ upsertError: { message: 'boom' }, stale: 3 })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)) })
    expect(r).toMatchObject({ ok: false, reason: 'upsert_failed' })
    expect(calls.delete).toBe(0)
  })

  it('blocks deleting more than half of a real-sized table', async () => {
    const { db, calls } = fakeDb({ total: 400, stale: 300 })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)) })
    expect(r).toMatchObject({ ok: true, deleted: 0, deleteSkipped: 'too_many_stale' })
    expect(calls.delete).toBe(0)
  })

  it('when the stale count cannot be read, nothing is deleted', async () => {
    const { db, calls } = fakeDb({ total: 400, stale: null })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)) })
    expect(r).toMatchObject({ ok: true, deleted: 0, deleteSkipped: 'count_failed' })
    expect(calls.delete).toBe(0)
  })

  it('nothing stale: no delete call', async () => {
    const { db, calls } = fakeDb({ total: 320, stale: 0 })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)) })
    expect(r).toMatchObject({ ok: true, deleted: 0 })
    expect(calls.delete).toBe(0)
  })

  it('dry run fetches, parses and merges but writes nothing', async () => {
    const { db, calls } = fakeDb({ total: 400, stale: 3 })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)), dry: true })
    expect(r).toMatchObject({ ok: true, dry: true, merged: 320 })
    expect(calls.upsert).toHaveLength(0)
    expect(calls.delete).toBe(0)
  })

  it('the result carries only numbers and codes: no identifiers or names', async () => {
    const { db } = fakeDb({ total: 400, stale: 3 })
    const r = await syncRehabilitation(db, { fetchList: fetchList(rehabPayload(300), termPayload(20)) })
    const s = JSON.stringify(r)
    expect(s).not.toContain('ТОО')
    expect(s).not.toContain('1000000')
  })
})
