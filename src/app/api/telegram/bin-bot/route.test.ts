import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Проверяем только входную дверь бота: без секретов 503, чужой заголовок 401, не-личные чаты
// и боты принимаются молча (200) без обработки. Саму проверку БИН и ответ покрывают
// src/lib/binBot/format.test.ts и тесты performBinLookup.

const URL_ = 'https://x.test/api/telegram/bin-bot'

function req(body: unknown, secret?: string): NextRequest {
  return new NextRequest(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
    body: JSON.stringify(body),
  })
}

async function loadRoute() {
  vi.resetModules()
  return await import('./route')
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('POST /api/telegram/bin-bot', () => {
  it('без токена и секрета отвечает 503 и ничего не делает', async () => {
    vi.stubEnv('TELEGRAM_BIN_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_BIN_BOT_SECRET', '')
    const { POST } = await loadRoute()
    const res = await POST(req({ message: {} }, 'anything'))
    expect(res.status).toBe(503)
  })

  it('чужой или отсутствующий заголовок секрета: 401', async () => {
    vi.stubEnv('TELEGRAM_BIN_BOT_TOKEN', '123:abc')
    vi.stubEnv('TELEGRAM_BIN_BOT_SECRET', 'right-secret')
    const { POST } = await loadRoute()
    expect((await POST(req({ message: {} }))).status).toBe(401)
    expect((await POST(req({ message: {} }, 'wrong-secret'))).status).toBe(401)
    expect((await POST(req({ message: {} }, 'right-secre'))).status).toBe(401)
  })

  it('группы, каналы и боты принимаются молча (200) без отправки', async () => {
    vi.stubEnv('TELEGRAM_BIN_BOT_TOKEN', '123:abc')
    vi.stubEnv('TELEGRAM_BIN_BOT_SECRET', 'right-secret')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { POST } = await loadRoute()
    const group = { message: { text: '123456789012', chat: { id: 1, type: 'group' }, from: { id: 2, is_bot: false } } }
    const bot = { message: { text: '123456789012', chat: { id: 1, type: 'private' }, from: { id: 2, is_bot: true } } }
    expect((await POST(req(group, 'right-secret'))).status).toBe(200)
    expect((await POST(req(bot, 'right-secret'))).status).toBe(200)
    expect((await POST(req({ edited_message: {} }, 'right-secret'))).status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
