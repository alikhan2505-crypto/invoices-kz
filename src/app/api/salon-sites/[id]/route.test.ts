import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { salonDb } from '@/app/api/salon-sites/fakeServiceDb.test-util'

// Админские чтение, правка и удаление сайта салона: текст ошибки базы не уходит
// в ответ, кривое тело PATCH не роняет роут (аудит 02.11.2026, раздел 4).
vi.mock('@/lib/salonSites/adminAuth', async () => {
  const { salonDb: db } = await import('@/app/api/salon-sites/fakeServiceDb.test-util')
  return { requireAdmin: async () => db.admin, serviceSupabase: db.client }
})

import { PATCH, DELETE } from './route'

const params = { params: Promise.resolve({ id: '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b' }) }
const patch = (raw: string) => PATCH(new NextRequest('http://localhost/api/salon-sites/x', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: raw,
}), params)

beforeEach(() => {
  salonDb.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('/api/salon-sites/[id]', () => {
  it('PATCH: кривое тело (не JSON, пустое, не объект): 400 bad_body, запись не выполняется', async () => {
    salonDb.write = { data: { id: 's1', slug: 'lotos' }, error: null }
    for (const raw of ['not json', '', 'null', '[]', '"x"', '123']) {
      const res = await patch(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_body' })
    }
  })

  it('PATCH: объект без полей по-прежнему проходит (меняется только updated_at)', async () => {
    salonDb.write = { data: { id: 's1', slug: 'lotos' }, error: null }
    expect((await patch('{}')).status).toBe(200)
  })

  it('PATCH: мусорные salon и pattern - 400, как раньше', async () => {
    expect((await patch('{"salon":"x"}')).status).toBe(400)
    expect((await patch('{"salon":{"name":"только имя"}}')).status).toBe(400)
    expect((await patch('{"pattern":"no-such-pattern"}')).status).toBe(400)
    expect((await patch('{"pattern":{"a":1}}')).status).toBe(400)
  })

  it('PATCH: сбой записи - 500 с общим текстом, без текста ошибки базы, детали в логе', async () => {
    salonDb.write = { data: null, error: { message: 'new row for relation "salon_sites" violates check constraint "salon_sites_pattern_check"' } }
    const res = await patch('{"pattern":"classic"}')
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось сохранить сайт"}')
    expect(text).not.toContain('salon_sites')
    expect(text).not.toContain('constraint')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('salon-sites update'), expect.stringContaining('salon_sites_pattern_check'))
  })

  it('DELETE: сбой удаления - 500 с общим текстом; успех как раньше', async () => {
    salonDb.write = { data: null, error: { message: 'update or delete on table "salon_sites" violates foreign key constraint "salon_site_variants_site_id_fkey"' } }
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), params)
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toBe('{"error":"Не удалось удалить сайт"}')
    expect(text).not.toContain('foreign key')

    salonDb.write = { data: null, error: null }
    const ok = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), params)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
  })
})
