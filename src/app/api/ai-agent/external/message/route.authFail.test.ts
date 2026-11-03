import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCounterDbFake, type FakeDb } from '@/lib/aiAgent/counterDbFake.test-util'

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  load: vi.fn(),
  handle: vi.fn(async () => {}),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => h.db.client.from(t) }) }))
vi.mock('@/lib/aiAgent/externalApiWebhookHandler', () => ({
  loadExternalApiConnection: (...a: any[]) => h.load(...a),
  handleExternalApiIncoming: h.handle,
}))

import { POST } from './route'
import { resetPublicRouteGuards, EXTERNAL_API_AUTH_FAIL_IP_PER_MIN } from '@/lib/aiAgent/publicRouteGuards'

const GOOD = 'agk_' + 'a'.repeat(48)
const UNKNOWN = 'agk_' + 'b'.repeat(48)

function req(key = GOOD, ip = '203.0.113.5', body: unknown = { externalUserId: 'user-1', text: 'Здравствуйте' }) {
  return new Request('https://invoices.kz/api/ai-agent/external/message', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  h.db = createCounterDbFake()
  h.handle.mockClear()
  h.load.mockReset()
  h.load.mockImplementation(async (key: string) => (key === GOOD ? { connectionId: 'c1', agentId: 'agent-1' } : null))
  resetPublicRouteGuards()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai-agent/external/message -- failed-key throttle', () => {
  it('a valid key and body still reaches the handler', async () => {
    const r = await POST(req())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(h.handle).toHaveBeenCalledTimes(1)
  })

  it('401 for an unknown key, and the handler is never called', async () => {
    expect((await POST(req(UNKNOWN))).status).toBe(401)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('a flood of unknown keys from one IP is cut off before it reaches the database', async () => {
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN; i++) expect((await POST(req(UNKNOWN))).status).toBe(401)
    h.load.mockClear()
    const blocked = await POST(req(UNKNOWN))
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toBe('rate_limited')
    expect(h.load).not.toHaveBeenCalled()
  })

  it('does not block other IPs, and valid calls are not counted as failures', async () => {
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN + 1; i++) await POST(req(UNKNOWN))
    expect((await POST(req(GOOD, '198.51.100.9'))).status).toBe(200)
    // на другом адресе удачные вызовы подряд не копят счётчик отказов
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN + 10; i++) expect((await POST(req(GOOD, '192.0.2.50'))).status).toBe(200)
  })
})
