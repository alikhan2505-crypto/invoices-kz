import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Привязка почты к аккаунту, созданному входом через WhatsApp: код на адрес и проверка кода.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
})

const h = vi.hoisted(() => ({ ctx: null as any, sent: [] as any[], sendError: null as any }))

vi.mock('@supabase/supabase-js', async () => {
  const { makeLoginDb, makeFakeAdmin } = await import('@/lib/whatsappLogin/fakeLoginDb.testkit')
  const tables: Record<string, any[]> = { profiles: [{ id: 'u-wa', email: null }, { id: 'u-wa2', email: null }] }
  const { client } = makeLoginDb(tables, { auth_user_id_by_email: () => null })
  const fake = makeFakeAdmin(tables)
  fake.users.push({ id: 'u-wa', email: 'wa77001112233@wa.invalid', user_metadata: {} }, { id: 'u-wa2', email: 'wa77004445566@wa.invalid', user_metadata: {} })
  h.ctx = { tables, ...fake }
  const users: Record<string, any> = {
    'tok-wa': { id: 'u-wa', email: 'wa77001112233@wa.invalid' },
    'tok-wa2': { id: 'u-wa2', email: 'wa77004445566@wa.invalid' },
    'tok-real': { id: 'u-real', email: 'real@mail.kz' },
  }
  return {
    createClient: () => Object.assign(client, {
      auth: { admin: fake.admin, getUser: async (t: string) => ({ data: { user: users[t] ?? null } }) },
    }),
  }
})
vi.mock('resend', () => ({
  Resend: class { emails = { send: async (m: any) => { h.sent.push(m); return { error: h.sendError } } } },
}))

import { POST as start } from './start/route'
import { POST as verify } from './verify/route'

const post = (url: string, body: unknown, token: string | null = 'tok-wa', ip = '5.5.5.5') => new NextRequest(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})
const S = 'http://localhost/api/account/email/start'
const V = 'http://localhost/api/account/email/verify'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.sent.length = 0
  h.sendError = null
  delete process.env.RESEND_READ_API_KEY
})

describe('POST /api/account/email/start', () => {
  it('без входа 401; обычному аккаунту (с настоящей почтой) 400 not_needed', async () => {
    expect((await start(post(S, { email: 'a@b.kz' }, null, '5.5.0.1'))).status).toBe(401)
    const r = await start(post(S, { email: 'a@b.kz' }, 'tok-real', '5.5.0.2'))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('not_needed')
    expect(h.sent).toHaveLength(0)
  })

  it('кривой адрес и служебный адрес отклоняются', async () => {
    for (const email of ['nope', '', 'x@wa.invalid', 123, null]) {
      expect((await start(post(S, { email }, 'tok-wa', '5.5.0.3'))).status).toBe(400)
    }
    expect(h.sent).toHaveLength(0)
  })

  it('нормальный адрес: письмо с 6-значным кодом уходит, код в базе только хешем', async () => {
    const r = await start(post(S, { email: 'New@Mail.kz' }, 'tok-wa', '5.5.0.4'))
    expect(r.status).toBe(200)
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].to).toBe('new@mail.kz')
    const code = h.sent[0].subject.match(/\d{6}/)![0]
    expect(h.sent[0].html).toContain(code)
    expect(JSON.stringify(h.ctx.tables.email_claim_codes)).not.toContain(code)
  })

  it('сбой отправки: 502 без подробностей', async () => {
    h.sendError = { message: 'domain is not verified' }
    const r = await start(post(S, { email: 'fail@mail.kz' }, 'tok-wa', '5.5.0.5'))
    expect(r.status).toBe(502)
    expect(JSON.stringify(await r.json())).not.toContain('domain')
  })

  it('больше 3 кодов в сутки на один адрес: 429', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await start(post(S, { email: 'many@mail.kz' }, 'tok-wa', `5.5.1.${i}`))).status)
    expect(statuses.filter(s => s === 200)).toHaveLength(3)
    expect(statuses.slice(3)).toEqual([429, 429])
  })
})

describe('POST /api/account/email/verify', () => {
  it('полный путь: код из письма делает адрес почтой аккаунта', async () => {
    await start(post(S, { email: 'full@mail.kz' }, 'tok-wa2', '5.5.2.1'))
    const code = h.sent.at(-1).subject.match(/\d{6}/)![0]
    const wrong = await verify(post(V, { email: 'full@mail.kz', code: code === '000000' ? '111111' : '000000' }, 'tok-wa2', '5.5.2.2'))
    expect(wrong.status).toBe(400)
    const ok = await verify(post(V, { email: 'full@mail.kz', code }, 'tok-wa2', '5.5.2.2'))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true, mode: 'attached' })
    expect(h.ctx.users.find((u: any) => u.id === 'u-wa2').email).toBe('full@mail.kz')
  })

  it('без входа 401, чужому обычному аккаунту 400, мусор во входных данных 400', async () => {
    expect((await verify(post(V, { email: 'a@b.kz', code: '123456' }, null, '5.5.3.1'))).status).toBe(401)
    expect((await verify(post(V, { email: 'a@b.kz', code: '123456' }, 'tok-real', '5.5.3.2'))).status).toBe(400)
    expect((await verify(post(V, { email: 'a@b.kz', code: '12' }, 'tok-wa', '5.5.3.3'))).status).toBe(400)
    expect((await verify(post(V, { email: 'bad', code: '123456' }, 'tok-wa', '5.5.3.4'))).status).toBe(400)
  })
})
