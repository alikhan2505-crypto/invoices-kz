import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { salonDb } from '@/app/api/salon-sites/fakeServiceDb.test-util'

// Админский список и создание сайтов салонов: кривое тело - 400, а текст ошибки
// базы (таблицы, ограничения) не уходит в ответ (аудит 02.11.2026, раздел 4).
vi.mock('@/lib/salonSites/adminAuth', async () => {
  const { salonDb: db } = await import('@/app/api/salon-sites/fakeServiceDb.test-util')
  return { requireAdmin: async () => db.admin, serviceSupabase: db.client }
})

import { GET, POST } from './route'

const salon = { name: 'Лотос', city: 'Алматы', address: 'Абая 1', phone: '+77001112233', services: [{ name: 'Стрижка', price: '5000' }] }
const post = (raw: string) => POST(new NextRequest('http://localhost/api/salon-sites', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}))

beforeEach(() => {
  salonDb.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('/api/salon-sites', () => {
  it('не админ: ответ requireAdmin без изменений', async () => {
    salonDb.admin = { error: 'admin_only', status: 403 }
    const res = await GET(new NextRequest('http://localhost/api/salon-sites'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'admin_only' })
  })

  it('POST: кривое тело (не JSON, пустое, не объект): 400 bad_slug, а не 500', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{"slug":123}']) {
      const res = await post(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_slug' })
    }
  })

  it('POST: корректное создание как раньше', async () => {
    salonDb.write = { data: { id: 's1', slug: 'lotos', salon, pattern: 'classic', status: 'draft' }, error: null }
    const res = await post(JSON.stringify({ slug: 'lotos', salon, pattern: 'classic' }))
    expect(res.status).toBe(200)
    expect((await res.json()).site.slug).toBe('lotos')
  })

  it('POST: занятый поддомен - 409 slug_taken, как раньше', async () => {
    salonDb.write = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "salon_sites_slug_key"' } }
    const res = await post(JSON.stringify({ slug: 'lotos', salon, pattern: 'classic' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'slug_taken' })
  })

  it('POST: прочий сбой записи - 500 с общим текстом, без текста ошибки базы, детали в логе', async () => {
    salonDb.write = { data: null, error: { code: '42501', message: 'permission denied for table salon_sites' } }
    const res = await post(JSON.stringify({ slug: 'lotos', salon, pattern: 'classic' }))
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось создать сайт"}')
    expect(text).not.toContain('salon_sites')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('salon-sites create'), expect.stringContaining('salon_sites'))
  })

  it('GET: сбой чтения списка - 500 с общим текстом, без текста ошибки базы', async () => {
    salonDb.read = { data: null, error: { message: 'relation "salon_sites" does not exist' } }
    const res = await GET(new NextRequest('http://localhost/api/salon-sites'))
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось загрузить список сайтов"}')
    expect(text).not.toContain('relation')
  })

  it('GET: список как раньше', async () => {
    salonDb.read = { data: [{ id: 's1', slug: 'lotos' }], error: null }
    const res = await GET(new NextRequest('http://localhost/api/salon-sites'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sites: [{ id: 's1', slug: 'lotos' }] })
  })
})
