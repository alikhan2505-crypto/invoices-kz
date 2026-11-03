import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  conversation: { id: 'conv-1' } as { id: string } | null,
  rows: [] as any[],
  queryError: null as null | { message: string },
  load: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from() {
      const b: any = {
        select() { return b },
        eq() { return b },
        gt() { return b },
        order() { return b },
        maybeSingle: async () => ({ data: h.conversation, error: null }),
        then(res: any, rej: any) {
          return Promise.resolve(h.queryError ? { data: null, error: h.queryError } : { data: h.rows, error: null }).then(res, rej)
        },
      }
      return b
    },
  }),
}))
vi.mock('@/lib/aiAgent/externalApiWebhookHandler', () => ({
  loadExternalApiConnection: (...a: any[]) => h.load(...a),
}))

import { GET } from './route'
import { resetPublicRouteGuards, EXTERNAL_API_AUTH_FAIL_IP_PER_MIN } from '@/lib/aiAgent/publicRouteGuards'

const GOOD = 'agk_' + 'a'.repeat(48)
const UNKNOWN = 'agk_' + 'b'.repeat(48)

function req(key = GOOD, ip = '203.0.113.5', userId = 'user-1', since?: string) {
  const u = new URL('https://invoices.kz/api/ai-agent/external/messages')
  u.searchParams.set('externalUserId', userId)
  if (since) u.searchParams.set('since', since)
  const r: any = new Request(u, { headers: { 'x-forwarded-for': ip, authorization: `Bearer ${key}` } })
  r.nextUrl = u
  return r
}

beforeEach(() => {
  h.conversation = { id: 'conv-1' }
  h.rows = [{ id: 'm1', direction: 'outbound', text: 'Hi', buttons: null, image_url: null, created_at: '2026-11-03T10:00:00Z' }]
  h.queryError = null
  h.load.mockReset()
  h.load.mockImplementation(async (key: string) => (key === GOOD ? { connectionId: 'c1', agentId: 'agent-1' } : null))
  resetPublicRouteGuards()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/ai-agent/external/messages', () => {
  it('keeps the success shape', async () => {
    const r = await GET(req())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      messages: [{ id: 'm1', direction: 'outbound', text: 'Hi', buttons: null, imageUrl: null, createdAt: '2026-11-03T10:00:00Z' }],
    })
  })

  it('rejects a garbage since with 400 and accepts a real createdAt', async () => {
    for (const since of ['garbage', '2026-13-45T99:99', "' or 1=1 --", '12345', '2026-02-30T10:00:00Z', '2026-11-03 10:00 (x)']) {
      const r = await GET(req(GOOD, '203.0.113.5', 'user-1', since))
      expect(r.status, since).toBe(400)
      expect(await r.json()).toEqual({ error: 'invalid_request' })
    }
    expect((await GET(req(GOOD, '203.0.113.5', 'user-1', '2026-11-03T10:00:00Z'))).status).toBe(200)
  })

  it('400 on a malformed key, 401 on an unknown one', async () => {
    expect((await GET(req('nope'))).status).toBe(400)
    expect((await GET(req(UNKNOWN))).status).toBe(401)
  })

  it('a flood of unknown keys from one IP is cut off before it reaches the database', async () => {
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN; i++) expect((await GET(req(UNKNOWN))).status).toBe(401)
    h.load.mockClear()
    const blocked = await GET(req(UNKNOWN))
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toBe('rate_limited')
    expect(h.load).not.toHaveBeenCalled()
  })

  it('successful polls never count: a busy integration is not throttled', async () => {
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN * 10; i++) expect((await GET(req(GOOD))).status).toBe(200)
  })

  it('other IPs are not affected by one IP failing', async () => {
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN + 1; i++) await GET(req(UNKNOWN))
    expect((await GET(req(GOOD, '198.51.100.9'))).status).toBe(200)
  })

  it('malformed keys are not counted as failures (they never reached the database anyway)', async () => {
    for (let i = 0; i < EXTERNAL_API_AUTH_FAIL_IP_PER_MIN * 2; i++) await GET(req('nope'))
    expect((await GET(req(GOOD))).status).toBe(200)
  })

  it('does not leak the database error text', async () => {
    h.queryError = { message: 'column "api_secret" of relation "ai_agent_messages" does not exist' }
    const r = await GET(req())
    expect(r.status).toBe(500)
    const text = JSON.stringify(await r.json())
    expect(text).toBe('{"error":"unavailable"}')
    expect(console.error).toHaveBeenCalled()
  })
})
