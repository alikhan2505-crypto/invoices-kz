import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// K13 (аудит Kaspi 2026-11-06): ИИ-подбор берёт себестоимость из карточки товара,
// видит цены конкурентов и с общей цены карточки (у свежего товара городских строк
// ещё нет) и не зовёт модель без этих данных.
const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  product: { data: null as any, error: null as any },
  cities: { data: [] as any[], error: null as any },
  gate: null as any,
  suggest: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (table: string) => {
      const result = () => (table === 'kaspi_shop_tracked_products' ? h.product : h.cities)
      const q: any = {
        select: () => q, eq: () => q,
        maybeSingle: async () => result(),
        then: (resolve: any) => resolve(result()),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({ kaspiShopPlanGate: async () => h.gate }))
vi.mock('@/lib/kaspiShop/suggestPricingRule', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/kaspiShop/suggestPricingRule')>()
  return { ...real, suggestPricingRule: h.suggest }
})

import { POST } from './route'
import { SuggestionInputError, SuggestionRejectedError } from '@/lib/kaspiShop/suggestPricingRule'

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/kaspi-shop/products/suggest-pricing', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const freshProduct = (over: Record<string, unknown> = {}) => ({
  data: { product_name: 'Чехол', kaspi_category: 'Чехлы', brand: 'X', cogs_amount: 700, last_competitor_price: 1400, ...over },
  error: null,
})

beforeEach(() => {
  h.user = { id: 'u1' }
  h.gate = null
  h.product = freshProduct()
  h.cities = { data: [{ last_competitor_price: 1500 }, { last_competitor_price: null }, { last_competitor_price: 0 }], error: null }
  h.suggest.mockReset().mockResolvedValue({ floorPrice: 900, undercutStep: 50, reasoning: 'ок' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/kaspi-shop/products/suggest-pricing', () => {
  it('себестоимость берётся из карточки, цены конкурентов: города плюс общая цена, без нулей и пустых', async () => {
    const res = await POST(req({ productId: 'p1' }))
    expect(res.status).toBe(200)
    const call = h.suggest.mock.calls[0][0]
    expect(call.ownCost).toBe(700)
    expect([...call.competitorPrices].sort()).toEqual([1400, 1500])
    const body = await res.json()
    expect(body).toMatchObject({ floorPrice: 900, undercutStep: 50, reasoning: 'ок', estimate: true, ownCost: 700, competitorCount: 2 })
  })

  it('свежий товар без городских строк, но с общей ценой конкурента: цена доходит до модели', async () => {
    h.cities = { data: [], error: null }
    await POST(req({ productId: 'p1' }))
    expect(h.suggest.mock.calls[0][0].competitorPrices).toEqual([1400])
  })

  it('себестоимости в карточке нет: берём из тела запроса, понимая пробелы и запятую', async () => {
    h.product = freshProduct({ cogs_amount: null, kaspi_category: null, brand: '' })
    await POST(req({ productId: 'p1', ownCost: '1 250,5' }))
    expect(h.suggest.mock.calls[0][0].ownCost).toBe(1250.5)
    expect(h.suggest.mock.calls[0][0].category).toBe('общая категория')
  })

  it('мусор в ownCost не превращается в NaN: себестоимость неизвестна', async () => {
    h.product = freshProduct({ cogs_amount: null })
    await POST(req({ productId: 'p1', ownCost: 'abc' }))
    expect(h.suggest.mock.calls[0][0].ownCost).toBeUndefined()
  })

  it('нехватка данных: 400 с понятным текстом', async () => {
    h.suggest.mockRejectedValue(new SuggestionInputError('Укажите себестоимость товара в разделе «Прибыль»'))
    const res = await POST(req({ productId: 'p1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('себестоимость')
  })

  it('ответ модели отвергнут (ниже себестоимости): 502 с текстом причины', async () => {
    h.suggest.mockRejectedValue(new SuggestionRejectedError('ИИ предложил минимальную цену 500, это ниже себестоимости'))
    const res = await POST(req({ productId: 'p1' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('ниже себестоимости')
  })

  it('прочий сбой: 502 без утечки внутреннего текста', async () => {
    h.suggest.mockRejectedValue(new Error('ANTHROPIC_API_KEY not configured'))
    const res = await POST(req({ productId: 'p1' }))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('ANTHROPIC_API_KEY')
  })

  it('чужой или несуществующий товар: 404; без productId: 400; без входа: 401', async () => {
    h.product = { data: null, error: null }
    expect((await POST(req({ productId: 'zzz' }))).status).toBe(404)
    expect((await POST(req({}))).status).toBe(400)
    h.user = null
    expect((await POST(req({ productId: 'p1' }))).status).toBe(401)
  })

  it('ошибка чтения из базы: 500', async () => {
    h.product = { data: null, error: { message: 'boom' } }
    expect((await POST(req({ productId: 'p1' }))).status).toBe(500)
  })
})
