import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { salonDb } from '@/app/api/salon-sites/fakeServiceDb.test-util'

// Подтягивание данных из 2ГИС (только админ): кривое тело - 400; в ответ уходят
// только сообщения про ссылку, внутренние (ключ API, статусы) - в лог (аудит 02.11.2026, раздел 4).
const h = vi.hoisted(() => ({ fetch2gis: vi.fn() }))
vi.mock('@/lib/salonSites/adminAuth', async () => {
  const { salonDb: db } = await import('@/app/api/salon-sites/fakeServiceDb.test-util')
  return { requireAdmin: async () => db.admin, serviceSupabase: db.client }
})
vi.mock('@/lib/salonSites/fetch2gis', () => ({ fetch2gisPlace: h.fetch2gis }))

import { POST } from './route'

const post = (raw: string) => POST(new NextRequest('http://localhost/api/salon-sites/fetch-2gis', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
}))

beforeEach(() => {
  salonDb.reset()
  h.fetch2gis.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/salon-sites/fetch-2gis', () => {
  it('кривое тело (не JSON, пустое, не объект, url не строка): 400 bad_url, 2ГИС не вызывается', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{"url":123}', '{"url":"   "}']) {
      const res = await post(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_url' })
    }
    expect(h.fetch2gis).not.toHaveBeenCalled()
  })

  it('успех как раньше', async () => {
    h.fetch2gis.mockResolvedValue({ name: 'Лотос' })
    const res = await post('{"url":"https://2gis.kz/almaty/firm/1"}')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ place: { name: 'Лотос' } })
  })

  it('сообщения про саму ссылку админ видит как есть', async () => {
    for (const msg of ['не удалось распознать ID организации в этой ссылке 2ГИС', 'организация не найдена в 2ГИС по этой ссылке']) {
      h.fetch2gis.mockRejectedValue(new Error(msg))
      const res = await post('{"url":"https://2gis.kz/x"}')
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: msg })
    }
  })

  it('внутренние сообщения (нет ключа API, статус ответа 2ГИС) уходят только в лог, админу - общий текст', async () => {
    for (const msg of [
      '2ГИС API не настроен: нет TWO_GIS_API_KEY (получите demo-ключ на dev.2gis.ru)',
      '2ГИС API вернул ошибку (403)',
      'fetch failed: connect ECONNREFUSED 10.0.0.5:443',
    ]) {
      h.fetch2gis.mockRejectedValue(new Error(msg))
      const res = await post('{"url":"https://2gis.kz/x"}')
      expect(res.status).toBe(502)
      const text = JSON.stringify(await res.json())
      expect(text).toBe('{"error":"не удалось получить данные из 2ГИС"}')
      expect(text).not.toContain('TWO_GIS_API_KEY')
      expect(text).not.toContain('ECONNREFUSED')
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('fetch-2gis'), msg)
    }
  })

  it('исключение не Error: общий текст, без падения', async () => {
    h.fetch2gis.mockRejectedValue('строка-сбоя')
    const res = await post('{"url":"https://2gis.kz/x"}')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'не удалось получить данные из 2ГИС' })
  })
})
