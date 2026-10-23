import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCounterDbFake, type FakeDb } from '@/lib/aiAgent/counterDbFake.test-util'

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  handle: vi.fn(async () => {}),
  conn: { connectionId: 'c1', agentId: 'agent-9' } as any,
  known: true,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => h.db.client.from(t) }) }))
vi.mock('@/lib/aiAgent/externalApiWebhookHandler', () => ({
  loadExternalApiConnection: vi.fn(async () => (h.known ? h.conn : null)),
  handleExternalApiIncoming: h.handle,
}))

import { POST } from './route'
import { EXTERNAL_API_AGENT_RATE_LIMIT, EXTERNAL_API_AGENT_DAILY_LIMIT } from '@/lib/aiAgent/externalApi'

const KEY = 'agk_' + 'a'.repeat(48)
function req(over: Record<string, unknown> = {}, raw?: string, auth = `Bearer ${KEY}`) {
  const body = raw ?? JSON.stringify({ externalUserId: 'user-1', text: 'Привет', ...over })
  return new Request('https://invoices.kz/api/ai-agent/external/message', {
    method: 'POST', body, headers: { authorization: auth, 'content-type': 'application/json' },
  }) as any
}

beforeEach(() => {
  h.db = createCounterDbFake()
  h.handle.mockClear()
  h.known = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai-agent/external/message', () => {
  it('answers a normal request', async () => {
    expect((await POST(req())).status).toBe(200)
    expect(h.handle).toHaveBeenCalledWith(h.conn, expect.objectContaining({ externalUserId: 'user-1', text: 'Привет' }))
  })

  it('401 for an unknown key, 400 for a malformed one', async () => {
    h.known = false
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req({}, undefined, 'Bearer nope'))).status).toBe(400)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('validates input sizes', async () => {
    expect((await POST(req({ text: 'x'.repeat(2001) }))).status).toBe(400)
    expect((await POST(req({ externalUserId: 'u'.repeat(129) }))).status).toBe(400)
    expect((await POST(req({ externalUserId: '' }))).status).toBe(400)
    expect((await POST(req({}, 'not json'))).status).toBe(400)
    expect((await POST(req({ junk: 'z'.repeat(20000) }))).status).toBe(413)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('clamps an over-long customerName instead of rejecting', async () => {
    expect((await POST(req({ customerName: 'N'.repeat(500) }))).status).toBe(200)
    const arg = (h.handle.mock.calls[0] as any[])[1]
    expect(arg.customerName).toHaveLength(100)
  })

  it('per-minute agent limit still applies', async () => {
    const out: number[] = []
    for (let i = 0; i < EXTERNAL_API_AGENT_RATE_LIMIT + 3; i++) out.push((await POST(req())).status)
    expect(out.filter(c => c === 200)).toHaveLength(EXTERNAL_API_AGENT_RATE_LIMIT)
    expect(out.filter(c => c === 429)).toHaveLength(3)
  })

  it('the daily cap applies', async () => {
    const day = Math.floor(Date.now() / 86_400_000)
    const key = `wgl:d${String(day).padStart(10, '0')}:ea:agent-9`
    h.db.rows.set(key, { key, day: '1970-01-01', count: EXTERNAL_API_AGENT_DAILY_LIMIT })
    expect((await POST(req())).status).toBe(429)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED with 503 when the counter is unavailable', async () => {
    h.db.fail.read = true
    expect((await POST(req())).status).toBe(503)
    expect(h.handle).not.toHaveBeenCalled()
  })
})
