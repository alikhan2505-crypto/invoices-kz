import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/aiAgent/connection', () => ({ getKey: () => 'k' }))
vi.mock('@/lib/kaspiPay/crypto', () => ({ encryptAtRest: () => '', decryptAtRest: () => Buffer.from('') }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

import { sendInstagramTextMessage, InstagramApiError } from './instagram'

const TOKEN = 'IGAA-SECRET-TOKEN-123'
const creds = { igUserId: 'ig1', accessToken: TOKEN }

afterEach(() => { vi.unstubAllGlobals() })

describe('sendInstagramTextMessage (напоминание после КОНТРАГЕНТ)', () => {
  it('обычный текст; токен только в заголовке Authorization, не в URL и не в теле', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ recipient_id: 'u1', message_id: 'm1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await sendInstagramTextMessage('u1', 'Привет', creds)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.instagram.com/v21.0/ig1/messages')
    expect(url).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.method).toBe('POST')
    expect(String(init.body)).not.toContain(TOKEN)
    expect(String(init.body)).not.toContain('access_token')
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { id: 'u1' }, message: { text: 'Привет' } })
  })

  it('отказ Meta (окно закрыто): InstagramApiError с статусом и кодами, без токена', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Outside of allowed window', code: 10, error_subcode: 2534022 } }), { status: 400 })))
    const err = await sendInstagramTextMessage('u1', 'Привет', creds).catch(e => e)
    expect(err).toBeInstanceOf(InstagramApiError)
    expect(err.status).toBe(400)
    expect(err.metaCode).toBe(10)
    expect(err.metaSubcode).toBe(2534022)
    expect(err.message).toBe('Outside of allowed window (code 10, subcode 2534022)')
    expect(err.message).not.toContain(TOKEN)
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
    log.mockRestore()
  })

  it('сеть/таймаут: status 0, токена в тексте нет', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { const e = new Error(`fetch failed ${TOKEN}`); e.name = 'TimeoutError'; throw e }))
    const err = await sendInstagramTextMessage('u1', 'Привет', creds).catch(e => e)
    expect(err).toBeInstanceOf(InstagramApiError)
    expect(err.status).toBe(0)
    expect(err.message).not.toContain(TOKEN)
  })
})
