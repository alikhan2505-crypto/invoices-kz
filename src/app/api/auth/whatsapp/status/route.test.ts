import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /api/auth/whatsapp/status: показывать ли кнопку; при обрыве связи тревога основателю не чаще раза в сутки.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})

const h = vi.hoisted(() => ({ conn: null as null | { accessToken: string }, alerts: [] as string[] }))

vi.mock('@supabase/supabase-js', async () => {
  const { makeLoginDb } = await import('@/lib/whatsappLogin/fakeLoginDb.testkit')
  const { client } = makeLoginDb()
  return { createClient: () => client }
})
vi.mock('@/lib/aiAgent/whatsappWebhookHandler', () => ({ loadWhatsAppConnection: async () => h.conn }))
vi.mock('@/lib/founderTelegram', () => ({ sendFounderTelegram: async (t: string) => { h.alerts.push(t); return { ok: true } } }))

import { GET } from './route'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.alerts.length = 0
  delete process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID
  delete process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER
  vi.stubGlobal('fetch', async () => new Response('{"status":"CONNECTED"}'))
})

describe('GET /api/auth/whatsapp/status', () => {
  it('вход выключен (нет настроек): available=false, тревоги нет', async () => {
    const res = await GET()
    expect((await res.json()).available).toBe(false)
    expect(h.alerts).toHaveLength(0)
  })

  it('связь жива: available=true, ответ можно кэшировать, тревоги нет', async () => {
    process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID = 'pn1'
    process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER = '+7 777 000 00 00'
    h.conn = { accessToken: 'x' }
    const res = await GET()
    expect((await res.json()).available).toBe(true)
    expect(res.headers.get('cache-control')).toContain('s-maxage')
    expect(h.alerts).toHaveLength(0)
  })

  it('связь потеряна: available=false и ровно одна тревога в сутки', async () => {
    process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID = 'pn1'
    process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER = '+7 777 000 00 00'
    h.conn = null
    for (let i = 0; i < 3; i++) expect((await (await GET()).json()).available).toBe(false)
    expect(h.alerts).toHaveLength(1)
    expect(h.alerts[0]).toContain('Вход через WhatsApp не работает')
  })
})
