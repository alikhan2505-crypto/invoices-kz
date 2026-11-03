import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  conversation: { id: 'conv-1' } as { id: string } | null,
  rows: [] as any[],
  queryError: null as null | { message: string },
  queries: [] as string[],
  load: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      h.queries.push(table)
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
vi.mock('@/lib/aiAgent/websiteWebhookHandler', () => ({
  loadWebsiteConnection: (...a: any[]) => h.load(...a),
}))

import { GET } from './route'
import { resetPublicRouteGuards, WIDGET_POLL_IP_PER_MIN } from '@/lib/aiAgent/publicRouteGuards'

const KEY = 'wgt_' + 'a'.repeat(24)
const VISITOR = '3f2b8c1e-9a4d-4e7b-8c11-0a1b2c3d4e5f'

function req(over: { key?: string; visitor?: string; since?: string } = {}, ip = '203.0.113.5') {
  const u = new URL('https://invoices.kz/api/ai-agent/widget/messages')
  u.searchParams.set('widgetKey', over.key ?? KEY)
  u.searchParams.set('visitorId', over.visitor ?? VISITOR)
  if (over.since) u.searchParams.set('since', over.since)
  const r: any = new Request(u, { headers: { 'x-forwarded-for': ip } })
  r.nextUrl = u
  return r
}

beforeEach(() => {
  h.conversation = { id: 'conv-1' }
  h.rows = [{ id: 'm1', direction: 'outbound', text: 'Привет', buttons: null, image_url: null, created_at: '2026-11-03T10:00:00Z' }]
  h.queryError = null
  h.queries.length = 0
  h.load.mockReset()
  h.load.mockResolvedValue({ connectionId: 'c1', agentId: 'agent-1', widgetKey: KEY })
  resetPublicRouteGuards()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/ai-agent/widget/messages', () => {
  it('keeps the success shape the widget renders', async () => {
    const r = await GET(req())
    expect(r.status).toBe(200)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await r.json()).toEqual({
      messages: [{ id: 'm1', direction: 'outbound', text: 'Привет', buttons: null, imageUrl: null, createdAt: '2026-11-03T10:00:00Z' }],
    })
  })

  it('answers an empty list for a visitor with no conversation yet', async () => {
    h.conversation = null
    expect(await (await GET(req())).json()).toEqual({ messages: [] })
  })

  it('still 404s on an unknown widget key', async () => {
    h.load.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(404)
  })

  it('rejects a malformed key or visitor id with 400 and never reaches the database', async () => {
    for (const over of [{ key: 'nope' }, { visitor: 'x' }, { visitor: 'a'.repeat(65) }, { visitor: '<script>alert(1)</script>' }, { visitor: ' ' }]) {
      expect((await GET(req(over))).status).toBe(400)
    }
    expect(h.load).not.toHaveBeenCalled()
    expect(h.queries).toHaveLength(0)
  })

  it('rejects a garbage since with 400 (Postgres would answer 500 to it) and accepts a real createdAt', async () => {
    const garbage = [
      'garbage', '2026-13-45T99:99', 'null', "' or 1=1 --", '2026-11-03T10:00:00Z'.repeat(3), '12345',
      // V8 принимает и сдвигает, Postgres отвергает: до базы такие не доходят
      '2026-02-30T10:00:00Z', '2026-02-31T10:00:00Z', '2026-11-03 10:00 (x)', '2026-11-03 10:00:00 PST', '2026-11-03',
    ]
    for (const since of garbage) {
      h.queries.length = 0
      const r = await GET(req({ since }))
      expect(r.status, since).toBe(400)
      expect(await r.json()).toEqual({ error: 'invalid_request' })
      expect(h.queries, since).toHaveLength(0)
    }
    for (const since of ['2026-11-03T10:00:00Z', '2026-11-03T10:00:00.123456+00:00', '2026-11-03 10:00:00+00']) {
      expect((await GET(req({ since }))).status, since).toBe(200)
    }
  })

  it('stops a flood from one IP before it reaches the database', async () => {
    for (let i = 0; i < WIDGET_POLL_IP_PER_MIN; i++) expect((await GET(req())).status).toBe(200)
    h.load.mockClear()
    h.queries.length = 0
    const blocked = await GET(req())
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'rate_limited' })
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(h.load).not.toHaveBeenCalled()
    expect(h.queries).toHaveLength(0)
  })

  it('a normal open widget (one poll per 5 s) never trips the limit', async () => {
    // 12 опросов в минуту на посетителя; десять посетителей за одним NAT -- ровно в пределах
    for (let i = 0; i < 10 * 12; i++) expect((await GET(req())).status).toBe(200)
  })

  it('does not block other IPs, including a different /64 of IPv6', async () => {
    for (let i = 0; i < WIDGET_POLL_IP_PER_MIN + 1; i++) await GET(req())
    expect((await GET(req({}, '198.51.100.9'))).status).toBe(200)
    expect((await GET(req({}, '2001:db8:aaaa:bbbb::1'))).status).toBe(200)
  })

  it('one IPv6 /64 shares a single budget (changing the tail does not reset it)', async () => {
    for (let i = 0; i < WIDGET_POLL_IP_PER_MIN; i++) await GET(req({}, `2001:db8:1:2:${i + 1}::1`))
    expect((await GET(req({}, '2001:db8:1:2:ffff::9'))).status).toBe(429)
  })

  it('does not leak the database error text', async () => {
    h.queryError = { message: 'relation "ai_agent_messages" column "secret_col" does not exist' }
    const r = await GET(req())
    expect(r.status).toBe(500)
    const text = JSON.stringify(await r.json())
    expect(text).toBe('{"error":"unavailable"}')
    expect(text).not.toContain('ai_agent_messages')
    expect(console.error).toHaveBeenCalled()
  })
})
