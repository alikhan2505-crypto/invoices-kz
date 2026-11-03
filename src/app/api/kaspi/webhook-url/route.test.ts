import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Адрес webhook по умолчанию: кривое тело или не-строка в url дают 400, а не 500 (аудит 02.11.2026).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})
const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  updated: [] as Record<string, unknown>[],
  updateError: null as { message: string } | null,
  safe: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      update: (row: Record<string, unknown>) => {
        h.updated.push(row)
        return { eq: async () => ({ error: h.updateError }) }
      },
    }),
  }),
}))
vi.mock('@/lib/kaspiPay/webhookSafety', () => ({ isSafeWebhookUrl: h.safe }))

import { POST } from './route'

const call = (body: unknown, auth: string | null = 'Bearer tok') => POST(new NextRequest('http://localhost/api/kaspi/webhook-url', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}))

beforeEach(() => {
  h.user = { id: 'u1' }
  h.updated = []
  h.updateError = null
  h.safe.mockReset()
  h.safe.mockResolvedValue(true)
})

describe('POST /api/kaspi/webhook-url', () => {
  it('без токена: 401', async () => {
    h.user = null
    expect((await call({ url: 'https://shop.kz/hook' }, null)).status).toBe(401)
    expect(h.updated).toHaveLength(0)
  })

  it('сохраняет безопасный адрес', async () => {
    const res = await call({ url: 'https://shop.kz/hook' })
    expect(res.status).toBe(200)
    expect(h.updated).toEqual([{ default_webhook_url: 'https://shop.kz/hook' }])
  })

  it('очищает адрес только явный url: "" или url: null', async () => {
    expect((await call({ url: '' })).status).toBe(200)
    expect((await call({ url: null })).status).toBe(200)
    expect(h.updated).toEqual([{ default_webhook_url: null }, { default_webhook_url: null }])
    expect(h.safe).not.toHaveBeenCalled()
  })

  it('кривое тело (не JSON, пустое, null, массив, объект без url): 400 invalid_body и сохранённый адрес не трогается', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '123', '{}', '{"other":1}']) {
      const res = await call(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json(), raw).toEqual({ error: 'invalid_body' })
    }
    expect(h.updated).toHaveLength(0)
  })

  it('url не строка: 400 unsafe_url, база не трогается', async () => {
    for (const url of [123, { a: 1 }, ['https://shop.kz'], true]) {
      const res = await call({ url })
      expect(res.status, JSON.stringify(url)).toBe(400)
      expect(await res.json()).toEqual({ error: 'unsafe_url' })
    }
    expect(h.updated).toHaveLength(0)
    expect(h.safe).not.toHaveBeenCalled()
  })

  it('небезопасный адрес: 400 unsafe_url', async () => {
    h.safe.mockResolvedValue(false)
    const res = await call({ url: 'http://169.254.169.254/' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unsafe_url' })
    expect(h.updated).toHaveLength(0)
  })

  it('сбой базы: 500 save_failed без текста ошибки', async () => {
    h.updateError = { message: 'column "default_webhook_url" of relation "kaspi_connections"' }
    const res = await call({ url: 'https://shop.kz/hook' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"save_failed"}')
  })
})
