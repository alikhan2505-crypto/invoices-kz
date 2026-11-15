import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => { process.env.KASPI_SHOP_ENCRYPTION_KEY = '11'.repeat(32) })

// Шаг выбора магазина: токен сессии зашифрован и привязан к человеку, merchantId обязан быть среди магазинов этого входа.
const { getUser, listMerchants, getMerchantInfo, finalizeConnection } = vi.hoisted(() => ({
  getUser: vi.fn(), listMerchants: vi.fn(), getMerchantInfo: vi.fn(), finalizeConnection: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: vi.fn(async () => null) }))
vi.mock('@/lib/kaspiShop/cabinetApi', () => ({
  listMerchants: (...a: unknown[]) => listMerchants(...a),
  getMerchantInfo: (...a: unknown[]) => getMerchantInfo(...a),
}))
vi.mock('@/lib/kaspiShop/finalizeConnection', () => ({ finalizeConnection: (...a: unknown[]) => finalizeConnection(...a) }))

import { POST } from './route'
import { sealConnectToken } from '@/lib/kaspiShop/connectTokens'

const COOKIES = 'mc-session=a; mc-sid=b'
const req = (body: unknown) => new Request('http://localhost/api/kaspi-shop/connect/select-merchant', {
  method: 'POST',
  headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
  body: JSON.stringify(body),
}) as unknown as import('next/server').NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  listMerchants.mockResolvedValue([{ uid: 'm1' }, { uid: 'm2' }])
  getMerchantInfo.mockResolvedValue({ name: 'Shop 2' })
  finalizeConnection.mockResolvedValue({ importedProducts: 5, importComplete: true })
})

describe('POST /api/kaspi-shop/connect/select-merchant', () => {
  it('нормальный путь: магазин из списка этого входа подключается', async () => {
    const res = await POST(req({ sessionToken: sealConnectToken('u1', 'session', COOKIES), merchantId: 'm2' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'connected', companyName: 'Shop 2', importedProducts: 5 })
    expect(finalizeConnection).toHaveBeenCalledWith('u1', COOKIES, 'm2', 'Shop 2', expect.anything())
  })

  it('merchantId не из списка этого входа: 400, магазин не подключается', async () => {
    const res = await POST(req({ sessionToken: sealConnectToken('u1', 'session', COOKIES), merchantId: 'someone-elses' }))
    expect(res.status).toBe(400)
    expect(finalizeConnection).not.toHaveBeenCalled()
    expect(getMerchantInfo).not.toHaveBeenCalled()
  })

  it('токен чужой, просроченный, открытый или мусорный: 400 без обращения к Kaspi', async () => {
    const plainBase64 = Buffer.from(COOKIES, 'utf8').toString('base64') // прежний формат
    for (const sessionToken of [
      sealConnectToken('u2', 'session', COOKIES),
      sealConnectToken('u1', 'session', COOKIES, Date.now() - 31 * 60_000),
      sealConnectToken('u1', 'otp', COOKIES),
      plainBase64, 'junk',
    ]) {
      const res = await POST(req({ sessionToken, merchantId: 'm1' }))
      expect(res.status).toBe(400)
    }
    expect(listMerchants).not.toHaveBeenCalled()
    expect(finalizeConnection).not.toHaveBeenCalled()
  })

  it('без входа 401; без полей 400', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ sessionToken: 'x', merchantId: 'm1' }))).status).toBe(401)
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    expect((await POST(req({}))).status).toBe(400)
  })
})
