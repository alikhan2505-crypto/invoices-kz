import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCounterDbFake, type FakeDb } from '@/lib/aiAgent/counterDbFake.test-util'

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => h.db.client.from(t) }) }))

import { POST } from './route'

function req(ip = '203.0.113.9') {
  return new Request('https://invoices.kz/api/planner/login/init', {
    method: 'POST',
    body: JSON.stringify({ slug: 'salon' }),
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
  }) as any
}

beforeEach(() => {
  process.env.CUSTOMER_TELEGRAM_BOT_USERNAME = 'test_bot'
  h.db = createCounterDbFake()
  h.db.otherHandler = (q) => {
    if (q.table === 'salon_sites') return { data: { id: 'site-1' }, error: null }
    return { data: null, error: null }
  }
})

describe('POST /api/planner/login/init', () => {
  it('issues a code for a normal caller', async () => {
    const r = await POST(req())
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.code).toMatch(/^[0-9a-f]{48}$/)
    expect(body.botUsername).toBe('test_bot')
  })

  it('stops one IP after the per-minute limit (429), another IP still works', async () => {
    let limited = 0
    for (let i = 0; i < 14; i++) {
      const r = await POST(req('203.0.113.50'))
      if (r.status === 429) limited++
    }
    expect(limited).toBeGreaterThan(0)
    expect((await POST(req('198.51.100.7'))).status).toBe(200)
  })
})
