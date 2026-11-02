import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  tokens: {} as Record<string, { id: string; email: string }>,
  admins: {} as Record<string, boolean>,
  claim: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async (t: string) => ({ data: { user: h.tokens[t] ?? null } }) },
    from: () => ({ select: () => ({ eq: (_c: string, id: string) => ({ single: async () => ({ data: { is_admin: h.admins[id] === true } }) }) }) }),
  }),
}))
vi.mock('@/lib/windowLimits', async (orig) => ({ ...(await orig<typeof import('@/lib/windowLimits')>()), claimWindowSlot: h.claim }))

import { POST } from './route'

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const sent = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(String(fetchMock.mock.calls[0][1].body)).text as string

describe('/api/telegram', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    h.tokens = { tok: { id: 'u1', email: 'real@example.com' }, adm: { id: 'a1', email: 'boss@example.com' } }
    h.admins = { a1: true }
    h.claim.mockReset()
    h.claim.mockResolvedValue({ ok: true, used: 1 })
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot')
    vi.stubEnv('TELEGRAM_CHAT_ID', '1')
    vi.stubEnv('INTERNAL_API_SECRET', 'secret')
  })

  it('без токена: 401, ничего не отправлено', async () => {
    expect((await POST(post({ event: 'signup' }))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signup: почта берётся у аккаунта, присланная в теле игнорируется; текст экранируется', async () => {
    const res = await POST(post({ event: 'signup', email: 'fake@evil.example', refCode: '<b>x</b>' }, { authorization: 'Bearer tok' }))
    expect(res.status).toBe(200)
    const text = sent(fetchMock)
    expect(text).toContain('real@example.com')
    expect(text).not.toContain('fake@evil.example')
    expect(text).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('signup: лимит 3 в сутки на аккаунт; при исчерпании или сбое счётчика молчим, Telegram не трогаем, странице «ок»', async () => {
    h.claim.mockResolvedValue({ ok: false, reason: 'limit' })
    const res = await POST(post({ event: 'signup' }, { authorization: 'Bearer tok' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
    h.claim.mockResolvedValue({ ok: false, reason: 'error' })
    expect((await POST(post({ event: 'signup' }, { authorization: 'Bearer tok' }))).status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.claim.mock.calls[0][2]).toBe(3)
    expect(String(h.claim.mock.calls[0][1])).toMatch(/^tg-signup:/)
  })

  it('plan_activated: только админ', async () => {
    expect((await POST(post({ event: 'plan_activated', email: 'x@example.com', plan: 'pro' }, { authorization: 'Bearer tok' }))).status).toBe(403)
    expect((await POST(post({ event: 'plan_activated', email: 'x@example.com', plan: 'pro' }, { authorization: 'Bearer adm' }))).status).toBe(200)
    expect(sent(fetchMock)).toContain('Про')
  })

  it('неизвестное событие: 400; произвольный текст от пользователя не принимается', async () => {
    expect((await POST(post({ event: 'custom', message: 'hi' }, { authorization: 'Bearer tok' }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('внутренний вызов с секретом отправляет готовое сообщение без лимита', async () => {
    const res = await POST(post({ message: 'внутреннее' }, { 'x-internal-secret': 'secret' }))
    expect(res.status).toBe(200)
    expect(sent(fetchMock)).toBe('внутреннее')
    expect(h.claim).not.toHaveBeenCalled()
    expect((await POST(post({ message: 'x' }, { 'x-internal-secret': 'wrong' }))).status).toBe(401)
  })
})
