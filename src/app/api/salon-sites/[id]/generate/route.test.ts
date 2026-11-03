import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { salonDb } from '@/app/api/salon-sites/fakeServiceDb.test-util'

// Генерация варианта сайта салона (только админ): кривое тело - 400, а текст ошибки
// базы не уходит в ответ (аудит 02.11.2026, раздел 4).
const h = vi.hoisted(() => ({ gen: vi.fn() }))
vi.mock('@/lib/salonSites/adminAuth', async () => {
  const { salonDb: db } = await import('@/app/api/salon-sites/fakeServiceDb.test-util')
  return { requireAdmin: async () => db.admin, serviceSupabase: db.client }
})
vi.mock('@/lib/salonSites/generateLanding', () => ({ generateLandingVariant: h.gen }))

import { POST } from './route'

const salon = { name: 'Лотос', city: 'Алматы', address: 'Абая 1', phone: '+77001112233', services: [{ name: 'Стрижка', price: '5000' }] }
const params = { params: Promise.resolve({ id: 's1' }) }
const post = (raw: string) => POST(new NextRequest('http://localhost/api/salon-sites/s1/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}), params)

beforeEach(() => {
  salonDb.reset()
  salonDb.read = { data: { id: 's1', salon, pattern: 'classic' }, error: null }
  h.gen.mockReset()
  h.gen.mockResolvedValue({ direction: 'тёплый', html: '<html></html>' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/salon-sites/[id]/generate', () => {
  it('кривое тело или variantNo не из 1..3: 400 bad_variant_no, модель не вызывается', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{"variantNo":0}', '{"variantNo":4}', '{"variantNo":"abc"}', '{"variantNo":{"a":1}}']) {
      const res = await post(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_variant_no' })
    }
    expect(h.gen).not.toHaveBeenCalled()
  })

  it('сбой генерации: 502 generation_failed, текст исключения не уходит наружу (как раньше)', async () => {
    h.gen.mockRejectedValue(new Error('Anthropic 529 overloaded sk-ant-SECRET'))
    const res = await post('{"variantNo":1}')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'generation_failed' })
  })

  it('сбой записи варианта - 500 с общим текстом, без текста ошибки базы, детали в логе', async () => {
    salonDb.write = { data: null, error: { message: 'there is no unique constraint matching ON CONFLICT specification of "salon_site_variants"' } }
    const res = await post('{"variantNo":2}')
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось сохранить вариант"}')
    expect(text).not.toContain('salon_site_variants')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('salon-sites variant save'), expect.stringContaining('salon_site_variants'))
  })

  it('успешная генерация как раньше', async () => {
    salonDb.write = { data: { id: 'v1', variant_no: 1, direction: 'тёплый', html: '<html></html>', created_at: 'x' }, error: null }
    const res = await post('{"variantNo":1}')
    expect(res.status).toBe(200)
    expect((await res.json()).variant.variant_no).toBe(1)
  })
})
