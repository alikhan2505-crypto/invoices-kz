import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Вход через WhatsApp: старт (код и ссылка на чат) и обмен токена из ссылки на вход-ссылку Supabase.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})

const h = vi.hoisted(() => ({ ctx: null as any }))

vi.mock('@supabase/supabase-js', async () => {
  const { makeLoginDb, makeFakeAdmin } = await import('@/lib/whatsappLogin/fakeLoginDb.testkit')
  const { client, tables } = makeLoginDb()
  const fake = makeFakeAdmin(tables)
  h.ctx = { tables, ...fake }
  return { createClient: () => Object.assign(client, { auth: { admin: fake.admin } }) }
})

import { POST as start } from './start/route'
import { POST as exchange } from './exchange/route'
import { claimLoginCode } from '@/lib/whatsappLogin/service'

const post = (url: string, body: unknown, ip = '1.2.3.4') => new NextRequest(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-real-ip': ip },
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  delete process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID
  delete process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER
})

describe('POST /api/auth/whatsapp/start', () => {
  it('без настроек вход выключен: 503, код не выдаётся', async () => {
    const res = await start(post('http://localhost/api/auth/whatsapp/start', {}, '9.9.9.1'))
    expect(res.status).toBe(503)
    expect((h.ctx.tables.whatsapp_login_codes ?? []).length).toBe(0)
  })

  it('с настройками выдаёт код и ссылку на чат; лишние поля метаданных отбрасываются', async () => {
    process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID = 'pn1'
    process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER = '+7 777 000 00 00'
    const res = await start(post('http://localhost/api/auth/whatsapp/start', { meta: { referral_code: 'r1', is_admin: true } }, '9.9.9.2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toMatch(/^[A-Z0-9]{8}$/)
    expect(body.url).toContain('https://wa.me/77770000000?text=')
    expect(h.ctx.tables.whatsapp_login_codes.at(-1).meta).toEqual({ referral_code: 'r1' })
  })

  it('больше 10 запросов в час с одного адреса: 429', async () => {
    process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID = 'pn1'
    process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER = '+7 777 000 00 00'
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await start(post('http://localhost/api/auth/whatsapp/start', {}, '9.9.9.3'))).status)
    expect(statuses.filter(s => s === 200)).toHaveLength(10)
    expect(statuses.slice(10)).toEqual([429, 429])
  })
})

describe('POST /api/auth/whatsapp/exchange', () => {
  it('мусорный токен: 410', async () => {
    for (const t of ['', 'short', 'x'.repeat(200), 123, null]) {
      expect((await exchange(post('http://localhost/api/auth/whatsapp/exchange', { t }, '8.8.8.1'))).status).toBe(410)
    }
  })

  it('рабочий токен меняется на вход-ссылку один раз, повтор даёт 410', async () => {
    process.env.WHATSAPP_LOGIN_PHONE_NUMBER_ID = 'pn1'
    process.env.WHATSAPP_LOGIN_DISPLAY_NUMBER = '+7 777 000 00 00'
    const startRes = await start(post('http://localhost/api/auth/whatsapp/start', {}, '9.9.9.4'))
    const { code } = await startRes.json()
    const { createClient } = await import('@supabase/supabase-js')
    const claim = await claimLoginCode(createClient('x', 'y') as any, code, '77776970406')
    expect(claim).not.toBeNull()

    const ok = await exchange(post('http://localhost/api/auth/whatsapp/exchange', { t: claim!.token }, '8.8.8.2'))
    expect(ok.status).toBe(200)
    expect((await ok.json()).url).toContain('type=magiclink')
    const again = await exchange(post('http://localhost/api/auth/whatsapp/exchange', { t: claim!.token }, '8.8.8.2'))
    expect(again.status).toBe(410)
  })
})
