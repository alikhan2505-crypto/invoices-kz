import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  profile: { data: { vat_type: 'vat_16' } as { vat_type: string | null } | null, error: null as unknown },
  inserted: null as Record<string, unknown> | null,
  load: vi.fn(),
  numberError: null as { message: string } | null,
  insertError: null as { message: string } | null,
}))
const MODEL = '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => (h.numberError ? { data: null, error: h.numberError } : { data: 'W-1', error: null }),
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => h.profile }) }) }
      }
      return {
        insert: (row: Record<string, unknown>) => {
          h.inserted = row
          return { select: () => ({ single: async () => (h.insertError ? { data: null, error: h.insertError } : { data: { public_token: 'tok' }, error: null }) }) }
        },
      }
    },
  }),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({}) } } }))
vi.mock('@/lib/kaspiShop/storefront', () => ({
  resolveStorefrontBySlug: async () => ({ connectionId: 'c1', userId: 'u1', companyName: 'Shop' }),
}))
vi.mock('@/lib/kaspiShop/wholesaleStorefront', () => ({
  loadWholesaleModelByVariant: h.load,
  resolveWholesaleLine: (_m: unknown, _v: unknown, qty: number) => ({ name: 'Куртка', price: 1000, qty }),
}))

import { POST } from './route'

const call = (over: Record<string, unknown> = {}) => POST(
  new NextRequest('http://localhost/x', {
    method: 'POST',
    body: JSON.stringify({
      clientName: 'ТОО Клиент', clientBin: '123456789012', clientEmail: 'a@b.kz',
      items: [{ modelId: MODEL, size: 'M', color: 'red', qty: 2 }],
      ...over,
    }),
  }),
  { params: Promise.resolve({ slug: 's' }) },
)
const callRaw = (raw: string) => POST(
  new NextRequest('http://localhost/x', { method: 'POST', body: raw }),
  { params: Promise.resolve({ slug: 's' }) },
)

describe('POST /api/shop/[slug]/wholesale-order: налоговые поля счёта', () => {
  beforeEach(() => {
    h.inserted = null
    h.profile = { data: { vat_type: 'vat_16' }, error: null }
    h.numberError = null
    h.insertError = null
    h.load.mockReset()
    h.load.mockResolvedValue({ model: {}, variant: {} })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('режим НДС продавца записывается в счёт, КНП не задаётся (null => 849)', async () => {
    expect((await call()).status).toBe(200)
    expect(h.inserted?.vat_type).toBe('vat_16')
    expect(h.inserted).not.toHaveProperty('knp')
  })

  it('у продавца режим не задан: no_vat; профиль не прочитался: null (просмотр возьмёт режим профиля)', async () => {
    h.profile = { data: { vat_type: null }, error: null }
    await call()
    expect(h.inserted?.vat_type).toBe('no_vat')
    h.profile = { data: null, error: null }
    await call()
    expect(h.inserted?.vat_type).toBeNull()
  })
})

describe('POST /api/shop/[slug]/wholesale-order: кривой ввод и сбои (аудит 02.11.2026)', () => {
  beforeEach(() => {
    h.inserted = null
    h.profile = { data: { vat_type: 'vat_16' }, error: null }
    h.numberError = null
    h.insertError = null
    h.load.mockReset()
    h.load.mockResolvedValue({ model: {}, variant: {} })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('кривое тело (не JSON, пустое, не объект): 400, а не 500, счёт не создаётся', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"']) {
      expect((await callRaw(raw)).status, raw).toBe(400)
    }
    expect(h.inserted).toBeNull()
  })

  it('мусорный modelId (не uuid): 400 с прежним текстом про недоступные товары, загрузчик и база не вызываются', async () => {
    for (const modelId of ['m', 'abc', "x' or '1'='1", MODEL.replace(/-/g, '')]) {
      const res = await call({ items: [{ modelId, size: 'M', color: 'red', qty: 2 }] })
      expect(res.status, modelId).toBe(400)
      expect(await res.json()).toEqual({ error: 'Часть товаров в корзине больше недоступна, обновите страницу' })
    }
    expect(h.load).not.toHaveBeenCalled()
    expect(h.inserted).toBeNull()
  })

  it('один мусорный modelId отклоняет корзину целиком', async () => {
    const res = await call({ items: [{ modelId: MODEL, size: 'M', color: 'red', qty: 1 }, { modelId: 'abc', size: 'M', color: 'red', qty: 1 }] })
    expect(res.status).toBe(400)
    expect(h.inserted).toBeNull()
  })

  it('сбой загрузки модели: 500 с общим текстом, без текста ошибки базы', async () => {
    h.load.mockRejectedValue(new Error('kaspi_shop_storefront_models lookup failed for model x: permission denied'))
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Не удалось оформить заявку' })
  })

  it('сбой номера счёта и записи счёта: 500 с общим текстом, без текста ошибки базы', async () => {
    h.numberError = { message: 'function claim_invoice_number(p_user_id) does not exist' }
    let res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"Не удалось оформить заявку"}')

    h.numberError = null
    h.insertError = { message: 'null value in column "user_id" of relation "invoices" violates not-null constraint' }
    res = await call()
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось оформить заявку"}')
    expect(text).not.toContain('invoices')
  })
})
