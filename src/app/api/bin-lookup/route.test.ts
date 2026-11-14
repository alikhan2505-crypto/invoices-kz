import { describe, it, expect, vi, beforeEach } from 'vitest'

// Потолок на аккаунт у /api/bin-lookup (аудит 14.11.2026): вошедший бот не должен
// выжигать квоту реестров. База, реестры и счётчики подменены.
const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  lookup: vi.fn(),
  claim: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/binLookupServer', () => ({ performBinLookup: h.lookup }))
vi.mock('@/lib/windowLimits', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/windowLimits')>()),
  claimWindowSlot: h.claim,
}))

import { NextRequest } from 'next/server'
import { GET } from './route'

const company = { bin: '123456789012', name: 'ТОО Ромашка', source: 'egov' as const }
const get = (bin = '123456789012', auth = true) =>
  GET(new NextRequest(`http://localhost/api/bin-lookup?bin=${bin}`, { headers: auth ? { authorization: 'Bearer t' } : {} }))

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'u1' }
  h.claim.mockResolvedValue({ ok: true, used: 1 })
  h.lookup.mockResolvedValue({ found: true, company })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/bin-lookup', () => {
  it('an anonymous caller gets 401 and spends nothing', async () => {
    h.user = null
    expect((await get('123456789012', false)).status).toBe(401)
    expect(h.claim).not.toHaveBeenCalled()
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('a bad BIN is a 400 that does not spend a slot', async () => {
    expect((await get('123')).status).toBe(400)
    expect(h.claim).not.toHaveBeenCalled()
  })

  it('a normal lookup takes an hourly and a daily slot and answers', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).found).toBe(true)
    expect(h.claim).toHaveBeenCalledTimes(2)
  })

  it('past the hourly ceiling: 429 and the registries are not asked', async () => {
    h.claim.mockResolvedValueOnce({ ok: false, reason: 'limit' })
    const res = await get()
    expect(res.status).toBe(429)
    expect(h.lookup).not.toHaveBeenCalled()
    // Часовой потолок исчерпан, суточный слот не занимаем зря.
    expect(h.claim).toHaveBeenCalledTimes(1)
  })

  it('past the daily ceiling: 429 and the registries are not asked', async () => {
    h.claim.mockResolvedValueOnce({ ok: true, used: 5 }).mockResolvedValueOnce({ ok: false, reason: 'limit' })
    expect((await get()).status).toBe(429)
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('a broken counter does not break the lookup for a signed-in payer', async () => {
    h.claim.mockResolvedValue({ ok: false, reason: 'error' })
    expect((await get()).status).toBe(200)
    expect(h.lookup).toHaveBeenCalledTimes(1)
  })
})
