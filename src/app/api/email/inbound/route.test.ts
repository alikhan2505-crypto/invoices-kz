import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

// Вебхук Resend email.received: токен в адресе, а при заданном RESEND_WEBHOOK_SECRET ещё и подпись Svix.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const h = vi.hoisted(() => ({
  upserts: [] as Record<string, unknown>[],
  upsertError: null as { message: string } | null,
  telegram: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => { h.upserts.push(row); return { error: h.upsertError } },
    }),
  }),
}))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: h.telegram }))

import { POST } from './route'

const TOKEN = 'inbound-token'
const SIGNING_KEY = Buffer.from('0123456789abcdef0123456789abcdef')
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString('base64')}`
const BODY = JSON.stringify({ type: 'email.received', data: { email_id: 'e1', from: 'a@b.kz', to: ['support@invoices.kz'], subject: 'Re: счёт', text: 'Спасибо' } })

function req(body: string, opts: { token?: string | null; signed?: boolean; ts?: number } = {}) {
  const url = new URL('http://localhost/api/email/inbound')
  if (opts.token !== null) url.searchParams.set('token', opts.token ?? TOKEN)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.signed) {
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000))
    headers['svix-id'] = 'msg_1'
    headers['svix-timestamp'] = ts
    headers['svix-signature'] = `v1,${createHmac('sha256', SIGNING_KEY).update(`msg_1.${ts}.${body}`).digest('base64')}`
  }
  return new NextRequest(url, { method: 'POST', headers, body })
}

beforeEach(() => {
  process.env.INBOUND_EMAIL_SECRET = TOKEN
  delete process.env.RESEND_WEBHOOK_SECRET
  process.env.TELEGRAM_CHAT_ID = '42'
  h.upserts = []
  h.upsertError = null
  h.telegram.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('POST /api/email/inbound', () => {
  it('stores the reply and notifies when the token is right (no signing secret configured: as before)', async () => {
    const res = await POST(req(BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, stored: true })
    expect(h.upserts).toHaveLength(1)
    expect(h.telegram).toHaveBeenCalledTimes(1)
  })

  it('401 on a wrong or missing token, nothing stored', async () => {
    expect((await POST(req(BODY, { token: 'nope' }))).status).toBe(401)
    expect((await POST(req(BODY, { token: null }))).status).toBe(401)
    expect(h.upserts).toHaveLength(0)
  })

  it('500 when the token is not configured at all', async () => {
    delete process.env.INBOUND_EMAIL_SECRET
    expect((await POST(req(BODY))).status).toBe(500)
  })

  it('with RESEND_WEBHOOK_SECRET set, a correctly signed request goes through', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SIGNING_SECRET
    const res = await POST(req(BODY, { signed: true }))
    expect(res.status).toBe(200)
    expect(h.upserts).toHaveLength(1)
  })

  it('with RESEND_WEBHOOK_SECRET set, an unsigned, wrongly signed or replayed request is refused even with the right token', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SIGNING_SECRET
    expect((await POST(req(BODY))).status).toBe(401)
    const replay = await POST(req(BODY, { signed: true, ts: Math.floor(Date.now() / 1000) - 3600 }))
    expect(replay.status).toBe(401)
    expect(h.upserts).toHaveLength(0)
  })

  it('a body changed after signing is refused', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SIGNING_SECRET
    const good = req(BODY, { signed: true })
    const tampered = new NextRequest(good.url, { method: 'POST', headers: good.headers, body: BODY.replace('Спасибо', 'Подмена') })
    expect((await POST(tampered)).status).toBe(401)
    expect(h.upserts).toHaveLength(0)
  })

  it('invalid JSON: 400; events other than email.received are acknowledged and ignored', async () => {
    expect((await POST(req('not json'))).status).toBe(400)
    const ignored = await POST(req(JSON.stringify({ type: 'email.sent', data: {} })))
    expect(await ignored.json()).toEqual({ ok: true, ignored: true })
    expect(h.upserts).toHaveLength(0)
  })

  it('a storage failure answers 500 without the database error text', async () => {
    h.upsertError = { message: 'relation "inbound_emails" violates something secret' }
    const res = await POST(req(BODY))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"Storage failed"}')
  })
})
