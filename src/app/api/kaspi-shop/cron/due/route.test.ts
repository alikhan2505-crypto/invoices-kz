import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET /api/kaspi-shop/cron/due: сбой выборки -- 500 (GitHub красный), а не
// пустой список с 200 (аудит Kaspi 06.11.2026, K8).
const h = vi.hoisted(() => ({ result: null as null | { due?: unknown[]; error?: string } }))

vi.mock('@/lib/kaspiShop/checkCycle', () => ({
  getDueTrackedProducts: async () => {
    if (h.result?.error) throw new Error(h.result.error)
    return h.result?.due ?? []
  },
}))

import { GET } from './route'

function call(secret: string | null = 'cron-secret') {
  return GET(new NextRequest('http://localhost/api/kaspi-shop/cron/due', { headers: secret ? { 'x-kaspi-shop-cron-secret': secret } : {} }))
}

beforeEach(() => {
  process.env.KASPI_SHOP_CRON_SECRET = 'cron-secret'
  h.result = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/kaspi-shop/cron/due', () => {
  it('401 without the secret', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('wrong')).status).toBe(401)
  })

  it('200 with the list', async () => {
    h.result = { due: [{ id: 'p1', kaspiSku: 's', kaspiMasterSku: 'm', targetCities: [] }] }
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).due).toHaveLength(1)
  })

  it('an empty list is still a 200 when the query really found nothing', async () => {
    h.result = { due: [] }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ due: [] })
  })

  it('a failing due query is a 500, not an empty 200', async () => {
    h.result = { error: 'due tracked products lookup failed: boom' }
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).due).toBeUndefined()
  })
})
