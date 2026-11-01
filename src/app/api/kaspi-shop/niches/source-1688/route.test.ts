import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  tokens: {} as Record<string, string>,
  admins: {} as Record<string, boolean>,
  dbError: false,
  notPro: false,
  llm: vi.fn(),
  mic: vi.fn(),
  rate: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (t: string) => (h.tokens[t]
        ? { data: { user: { id: h.tokens[t] } }, error: null }
        : { data: { user: null }, error: { message: 'bad' } }),
    },
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => (h.dbError
            ? { data: null, error: { message: 'down' } }
            : { data: { is_admin: h.admins[id] === true }, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/kaspiShop/planGate', () => ({
  kaspiShopPlanGate: async () => (h.notPro ? NextResponse.json({ errorCode: 'not_pro' }, { status: 403 }) : null),
}))
vi.mock('@/lib/kaspiShop/source1688Llm', () => ({ suggest1688Queries: h.llm }))
vi.mock('@/lib/kaspiShop/madeInChina', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/kaspiShop/madeInChina')>()),
  fetchMic: h.mic,
}))
vi.mock('@/lib/kaspiShop/usdRate', () => ({ getUsdKzt: h.rate }))

import { POST } from './route'
import { resetSource1688State, LIMIT_PER_HOUR } from '@/lib/kaspiShop/source1688Guard'

const SUGGESTION = { queries: [{ zh: '婴儿湿巾', ru: 'детские влажные салфетки' }], enQueries: ['wet wipes'], weightGrams: 350 }
const MIC_URL = 'https://www.made-in-china.com/products-search/hot-china-products/Wet_Wipes.html'
const MIC_OK = {
  status: 'ok',
  searchUrl: MIC_URL,
  items: [{ name: 'Baby Wipes', imageUrl: 'https://image.made-in-china.com/a.jpg', supplier: 'S', category: 'Baby', lowUsd: 0.1, highUsd: 0.5, url: MIC_URL, exact: false }],
}

const post = (token: string | null, body: unknown) =>
  new NextRequest('http://localhost/api/kaspi-shop/niches/source-1688', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  h.tokens = { 'tok-admin': 'u-admin', 'tok-user': 'u-user' }
  h.admins = { 'u-admin': true, 'u-user': false }
  h.dbError = false
  h.notPro = false
  h.llm.mockReset()
  h.llm.mockResolvedValue(SUGGESTION)
  h.mic.mockReset()
  h.mic.mockResolvedValue(MIC_OK)
  h.rate.mockReset()
  h.rate.mockResolvedValue(500)
  resetSource1688State()
})

describe('доступ', () => {
  it('без токена 401, модель не вызывается', async () => {
    expect((await POST(post(null, { name: 'Влажные салфетки' }))).status).toBe(401)
    expect((await POST(post('forged', { name: 'Влажные салфетки' }))).status).toBe(401)
    expect(h.llm).not.toHaveBeenCalled()
  })
  it('нет тарифа Про: ответ гейта тарифа', async () => {
    h.notPro = true
    expect((await POST(post('tok-admin', { name: 'Влажные салфетки' }))).status).toBe(403)
    expect(h.llm).not.toHaveBeenCalled()
  })
  it('не админ: 403 admin_only, пока включён гейт', async () => {
    const r = await POST(post('tok-user', { name: 'Влажные салфетки' }))
    expect(r.status).toBe(403)
    expect((await r.json()).errorCode).toBe('admin_only')
    expect(h.llm).not.toHaveBeenCalled()
  })
  it('профиль не прочитался: 503, а не доступ', async () => {
    h.dbError = true
    expect((await POST(post('tok-admin', { name: 'Влажные салфетки' }))).status).toBe(503)
    expect(h.llm).not.toHaveBeenCalled()
  })
})

describe('запрос', () => {
  it('слишком короткое и слишком длинное название: 400', async () => {
    expect((await POST(post('tok-admin', { name: 'ab' }))).status).toBe(400)
    expect((await POST(post('tok-admin', { name: 'а'.repeat(201) }))).status).toBe(400)
    expect((await POST(post('tok-admin', {}))).status).toBe(400)
    expect(h.llm).not.toHaveBeenCalled()
  })

  it('успех: запросы со ссылками, вес, плашки и ссылка в калькулятор', async () => {
    const r = await POST(post('tok-admin', { name: 'Детские влажные салфетки 80 шт', price: 1500, brand: 'Без бренда' }))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.queries).toHaveLength(1)
    expect(j.queries[0].zh).toBe('婴儿湿巾')
    expect(j.queries[0].url).toContain('https://s.1688.com/selloffer/offer_search.htm?keywords=')
    expect(j.weightGrams).toBe(350)
    expect(j.risks.map((x: { key: string }) => x.key)).toEqual(['documents', 'duty'])
    expect(j.marginHref).toContain('/kaspi-shop/margin?')
    expect(j.marginHref).toContain('price=1500')
    expect(j.marginHref).toContain('weight=350')
    expect(r.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('повтор того же названия берётся из кэша: модель вызывается один раз', async () => {
    await POST(post('tok-admin', { name: 'Влажные салфетки 80 шт', price: 1000 }))
    await POST(post('tok-admin', { name: '  влажные салфетки, 80 шт ', price: 1200 }))
    expect(h.llm).toHaveBeenCalledTimes(1)
  })

  it('лимит на пользователя: после исчерпания 429, кэш при этом отвечает', async () => {
    for (let i = 0; i < LIMIT_PER_HOUR; i++) {
      expect((await POST(post('tok-admin', { name: `Товар номер ${i}` }))).status).toBe(200)
    }
    expect((await POST(post('tok-admin', { name: 'Совсем новый товар' }))).status).toBe(429)
    expect((await POST(post('tok-admin', { name: 'Товар номер 3' }))).status).toBe(200) // из кэша
  })
})

describe('товары Made-in-China', () => {
  const run = async () => (await POST(post('tok-admin', { name: 'Детские влажные салфетки 80 шт', price: 1500 }))).json()

  it('успех: товары с ценой в тенге по курсу, запрос идёт по первому английскому', async () => {
    const j = await run()
    expect(h.mic).toHaveBeenCalledWith('wet wipes')
    expect(j.suppliers).toMatchObject({ source: 'made-in-china', query: 'wet wipes', status: 'ok', usdKzt: 500, searchUrl: MIC_URL })
    expect(j.suppliers.items[0]).toMatchObject({ name: 'Baby Wipes', lowKzt: 50, highKzt: 250 })
  })
  it('нет курса: тенге null, товары всё равно есть', async () => {
    h.rate.mockResolvedValue(null)
    const j = await run()
    expect(j.suppliers.items[0]).toMatchObject({ lowKzt: null, highKzt: null })
    expect(j.suppliers.usdKzt).toBeNull()
  })
  it('источник недоступен: статус unavailable и пустой список, остальной ответ цел', async () => {
    h.mic.mockResolvedValue({ status: 'unavailable', searchUrl: MIC_URL })
    const j = await run()
    expect(j.suppliers).toMatchObject({ status: 'unavailable', items: [] })
    expect(j.queries).toHaveLength(1)
    expect(j.risks.length).toBeGreaterThan(0)
  })
  it('выключатель (fetchMic вернул null) или нет английских запросов: suppliers null', async () => {
    h.mic.mockResolvedValue(null)
    expect((await run()).suppliers).toBeNull()
    h.llm.mockResolvedValue({ ...SUGGESTION, enQueries: [] })
    const j = await POST(post('tok-admin', { name: 'Другой товар без английского' }))
    expect((await j.json()).suppliers).toBeNull()
    h.llm.mockResolvedValue({ queries: SUGGESTION.queries, weightGrams: 1 }) // старый кэш без поля
    expect((await (await POST(post('tok-admin', { name: 'Ещё один товар' }))).json()).suppliers).toBeNull()
  })
  it('исключение внутри поиска не ломает ответ', async () => {
    h.mic.mockRejectedValue(new Error('boom'))
    const r = await POST(post('tok-admin', { name: 'Детские влажные салфетки 80 шт', price: 1500 }))
    expect(r.status).toBe(200)
    expect((await r.json()).suppliers).toBeNull()
  })
  it('первый запрос честно пуст: пробуем второй; сбой источника второй не вызывает', async () => {
    h.llm.mockResolvedValue({ ...SUGGESTION, enQueries: ['wet wipes', 'baby wipes'] })
    h.mic.mockResolvedValueOnce({ status: 'ok', searchUrl: MIC_URL, items: [] }).mockResolvedValueOnce(MIC_OK)
    const j = await run()
    expect(h.mic.mock.calls.map(c => c[0])).toEqual(['wet wipes', 'baby wipes'])
    expect(j.suppliers).toMatchObject({ query: 'baby wipes', status: 'ok' })
    expect(j.suppliers.items).toHaveLength(1)

    h.mic.mockReset()
    h.mic.mockResolvedValue({ status: 'unavailable', searchUrl: MIC_URL })
    const j2 = await POST(post('tok-admin', { name: 'Совсем другой товар для проверки сбоя' }))
    expect(h.mic).toHaveBeenCalledTimes(1)
    expect((await j2.json()).suppliers.status).toBe('unavailable')
  })
  it('бренд и категория входят в ключ кэша: другая категория вызывает модель заново', async () => {
    await POST(post('tok-admin', { name: 'Одинаковое название товара', brand: 'A', category: 'X' }))
    await POST(post('tok-admin', { name: 'Одинаковое название товара', brand: 'A', category: 'X' }))
    expect(h.llm).toHaveBeenCalledTimes(1)
    await POST(post('tok-admin', { name: 'Одинаковое название товара', brand: 'B', category: 'X' }))
    expect(h.llm).toHaveBeenCalledTimes(2)
  })
  it('не админ: поиск не вызывается', async () => {
    await POST(post('tok-user', { name: 'Влажные салфетки' }))
    expect(h.mic).not.toHaveBeenCalled()
  })
})

describe('сбои модели', () => {
  it('исключение: 502 и без утечки текста ошибки', async () => {
    h.llm.mockRejectedValue(new Error('secret-key-xyz is invalid'))
    const r = await POST(post('tok-admin', { name: 'Влажные салфетки' }))
    expect(r.status).toBe(502)
    expect(JSON.stringify(await r.json())).not.toContain('secret-key')
  })
  it('нет полезного ответа: 502, и не кэшируется', async () => {
    h.llm.mockResolvedValueOnce(null)
    expect((await POST(post('tok-admin', { name: 'Влажные салфетки' }))).status).toBe(502)
    expect((await POST(post('tok-admin', { name: 'Влажные салфетки' }))).status).toBe(200)
    expect(h.llm).toHaveBeenCalledTimes(2)
  })
})
