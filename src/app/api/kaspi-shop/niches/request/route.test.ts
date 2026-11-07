import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/kaspi-shop/niches/request: пока предыдущая проверка этого продавца идёт,
// вторую не запускаем; потолок запусков в час; сбой запуска не оставляет «вечный pending»
// и возвращает слот (аудит K42).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({
  balance: 100,
  created: [] as Array<{ query: string; userId: string }>,
  failed: [] as Array<{ id: string; message: string }>,
  nextId: 1,
}))

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeClient, db } = await import('@/lib/kaspiShop/routeDb.testkit')
  return {
    createClient: () => {
      const client = createFakeClient()
      const from = client.from.bind(client)
      // Первичный ключ счётчика: вторая вставка той же строки даёт 23505, как в Postgres
      // (фейк сам уникальность не проверяет, а на ней держится замок параллельных запросов).
      client.from = (table: string) => {
        const b = from(table)
        if (table !== 'tool_kontragent_checks') return b
        const insert = b.insert
        b.insert = (p: any) => {
          const ib = insert(p)
          const then = ib.then
          // Фейк выполняет запись в момент await, поэтому и уникальность проверяем там.
          ib.then = (res: any, rej: any) => (
            (db.tables[table] || []).some(r => r.key === p.key)
              ? Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }).then(res, rej)
              : then(res, rej)
          )
          return ib
        }
        return b
      }
      return client
    },
  }
})
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => null }))
vi.mock('@/lib/kaspiShop/wallet', () => ({
  KASPI_SHOP_CREDIT_PRICE_TENGE: 5,
  getKaspiShopWalletBalance: async () => h.balance,
}))
vi.mock('@/lib/kaspiShop/nicheChecks', async () => {
  const { db } = await import('@/lib/kaspiShop/routeDb.testkit')
  return {
    createNicheCheck: async (query: string, userId: string) => {
      const id = `chk-${h.nextId++}`
      h.created.push({ query, userId })
      ;(db.tables.kaspi_niche_checks ||= []).push({ id, user_id: userId, status: 'pending', created_at: new Date().toISOString() })
      return id
    },
    failNicheCheck: async (id: string, message: string) => {
      h.failed.push({ id, message })
      const row = (db.tables.kaspi_niche_checks || []).find(r => r.id === id)
      if (row) row.status = 'error'
    },
  }
})

import { db, resetDb } from '@/lib/kaspiShop/routeDb.testkit'
import { POST } from './route'

const fetchMock = vi.fn()
const call = (query = 'термокружка') => POST(new NextRequest('http://localhost/api/kaspi-shop/niches/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
  body: JSON.stringify({ query }),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T10:03:30Z'))
  resetDb()
  h.balance = 100
  h.created = []
  h.failed = []
  h.nextId = 1
  process.env.KASPI_SHOP_GITHUB_PAT = 'pat'
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 204 })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('POST /api/kaspi-shop/niches/request', () => {
  it('первая проверка уходит в GitHub', async () => {
    const res = await call()
    expect(res.status).toBe(202)
    expect((await res.json()).checkId).toBe('chk-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('пока прошлая проверка pending, вторая не запускается: «уже идёт» и id идущей, без нового запуска', async () => {
    await call('первая')
    fetchMock.mockClear()
    const res = await call('вторая')
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.alreadyRunning).toBe(true)
    expect(json.checkId).toBe('chk-1')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.created).toHaveLength(1)
  })

  it('чужая проверка продавцу не мешает', async () => {
    db.tables.kaspi_niche_checks = [{ id: 'other', user_id: 'someone-else', status: 'pending', created_at: new Date().toISOString() }]
    expect((await call()).status).toBe(202)
  })

  it('завершённая проверка не мешает следующей', async () => {
    await call('первая')
    db.tables.kaspi_niche_checks![0].status = 'done'
    expect((await call('вторая')).status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('зависшая pending старше 3 минут не блокирует навсегда', async () => {
    db.tables.kaspi_niche_checks = [{ id: 'stale', user_id: 'u1', status: 'pending', created_at: '2026-11-06T09:50:00.000Z' }]
    expect((await call()).status).toBe(202)
  })

  it('потолок запусков в час на продавца', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await call(`q${i}`)
      expect(res.status).toBe(202)
      db.tables.kaspi_niche_checks![db.tables.kaspi_niche_checks!.length - 1].status = 'done'
    }
    const over = await call('лишняя')
    expect(over.status).toBe(429)
    expect((await over.json()).alreadyRunning).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(30)
  })

  it('GitHub отказал: проверка закрыта ошибкой (не висит pending), слот возвращён, повторить можно сразу', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    const first = await call()
    expect(first.status).toBe(500)
    expect(h.failed).toHaveLength(1)
    const second = await call()
    expect(second.status).toBe(202)
  })

  it('нет денег на балансе: 402 и ничего не запускается', async () => {
    h.balance = 2
    const res = await call()
    expect(res.status).toBe(402)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('не удалось проверить прошлую проверку: 503, не запускаем вслепую', async () => {
    db.failTables.add('kaspi_niche_checks')
    const res = await call()
    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('пустой запрос это 400', async () => {
    expect((await call('   ')).status).toBe(400)
  })

  it('два параллельных запроса одного продавца: запускается одна проверка, вторая получает «уже идёт»', async () => {
    const [a, b] = await Promise.all([call('первая'), call('вторая')])
    expect([a.status, b.status].sort()).toEqual([202, 429])
    expect(h.created).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const loser = a.status === 429 ? a : b
    expect((await loser.json()).alreadyRunning).toBe(true)
  })

  it('замок снимается после запроса: сбой проверки pending его не оставляет', async () => {
    db.failTables.add('kaspi_niche_checks')
    expect((await call()).status).toBe(503)
    db.failTables.delete('kaspi_niche_checks')
    expect((await call()).status).toBe(202)
  })
})
