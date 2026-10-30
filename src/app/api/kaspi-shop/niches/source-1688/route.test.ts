import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  tokens: {} as Record<string, string>,
  admins: {} as Record<string, boolean>,
  dbError: false,
  notPro: false,
  llm: vi.fn(),
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

import { POST } from './route'
import { resetSource1688State, LIMIT_PER_HOUR } from '@/lib/kaspiShop/source1688Guard'

const SUGGESTION = { queries: [{ zh: '婴儿湿巾', ru: 'детские влажные салфетки' }], weightGrams: 350 }

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
