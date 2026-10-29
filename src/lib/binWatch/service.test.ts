import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeWatchDb } from './fakeSupabase.testkit'

const h = vi.hoisted(() => ({ load: 0, counters: new Map<string, number>() }))
vi.mock('@/lib/toolQuota', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/toolQuota')>()
  return {
    ...real,
    registryLoadToday: async () => h.load,
    readCounter: async (_s: unknown, key: string) => ({ ok: true as const, used: h.counters.get(key) ?? 0 }),
    claimCounterSlot: async (_s: unknown, key: string, used: number) => {
      if ((h.counters.get(key) ?? 0) !== used) return 'raced' as const
      h.counters.set(key, used + 1)
      return 'claimed' as const
    },
  }
})

import { addWatch, claimAddLookupSlot, isMissingWatchTable, listWatch, removeWatch, takeFirstSnapshot } from './service'

const BIN = '123456789012'
const BIN2 = '210987654321'
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

beforeEach(() => { h.load = 0; h.counters.clear() })

describe('addWatch: лимит тарифа', () => {
  it('добавляет, пока есть место, и отказывает на границе', async () => {
    const db = makeFakeWatchDb()
    for (let i = 0; i < 5; i++) {
      const r = await addWatch(db.client, U1, String(100000000000 + i), 5)
      expect(r).toMatchObject({ ok: true, status: 'added' })
    }
    const sixth = await addWatch(db.client, U1, '100000000099', 5)
    expect(sixth).toMatchObject({ ok: false, reason: 'limit', limit: 5, count: 5 })
    expect(db.tables.bin_watch).toHaveLength(5)
  })

  it('Про: тот же код, больший лимит', async () => {
    const db = makeFakeWatchDb()
    for (let i = 0; i < 6; i++) expect((await addWatch(db.client, U1, String(100000000000 + i), 50)).ok).toBe(true)
  })

  it('повторное добавление того же БИН не тратит лимит и не меняет строку', async () => {
    const db = makeFakeWatchDb()
    for (let i = 0; i < 4; i++) await addWatch(db.client, U1, String(100000000000 + i), 5)
    const first = await addWatch(db.client, U1, BIN, 5)
    expect(first).toMatchObject({ ok: true, status: 'added', count: 5 })
    const again = await addWatch(db.client, U1, BIN, 5)
    expect(again).toMatchObject({ ok: true, status: 'already' })
    expect(db.tables.bin_watch).toHaveLength(5)
  })

  it('на полном списке повтор существующего БИН - «уже есть», а не «лимит»', async () => {
    const db = makeFakeWatchDb()
    for (let i = 0; i < 5; i++) await addWatch(db.client, U1, String(100000000000 + i), 5)
    expect(await addWatch(db.client, U1, '100000000003', 5)).toMatchObject({ ok: true, status: 'already' })
  })

  it('лимиты пользователей независимы', async () => {
    const db = makeFakeWatchDb()
    for (let i = 0; i < 5; i++) await addWatch(db.client, U1, String(100000000000 + i), 5)
    expect((await addWatch(db.client, U2, BIN, 5)).ok).toBe(true)
  })

  it('БИН с пробелами нормализуется, мусор отклоняется до базы', async () => {
    const db = makeFakeWatchDb()
    expect(await addWatch(db.client, U1, '1234 5678 9012', 5)).toMatchObject({ ok: true, status: 'added' })
    expect(db.tables.bin_watch[0].bin).toBe(BIN)
    expect(await addWatch(db.client, U1, '12345', 5)).toEqual({ ok: false, reason: 'invalid_bin' })
    expect(await addWatch(db.client, U1, 'abc', 5)).toEqual({ ok: false, reason: 'invalid_bin' })
  })

  it('гонка на границе: проигравшая вставка откатывается', async () => {
    const db = makeFakeWatchDb()
    for (let i = 0; i < 4; i++) await addWatch(db.client, U1, String(100000000000 + i), 5)
    // Пока наш запрос вставляет, параллельный уже вставил свою строку.
    db.onInsert = (table, row) => {
      if (table === 'bin_watch' && row.bin === BIN) {
        db.onInsert = undefined
        db.tables.bin_watch.push({ id: 'racer', user_id: U1, bin: BIN2, pending_changes: [] })
      }
    }
    const r = await addWatch(db.client, U1, BIN, 5)
    expect(r).toMatchObject({ ok: false, reason: 'limit' })
    expect(db.tables.bin_watch.some(x => x.bin === BIN)).toBe(false)
    expect(db.tables.bin_watch).toHaveLength(5)
  })

  it('миграция не применена: «не готово», а не падение', async () => {
    const db = makeFakeWatchDb()
    db.missing.add('bin_watch')
    expect(await addWatch(db.client, U1, BIN, 5)).toEqual({ ok: false, reason: 'not_ready' })
    expect(await listWatch(db.client, U1)).toEqual({ ok: false, reason: 'not_ready' })
  })
})

describe('чужие строки', () => {
  it('removeWatch удаляет только свою строку', async () => {
    const db = makeFakeWatchDb()
    await addWatch(db.client, U1, BIN, 5)
    const id = db.tables.bin_watch[0].id
    expect(await removeWatch(db.client, U2, id)).toBe('not_found')
    expect(db.tables.bin_watch).toHaveLength(1)
    expect(await removeWatch(db.client, U1, id)).toBe('removed')
    expect(db.tables.bin_watch).toHaveLength(0)
  })

  it('listWatch отдаёт только строки владельца', async () => {
    const db = makeFakeWatchDb()
    await addWatch(db.client, U1, BIN, 5)
    await addWatch(db.client, U2, BIN2, 5)
    const mine = await listWatch(db.client, U1)
    expect(mine.ok && mine.rows.map(r => r.bin)).toEqual([BIN])
  })
})

describe('isMissingWatchTable', () => {
  it('узнаёт отсутствие таблицы и не путает с другими ошибками', () => {
    expect(isMissingWatchTable({ code: '42P01' })).toBe(true)
    expect(isMissingWatchTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingWatchTable({ message: 'relation "public.bin_watch" does not exist' })).toBe(true)
    expect(isMissingWatchTable({ code: '23505', message: 'dup' })).toBe(false)
    expect(isMissingWatchTable(null)).toBe(false)
  })
})

describe('первый снимок при добавлении', () => {
  const found = { found: true as const, company: {
    bin: BIN, name: 'ТОО Тест', address: null, director: null, activity: null, status: 'Зарегистрирован',
    registeredAt: null, source: 'egov' as const, isVatPayer: true, vatRegisteredAt: null, isUnreliable: false,
    isLiquidating: false, totalArrear: 100, taxArrear: 100, unreliableCategories: [],
  } }

  it('сохраняет базу и результат, письма (ожидающих) нет даже при «плохих» признаках', async () => {
    const db = makeFakeWatchDb()
    await addWatch(db.client, U1, BIN, 5)
    const row = db.tables.bin_watch[0]
    const res = await takeFirstSnapshot(db.client, row as any, async () => found)
    expect(res).toBe('done')
    expect(db.tables.bin_watch[0].baseline).toMatchObject({ taxDebt: true })
    expect(db.tables.bin_watch[0].pending_changes).toEqual([])
    expect(db.tables.bin_watch[0].name).toBe('ТОО Тест')
  })

  it('реестры не ответили: строка остаётся без базы, попытка записана', async () => {
    const db = makeFakeWatchDb()
    await addWatch(db.client, U1, BIN, 5)
    const res = await takeFirstSnapshot(db.client, db.tables.bin_watch[0] as any, async () => ({ found: false, unavailable: true }))
    expect(res).toBe('failed')
    expect(db.tables.bin_watch[0].baseline).toBeNull()
    expect(db.tables.bin_watch[0].last_status).toBe('unavailable')
  })

  it('слот добавления исчерпан - реестры не трогаем', async () => {
    const db = makeFakeWatchDb()
    await addWatch(db.client, U1, BIN, 5)
    h.load = 1000
    const lookup = vi.fn()
    expect(await takeFirstSnapshot(db.client, db.tables.bin_watch[0] as any, lookup)).toBe('skipped')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('суточный потолок добавлений', async () => {
    const db = makeFakeWatchDb()
    let claimed = 0
    for (let i = 0; i < 100; i++) if (await claimAddLookupSlot(db.client)) claimed++
    expect(claimed).toBe(60)
  })

  it('запас под бесплатные инструменты: при высокой общей нагрузке слота нет', async () => {
    const db = makeFakeWatchDb()
    h.load = 200 // REGISTRY_DAILY_GLOBAL (300) минус запас (100)
    expect(await claimAddLookupSlot(db.client)).toBe(false)
    h.load = 199
    expect(await claimAddLookupSlot(db.client)).toBe(true)
  })
})

