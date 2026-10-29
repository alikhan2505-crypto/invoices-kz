import { beforeEach, describe, expect, it, vi } from 'vitest'

// Состояние карточки «Готовность к счёту»: ответ не изменился после того, как
// чтения базы пошли параллельно (замер 29.10.2026: статус отвечал 2-5 с из-за
// цепочки последовательных запросов к базе в другом полушарии).

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: { code?: string; message?: string } | null }>,
  started: [] as string[],
  settled: [] as string[],
  delayMs: 0,
  startedAtFirstSettle: null as string[] | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      h.started.push(table)
      const result = () => new Promise(resolve => setTimeout(() => {
        if (!h.settled.length) h.startedAtFirstSettle = [...h.started]
        h.settled.push(table)
        resolve(h.tables[table] ?? { data: null, error: null })
      }, h.delayMs))
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'limit']) chain[m] = () => chain
      chain.maybeSingle = () => result()
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej)
      return chain
    },
  }),
}))
vi.mock('@/lib/binLookupServer', () => ({ performBinLookup: vi.fn() }))

import { getProfileBonusStatus } from './profileBonusServer'

const GOOD_BIN = '040340001997'
const profile = (over: Row = {}) => ({ is_admin: false, deleted_at: null, bin_iin: GOOD_BIN, company_name: 'ТОО Тест', signature_url: null, stamp_url: null, ...over })

beforeEach(() => {
  h.started = []; h.settled = []; h.delayMs = 0; h.startedAtFirstSettle = null
  h.tables = {
    profiles: { data: profile(), error: null },
    profile_bonus_grants: { data: [], error: null },
    bank_accounts: { data: [], error: null },
  }
})

describe('getProfileBonusStatus', () => {
  it('профиль, полученные бонусы и счета читаются одним заходом, а не по очереди', async () => {
    h.delayMs = 5
    await getProfileBonusStatus('u1')
    // К моменту, когда вернулся первый ответ базы, все три чтения уже ушли.
    expect([...(h.startedAtFirstSettle ?? [])].sort()).toEqual(['bank_accounts', 'profile_bonus_grants', 'profiles'])
    expect(h.settled.length).toBeGreaterThanOrEqual(3)
  })

  it('пустой профиль: реквизиты и банк просят заполнить, подпись отсутствует', async () => {
    h.tables.profiles.data = profile({ bin_iin: null, company_name: null })
    const r = await getProfileBonusStatus('u1')
    expect(r.available).toBe(true)
    expect(r.blocks.requisites).toEqual({ state: 'missing', reason: 'bin_missing' })
    expect(r.blocks.bank).toEqual({ state: 'missing', reason: 'bank_missing' })
    expect(r.blocks.signature).toEqual({ state: 'missing', reason: 'signature_missing' })
  })

  it('всё уже получено: три claimed, лишних запросов по (block, bin) нет', async () => {
    h.tables.profile_bonus_grants.data = [{ block: 'requisites' }, { block: 'bank' }, { block: 'signature' }]
    const r = await getProfileBonusStatus('u1')
    expect(r.blocks).toEqual({ requisites: { state: 'claimed' }, bank: { state: 'claimed' }, signature: { state: 'claimed' } })
    expect(h.started.filter(t => t === 'profile_bonus_grants')).toHaveLength(1)
  })

  it('реквизиты заполнены, а этот БИН уже получил бонус на другом аккаунте', async () => {
    // Второй запрос к profile_bonus_grants (по block+bin) отвечает чужой строкой.
    let calls = 0
    Object.defineProperty(h.tables, 'profile_bonus_grants', {
      configurable: true,
      get() { calls++; return calls === 1 ? { data: [], error: null } : { data: [{ user_id: 'other' }], error: null } },
    })
    const r = await getProfileBonusStatus('u1')
    expect(r.blocks.requisites).toEqual({ state: 'missing', reason: 'bin_already_rewarded' })
  })

  it('админ и удалённый аккаунт: карточки нет', async () => {
    h.tables.profiles.data = profile({ is_admin: true })
    expect((await getProfileBonusStatus('u1')).available).toBe(false)
    h.tables.profiles.data = profile({ deleted_at: '2026-01-01' })
    expect((await getProfileBonusStatus('u1')).available).toBe(false)
  })

  it('миграция не применена (нет таблицы грантов): карточки нет', async () => {
    h.tables.profile_bonus_grants = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    expect((await getProfileBonusStatus('u1')).available).toBe(false)
  })

  it('ошибка чтения счетов при непогашенном банковском бонусе даёт ошибку, а не молчаливое «нет счёта»', async () => {
    h.tables.bank_accounts = { data: null, error: { message: 'boom' } }
    await expect(getProfileBonusStatus('u1')).rejects.toThrow('bank accounts read failed')
  })

  it('ошибка чтения счетов не мешает, если банковый бонус уже получен', async () => {
    h.tables.profile_bonus_grants.data = [{ block: 'bank' }]
    h.tables.bank_accounts = { data: null, error: { message: 'boom' } }
    const r = await getProfileBonusStatus('u1')
    expect(r.blocks.bank).toEqual({ state: 'claimed' })
  })
})
