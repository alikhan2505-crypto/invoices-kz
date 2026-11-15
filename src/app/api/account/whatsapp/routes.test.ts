import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Привязка WhatsApp к аккаунту из профиля: состояние, начало, подтверждение, отвязка.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({ ctx: null as any, conn: { accessToken: 'x' } as null | { accessToken: string } }))

vi.mock('@supabase/supabase-js', async () => {
  const { makeLoginDb } = await import('@/lib/whatsappLogin/fakeLoginDb.testkit')
  const tables: Record<string, any[]> = {}
  const { client } = makeLoginDb(tables)
  h.ctx = { tables }
  const users: Record<string, any> = {
    'tok-me': { id: 'u-me', email: 'me@mail.kz' },
    'tok-me2': { id: 'u-me2', email: 'me2@mail.kz' },
    'tok-wa': { id: 'u-wa', email: 'wa77001112233@wa.invalid' },
  }
  return { createClient: () => Object.assign(client, { auth: { getUser: async (t: string) => ({ data: { user: users[t] ?? null } }) } }) }
})
vi.mock('@/lib/aiAgent/whatsappWebhookHandler', () => ({ loadWhatsAppConnection: async () => h.conn }))

import { GET, DELETE } from './route'
import { POST as start } from './link/start/route'
import { POST as confirm } from './link/confirm/route'
import { claimLinkCode } from '@/lib/whatsappLogin/link'
import { createClient } from '@supabase/supabase-js'

const req = (method: string, body?: unknown, token: string | null = 'tok-me') => new NextRequest('http://localhost/api/account/whatsapp', {
  method,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.conn = { accessToken: 'x' }
  process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID = 'pn1'
  process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER = '+7 777 000 00 00'
})

describe('GET/DELETE /api/account/whatsapp', () => {
  it('без входа 401', async () => {
    expect((await GET(req('GET', undefined, null))).status).toBe(401)
    expect((await DELETE(req('DELETE', undefined, null))).status).toBe(401)
  })

  it('состояние: не привязан → привязан (с маской) → отвязка', async () => {
    const db = createClient('x', 'y') as any
    expect(await (await GET(req('GET'))).json()).toMatchObject({ enabled: true, linked: false, phone: null })
    db.from('whatsapp_identities').insert({ wa_id: '77001112299', user_id: 'u-me' }).then(() => {})
    const linked = await (await GET(req('GET'))).json()
    expect(linked).toMatchObject({ linked: true, phone: '+7•••2299', canUnlink: true })
    expect((await DELETE(req('DELETE'))).status).toBe(200)
    expect((await (await GET(req('GET'))).json()).linked).toBe(false)
  })

  it('вход выключен: enabled=false', async () => {
    delete process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID
    expect((await (await GET(req('GET', undefined, 'tok-me2'))).json()).enabled).toBe(false)
  })

  it('вошедшему по WhatsApp (служебная почта) отвязывать нельзя: единственный вход', async () => {
    expect((await DELETE(req('DELETE', undefined, 'tok-wa'))).status).toBe(409)
  })
})

describe('POST /api/account/whatsapp/link/*', () => {
  it('start: без входа 401; вошедшему по WhatsApp 400; выключено 503; нет связи 503', async () => {
    expect((await start(req('POST', {}, null))).status).toBe(401)
    expect((await start(req('POST', {}, 'tok-wa'))).status).toBe(400)
    h.conn = null
    expect((await start(req('POST', {}, 'tok-me2'))).status).toBe(503)
    h.conn = { accessToken: 'x' }
    delete process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID
    expect((await start(req('POST', {}, 'tok-me2'))).status).toBe(503)
  })

  it('полный путь: start → сообщение → confirm привязывает номер', async () => {
    const res = await start(req('POST', {}, 'tok-me2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toContain('https://wa.me/77770000000?text=')
    expect(decodeURIComponent(body.url)).toMatch(/Привязать [A-Z0-9]{8}/)
    const code = decodeURIComponent(body.url).match(/Привязать ([A-Z0-9]{8})/)![1]

    const db = createClient('x', 'y') as any
    const claim = await claimLinkCode(db, code, '77005556677')
    expect(claim).not.toBeNull()

    expect((await confirm(req('POST', { code: '12' }, 'tok-me2'))).status).toBe(400)
    const ok = await confirm(req('POST', { code: claim!.confirm }, 'tok-me2'))
    expect(ok.status).toBe(200)
    expect((await ok.json()).phone).toBe('+7•••6677')
    expect((await (await GET(req('GET', undefined, 'tok-me2'))).json()).linked).toBe(true)
    // второй старт: уже привязан
    expect((await start(req('POST', {}, 'tok-me2'))).status).toBe(409)
  })

  it('confirm: чужой человек без кода начатой привязки получает 410', async () => {
    expect((await confirm(req('POST', { code: '123456' }, 'tok-me'))).status).toBe(410)
  })
})
