import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isUuid } from '@/lib/uuidFormat'

// Публичный заказ витрины: кривое тело и мусорные id дают 400, а не 500; сбои базы
// не показывают покупателю текст ошибки (аудит 02.11.2026, раздел 4).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const PRODUCT = '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b'
const h = vi.hoisted(() => ({
  productLookups: [] as unknown[],
  productError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  inserted: [] as Record<string, unknown>[],
  mint: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => { filters[c] = v; return b },
        gte: () => b,
        insert: (row: Record<string, unknown>) => { h.inserted.push(row); return b },
        maybeSingle: async () => {
          h.productLookups.push(filters.id)
          // Как Postgres: uuid-колонка на мусорный id отвечает ошибкой 22P02.
          if (!isUuid(filters.id)) return { data: null, error: { message: 'invalid input syntax for type uuid: "' + String(filters.id) + '"' } }
          if (h.productError) return { data: null, error: h.productError }
          if (table === 'kaspi_shop_tracked_products') {
            return { data: { id: PRODUCT, product_name: 'Чехол', own_current_price: 2500, available_for_sale: true, stock_count: 10, show_on_storefront: true }, error: null }
          }
          return { data: null, error: null }
        },
        single: async () => (h.insertError ? { data: null, error: h.insertError } : { data: { id: 'order-1', price: 2500, status: 'pending_payment' }, error: null }),
        // await на select(count).eq().gte(): заказов за окно лимита.
        then: (res: any, rej: any) => Promise.resolve({ count: 0, error: null }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/kaspiShop/storefront', () => ({
  resolveStorefrontBySlug: async () => ({ connectionId: 'c1', userId: 'u1', companyName: 'Shop' }),
}))
vi.mock('@/lib/kaspiPay/shopOrderPayment', () => ({ getOrCreateKaspiPaymentForShopOrder: h.mint }))

import { POST } from './route'

const buyer = { buyerName: 'Анна', buyerPhone: '+7 777 123 45 67', buyerAddress: 'Алматы, Абая 1' }
const call = (body: unknown) => POST(
  new NextRequest('http://localhost/api/shop/s/order', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }),
  { params: Promise.resolve({ slug: 's' }) },
)

beforeEach(() => {
  h.productLookups = []
  h.productError = null
  h.insertError = null
  h.inserted = []
  h.mint.mockReset()
  h.mint.mockResolvedValue({ qr_token: 'qr', payment_link: 'https://pay', status: 'pending' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/shop/[slug]/order', () => {
  it('кривое тело (не JSON, пустое, не объект): 400, а не 500, база не затронута', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"']) {
      const res = await call(raw)
      expect(res.status, raw).toBe(400)
    }
    expect(h.productLookups).toHaveLength(0)
    expect(h.inserted).toHaveLength(0)
  })

  it('мусорный id товара (не uuid): 400 с прежним текстом про недоступные товары, в базу запрос не уходит', async () => {
    for (const id of ['abc', 'm', '1', "x' or '1'='1", '3f2b8c1e9a4d4e6f8b1a0c2d3e4f5a6b']) {
      const res = await call({ ...buyer, items: [{ id, qty: 1 }] })
      expect(res.status, id).toBe(400)
      expect(await res.json()).toEqual({ error: 'Часть товаров в корзине уже недоступна, обновите страницу' })
    }
    expect(h.productLookups).toHaveLength(0)
    expect(h.inserted).toHaveLength(0)
  })

  it('один мусорный id в корзине отклоняет корзину целиком, исправные строки не оформляются', async () => {
    const res = await call({ ...buyer, items: [{ id: PRODUCT, qty: 1 }, { id: 'abc', qty: 1 }] })
    expect(res.status).toBe(400)
    expect(h.inserted).toHaveLength(0)
  })

  it('корректная корзина оформляется как раньше', async () => {
    const res = await call({ ...buyer, items: [{ id: PRODUCT, qty: 1 }] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ orderId: 'order-1', payment: { qr_token: 'qr', payment_link: 'https://pay', status: 'pending' } })
    expect(h.inserted).toHaveLength(1)
    expect(h.inserted[0]).toMatchObject({ price: 2500, product_name: 'Чехол' })
  })

  it('сбой чтения товара: 500 с общим текстом, без текста ошибки базы', async () => {
    h.productError = { message: 'permission denied for table kaspi_shop_tracked_products' }
    const res = await call({ ...buyer, items: [{ id: PRODUCT, qty: 1 }] })
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось оформить заказ"}')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('line resolution'), expect.stringContaining('kaspi_shop_tracked_products'))
  })

  it('сбой записи заказа: 500 с общим текстом, без текста ошибки базы', async () => {
    h.insertError = { message: 'duplicate key value violates unique constraint "kaspi_shop_orders_pkey"' }
    const res = await call({ ...buyer, items: [{ id: PRODUCT, qty: 1 }] })
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось оформить заказ"}')
    expect(text).not.toContain('kaspi_shop_orders')
  })
})
