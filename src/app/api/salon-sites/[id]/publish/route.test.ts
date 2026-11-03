import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { salonDb } from '@/app/api/salon-sites/fakeServiceDb.test-util'

// Публикация варианта сайта салона (только админ): кривое тело - 400, текст ошибки
// базы не уходит в ответ (аудит 02.11.2026, раздел 4).
vi.mock('@/lib/salonSites/adminAuth', async () => {
  const { salonDb: db } = await import('@/app/api/salon-sites/fakeServiceDb.test-util')
  return { requireAdmin: async () => db.admin, serviceSupabase: db.client }
})

import { POST } from './route'

const params = { params: Promise.resolve({ id: 's1' }) }
const post = (raw: string) => POST(new NextRequest('http://localhost/api/salon-sites/s1/publish', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}), params)

beforeEach(() => {
  salonDb.reset()
  salonDb.read = { data: { id: 'v1', html: '<html></html>' }, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/salon-sites/[id]/publish', () => {
  it('кривое тело (не JSON, пустое, не объект, variantId не строка): 400 variant_id_required', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{"variantId":123}', '{"variantId":{"a":1}}', '{"variantId":""}']) {
      const res = await post(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'variant_id_required' })
    }
  })

  it('публикация как раньше', async () => {
    salonDb.write = { data: { id: 's1', slug: 'lotos', status: 'published', published_at: '2026-11-03T10:00:00Z' }, error: null }
    const res = await post('{"variantId":"v1"}')
    expect(res.status).toBe(200)
    expect((await res.json()).site.status).toBe('published')
  })

  it('сбой записи - 500 с общим текстом, без текста ошибки базы, детали в логе', async () => {
    salonDb.write = { data: null, error: { message: 'column "published_html" of relation "salon_sites" does not exist' } }
    const res = await post('{"variantId":"v1"}')
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось опубликовать сайт"}')
    expect(text).not.toContain('published_html')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('salon-sites publish'), expect.stringContaining('published_html'))
  })
})
