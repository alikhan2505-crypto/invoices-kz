import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ calls: [] as { url: string; method?: string; body?: any }[], hasConn: true }))

vi.mock('@/lib/aiAgent/webhookHandler', () => ({
  loadTenantConnectionByAgentId: async () => (h.hasConn ? { connectionId: 'c', agentId: 'a', externalAccountId: 'ig1', accessToken: 'tok' } : null),
}))

import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from './route'

const req = (method: string, body?: any, headers: Record<string, string> = { 'x-internal-secret': 's3cret' }, qs = '') =>
  new NextRequest('http://localhost/api/instagram/ice-breakers' + qs, { method, headers, body: body ? JSON.stringify(body) : undefined })

beforeEach(() => {
  process.env.IG_AUTOMATION_SECRET = 's3cret'
  h.calls = []
  h.hasConn = true
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    h.calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) }
  }))
})

describe('/api/instagram/ice-breakers', () => {
  it('без секрета или с чужим -- 401, к Meta не ходит', async () => {
    expect((await POST(req('POST', { agentId: 'a' }, {}))).status).toBe(401)
    expect((await POST(req('POST', { agentId: 'a' }, { 'x-internal-secret': 'wrong' }))).status).toBe(401)
    expect((await GET(req('GET', undefined, {}, '?agentId=a'))).status).toBe(401)
    expect((await DELETE(req('DELETE', { agentId: 'a', confirm: true }, {}))).status).toBe(401)
    expect(h.calls).toHaveLength(0)
  })

  it('POST без confirm -- сухой прогон: показывает тело, к Meta НЕ обращается', async () => {
    const res = await POST(req('POST', { agentId: 'a', subscribePostbacks: true }))
    const json = await res.json()
    expect(json.dryRun).toBe(true)
    expect(json.willSet.ice_breakers[0].call_to_actions).toHaveLength(4)
    expect(json.willSubscribe).toEqual(['comments', 'messages', 'messaging_postbacks'])
    expect(h.calls).toHaveLength(0)
  })

  it('POST с confirm: ставит вопросы и подписывает аккаунт на messaging_postbacks', async () => {
    const res = await POST(req('POST', { agentId: 'a', confirm: true, subscribePostbacks: true }))
    expect(res.status).toBe(200)
    expect(h.calls[0].url).toBe('https://graph.instagram.com/v21.0/ig1/messenger_profile?access_token=tok')
    expect(h.calls[0].method).toBe('POST')
    expect(h.calls[0].body.platform).toBe('instagram')
    expect(h.calls[0].body).not.toHaveProperty('access_token')
    expect(h.calls[0].body.ice_breakers[0]).not.toHaveProperty('locale')
    expect(h.calls[1].url).toContain('/me/subscribed_apps?subscribed_fields=comments%2Cmessages%2Cmessaging_postbacks')
  })

  it('POST с confirm без subscribePostbacks -- подписку не трогает', async () => {
    await POST(req('POST', { agentId: 'a', confirm: true }))
    expect(h.calls).toHaveLength(1)
  })

  it('плохие вопросы -- 400, нет подключения -- 404', async () => {
    expect((await POST(req('POST', { agentId: 'a', confirm: true, items: [] }))).status).toBe(400)
    h.hasConn = false
    expect((await POST(req('POST', { agentId: 'a' }))).status).toBe(404)
  })

  it('DELETE без confirm -- ничего; с confirm -- DELETE messenger_profile', async () => {
    await DELETE(req('DELETE', { agentId: 'a' }))
    expect(h.calls).toHaveLength(0)
    await DELETE(req('DELETE', { agentId: 'a', confirm: true }))
    expect(h.calls[0].method).toBe('DELETE')
    expect(h.calls[0].body.fields).toEqual(['ice_breakers'])
  })

  it('GET читает вопросы и подписанные поля (только чтение)', async () => {
    const res = await GET(req('GET', undefined, { 'x-internal-secret': 's3cret' }, '?agentId=a'))
    expect(res.status).toBe(200)
    expect(h.calls.every(c => c.method === undefined || c.method === 'GET')).toBe(true)
    expect(h.calls).toHaveLength(2)
  })
})
