import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Доставка результата проверки ниши (аудит 14.11.2026): повторная доставка того же
// результата не должна списывать деньги второй раз.
const h = vi.hoisted(() => ({
  complete: vi.fn(),
  fail: vi.fn(),
  debit: vi.fn(),
}))

vi.mock('@/lib/kaspiShop/nicheChecks', () => ({ completeNicheCheck: h.complete, failNicheCheck: h.fail }))
vi.mock('@/lib/kaspiShop/wallet', () => ({ debitKaspiShopWallet: h.debit }))

import { POST } from './route'

const SECRET = 'cron-secret'
const call = (body: unknown, secret: string | null = SECRET) => POST(new NextRequest('http://localhost/api/kaspi-shop/niches/deliver', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret ? { 'x-kaspi-shop-cron-secret': secret } : {}) },
  body: JSON.stringify(body),
}))
const okBody = { checkId: 'c1', upstreamStatus: 200, upstreamBodyText: JSON.stringify({ data: [] }) }

beforeEach(() => {
  process.env.KASPI_SHOP_CRON_SECRET = SECRET
  h.complete.mockReset()
  h.fail.mockReset()
  h.debit.mockReset()
  h.debit.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/kaspi-shop/niches/deliver', () => {
  it('без секрета 401, ничего не трогаем', async () => {
    expect((await call(okBody, null)).status).toBe(401)
    expect((await call(okBody, 'wrong')).status).toBe(401)
    expect(h.complete).not.toHaveBeenCalled()
    expect(h.debit).not.toHaveBeenCalled()
  })

  it('первая доставка закрывает проверку и списывает один раз', async () => {
    h.complete.mockResolvedValue({ userId: 'u1', query: 'чехол', firstCompletion: true })
    expect((await call(okBody)).status).toBe(200)
    expect(h.debit).toHaveBeenCalledTimes(1)
    expect(h.debit.mock.calls[0][0]).toBe('u1')
  })

  it('повторная доставка (firstCompletion=false) не списывает второй раз', async () => {
    h.complete.mockResolvedValue({ userId: null, query: '', firstCompletion: false })
    expect((await call(okBody)).status).toBe(200)
    // даже если бы функция вернула владельца, без firstCompletion списания нет
    h.complete.mockResolvedValue({ userId: 'u1', query: 'чехол', firstCompletion: false })
    expect((await call(okBody)).status).toBe(200)
    expect(h.debit).not.toHaveBeenCalled()
  })

  it('старая проверка без владельца не списывается', async () => {
    h.complete.mockResolvedValue({ userId: null, query: 'чехол', firstCompletion: true })
    expect((await call(okBody)).status).toBe(200)
    expect(h.debit).not.toHaveBeenCalled()
  })

  it('ошибка Kaspi: проверка помечается ошибкой, без списания', async () => {
    expect((await call({ checkId: 'c1', upstreamStatus: 502, upstreamBodyText: '' })).status).toBe(200)
    expect(h.fail).toHaveBeenCalledTimes(1)
    expect(h.complete).not.toHaveBeenCalled()
    expect(h.debit).not.toHaveBeenCalled()
  })
})
