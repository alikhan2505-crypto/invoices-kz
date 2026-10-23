import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCounterDbFake, type FakeDb } from '@/lib/aiAgent/counterDbFake.test-util'

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  handle: vi.fn(async () => {}),
  conn: { connectionId: 'c1', agentId: 'agent-1', widgetKey: 'wgt_' + 'a'.repeat(24) } as any,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => h.db.client.from(t) }) }))
vi.mock('@/lib/aiAgent/websiteWebhookHandler', () => ({
  loadWebsiteConnection: vi.fn(async () => h.conn),
  handleWebsiteIncoming: h.handle,
}))

import { POST } from './route'
import { WIDGET_MESSAGE_RATE_LIMIT, WIDGET_AGENT_DAILY_LIMIT, WIDGET_IP_RATE_LIMIT } from '@/lib/aiAgent/widget'

const KEY = 'wgt_' + 'a'.repeat(24)
let n = 0
function req(over: Record<string, unknown> = {}, ip = '203.0.113.5', raw?: string) {
  const body = raw ?? JSON.stringify({ widgetKey: KEY, visitorId: `visitor-${String(++n).padStart(8, '0')}`, text: 'Здравствуйте', ...over })
  return new Request('https://invoices.kz/api/ai-agent/widget/message', {
    method: 'POST', body, headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
  }) as any
}

beforeEach(() => {
  h.db = createCounterDbFake()
  h.handle.mockClear()
  n = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai-agent/widget/message', () => {
  it('answers a normal visitor and reaches the handler', async () => {
    const r = await POST(req())
    expect(r.status).toBe(200)
    expect(h.handle).toHaveBeenCalledTimes(1)
  })

  it('rejects bad visitorId, bad key, empty and over-long text with 400', async () => {
    expect((await POST(req({ visitorId: 'x' }))).status).toBe(400)
    expect((await POST(req({ visitorId: 'a'.repeat(65) }))).status).toBe(400)
    expect((await POST(req({ visitorId: '<script>alert(1)</script>' }))).status).toBe(400)
    expect((await POST(req({ widgetKey: 'nope' }))).status).toBe(400)
    expect((await POST(req({ text: '   ' }))).status).toBe(400)
    expect((await POST(req({ text: 'x'.repeat(2001) }))).status).toBe(400)
    expect((await POST(req({}, '1.1.1.1', 'not json'))).status).toBe(400)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('rejects an oversized body with 413 before doing anything', async () => {
    const r = await POST(req({ text: 'ы'.repeat(1500), junk: 'z'.repeat(20000) }))
    expect(r.status).toBe(413)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('keeps the 10/min per-visitor limit', async () => {
    h.db.otherHandler = (q, mode) => {
      if (q.table === 'ai_agent_conversations') return { data: { id: 'conv-1' }, error: null }
      if (q.table === 'ai_agent_messages') return { data: null, error: null, count: WIDGET_MESSAGE_RATE_LIMIT }
      return { data: null, error: null }
    }
    const r = await POST(req({ visitorId: 'repeat-visitor-1' }))
    expect(r.status).toBe(429)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('rotating visitorId from ONE ip is stopped by the per-IP limit', async () => {
    const codes: number[] = []
    for (let i = 0; i < WIDGET_IP_RATE_LIMIT + 5; i++) codes.push((await POST(req())).status)
    expect(codes.filter(c => c === 200)).toHaveLength(WIDGET_IP_RATE_LIMIT)
    expect(codes.filter(c => c === 429)).toHaveLength(5)
    expect(h.handle).toHaveBeenCalledTimes(WIDGET_IP_RATE_LIMIT)
  })

  it('a different ip is not blocked by the first one', async () => {
    for (let i = 0; i < WIDGET_IP_RATE_LIMIT + 1; i++) await POST(req())
    expect((await POST(req({}, '198.51.100.9'))).status).toBe(200)
  })

  it('the per-agent daily cap stops a distributed flood', async () => {
    // суточный счётчик агента уже на потолке
    const day = Math.floor(Date.now() / 86_400_000)
    const key = `wgl:d${String(day).padStart(10, '0')}:wa:agent-1`
    h.db.rows.set(key, { key, day: '1970-01-01', count: WIDGET_AGENT_DAILY_LIMIT })
    const r = await POST(req({}, '192.0.2.77'))
    expect(r.status).toBe(429)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED with 503 when the counter table is unavailable -- the model is never called', async () => {
    h.db.fail.read = true
    const r = await POST(req())
    expect(r.status).toBe(503)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED when the visitor conversation lookup errors', async () => {
    h.db.otherHandler = q => (q.table === 'ai_agent_conversations' ? { data: null, error: { message: 'down' } } : { data: null, error: null })
    const r = await POST(req())
    expect(r.status).toBe(503)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED when the visitor message count errors', async () => {
    h.db.otherHandler = q => {
      if (q.table === 'ai_agent_conversations') return { data: { id: 'conv-1' }, error: null }
      return { data: null, error: { message: 'down' }, count: null }
    }
    const r = await POST(req({ visitorId: 'repeat-visitor-2' }))
    expect(r.status).toBe(503)
    expect(h.handle).not.toHaveBeenCalled()
  })
})
