import { describe, it, expect, vi, beforeEach } from 'vitest'

// Роут публичной проверки контрагента: что видит клиент и когда списывается
// попытка из квартального лимита. Реестры и счётчик подменены.
const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  claimQuotaSlot: vi.fn(),
  releaseCounterSlot: vi.fn(),
  registryLoadToday: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/binLookupServer', () => ({ performBinLookup: h.lookup }))
vi.mock('@/lib/toolQuota', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/toolQuota')>()),
  claimQuotaSlot: h.claimQuotaSlot,
  releaseCounterSlot: h.releaseCounterSlot,
  registryLoadToday: h.registryLoadToday,
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

function req(bin: string) {
  return new NextRequest('http://localhost/api/tools/kontragent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '8.8.4.4' },
    body: JSON.stringify({ bin }),
  })
}

const company = {
  bin: '123456789012',
  name: 'ТОО Ромашка',
  address: 'Алматы, ул. Абая 1',
  director: 'Иванов И.И.',
  activity: '47.11',
  status: 'Зарегистрирован',
  registeredAt: '2020-01-01',
  source: 'egov' as const,
  isVatPayer: true,
  vatRegisteredAt: '2021-01-01',
  isUnreliable: false,
  isLiquidating: false,
  totalArrear: 0,
  taxArrear: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  // Слот занят: до занятия в счётчике уже была 1 попытка (used = значение ДО).
  h.claimQuotaSlot.mockResolvedValue({ ok: true, used: 1 })
  h.releaseCounterSlot.mockResolvedValue(true)
  h.registryLoadToday.mockResolvedValue(0)
})

describe('POST /api/tools/kontragent', () => {
  it('found: returns the public slice and charges one attempt', async () => {
    h.lookup.mockResolvedValue({ found: true, company })
    const res = await POST(req('123456789012'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.found).toBe(true)
    expect(body.remaining).toBe(1)
    expect(body.company.name).toBe('ТОО Ромашка')
    expect(body.company.hasFullCard).toBe(true)
    expect(body.company).not.toHaveProperty('address')
    expect(body.company).not.toHaveProperty('director')
    expect(h.claimQuotaSlot).toHaveBeenCalledTimes(1)
    expect(h.claimQuotaSlot.mock.calls[0][2]).toBe(3)
    expect(h.releaseCounterSlot).not.toHaveBeenCalled()
  })

  it('rehabilitation: only state/since/region reach the public response', async () => {
    h.lookup.mockResolvedValue({
      found: true,
      company: { ...company, rehabilitation: { state: 'listed', since: '2024-06-07', region: 'город Астана', name: 'ТОО Секрет', identifier: '123456789012' } },
    })
    const body = await (await POST(req('123456789012'))).json()
    expect(body.company.rehabilitation).toEqual({ state: 'listed', since: '2024-06-07', region: 'город Астана' })
    expect(JSON.stringify(body)).not.toContain('Секрет')
  })

  it('rehabilitation: null (not checked) stays null in the response, never becomes a clean answer', async () => {
    h.lookup.mockResolvedValue({ found: true, company: { ...company, rehabilitation: null } })
    const body = await (await POST(req('123456789012'))).json()
    expect(body.company).toHaveProperty('rehabilitation', null)
  })

  it('rehabilitation: undefined (feature asleep) leaves the field out entirely', async () => {
    h.lookup.mockResolvedValue({ found: true, company })
    const body = await (await POST(req('123456789012'))).json()
    expect(body.company).not.toHaveProperty('rehabilitation')
  })

  it('not found: answers found:false and still charges the attempt', async () => {
    h.lookup.mockResolvedValue({ found: false })
    const res = await POST(req('123456789012'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false, remaining: 1 })
    expect(h.claimQuotaSlot).toHaveBeenCalledTimes(1)
    expect(h.releaseCounterSlot).not.toHaveBeenCalled()
  })

  it('unavailable: answers 503 with an explicit flag and does NOT charge the attempt', async () => {
    h.lookup.mockResolvedValue({ found: false, unavailable: true })
    const res = await POST(req('123456789012'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.unavailable).toBe(true)
    expect(body).not.toHaveProperty('found')
    // Попытка не списана: остаток прежний (3 минус уже потраченная 1).
    expect(body.remaining).toBe(2)
    // Слот был занят до похода в реестры, при отказе реестров он возвращается.
    expect(h.releaseCounterSlot).toHaveBeenCalledTimes(1)
    expect(h.releaseCounterSlot.mock.calls[0][2]).toBe(2)
  })

  it('does not touch the registries or the counter for an invalid BIN', async () => {
    const res = await POST(req('123'))
    expect(res.status).toBe(400)
    expect(h.lookup).not.toHaveBeenCalled()
    expect(h.claimQuotaSlot).not.toHaveBeenCalled()
  })

  it('answers 429 limit without calling the registries once the quarter is used up', async () => {
    h.claimQuotaSlot.mockResolvedValue({ ok: false, reason: 'limit' })
    const res = await POST(req('123456789012'))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('limit')
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('the counter cannot be claimed: 503 and the registries are not asked (no free pass without a limit)', async () => {
    h.claimQuotaSlot.mockResolvedValue({ ok: false, reason: 'error' })
    const res = await POST(req('123456789012'))
    expect(res.status).toBe(503)
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('a busy day (global fuse) answers 429 busy BEFORE a slot is spent', async () => {
    h.registryLoadToday.mockResolvedValue(10_000)
    const res = await POST(req('123456789012'))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('busy')
    expect(h.claimQuotaSlot).not.toHaveBeenCalled()
    expect(h.lookup).not.toHaveBeenCalled()
  })
})
