import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: null as any,
  rpcStatus: 'not_found' as string,
  rpcCalls: 0,
}))

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeDb } = await import('@/lib/fakeDb.testkit')
  h.db = makeFakeDb({ profiles: [{ id: 'u1', plan: 'free', plan_expires_at: null }] })
  const client: any = h.db.client
  client.auth = { getUser: async () => ({ data: { user: { id: 'u1' } } }) }
  client.rpc = async () => {
    h.rpcCalls++
    return { data: { status: h.rpcStatus, plan: 'pro', days: 7 }, error: null }
  }
  return { createClient: () => client }
})

import { NextRequest } from 'next/server'
import { POST } from './route'
import { COUNTER_TABLE } from '@/lib/toolQuota'

function req(code: string) {
  return new NextRequest('http://localhost/api/plan/promo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ code }),
  })
}

beforeEach(() => {
  h.db.tables[COUNTER_TABLE] = []
  h.db.failTable = undefined
  h.rpcCalls = 0
  h.rpcStatus = 'not_found'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/plan/promo: failed-attempt limit', () => {
  it('allows 5 wrong codes an hour, then answers 429 without asking the RPC', async () => {
    for (let i = 0; i < 5; i++) expect((await POST(req(`BAD${i}`))).status).toBe(404)
    const res = await POST(req('BAD6'))
    expect(res.status).toBe(429)
    expect(h.rpcCalls).toBe(5)
  })

  it('a successful redemption does not use up the budget', async () => {
    h.rpcStatus = 'ok'
    for (let i = 0; i < 8; i++) expect((await POST(req('GOOD'))).status).toBe(200)
    expect(h.db.tables[COUNTER_TABLE][0].count).toBe(0)
  })

  it('exhausted / already-redeemed (a real code) are not counted as guessing', async () => {
    h.rpcStatus = 'exhausted'
    for (let i = 0; i < 7; i++) expect((await POST(req('USED'))).status).toBe(409)
    h.rpcStatus = 'already_redeemed'
    for (let i = 0; i < 7; i++) expect((await POST(req('MINE'))).status).toBe(409)
  })

  it('a broken counter table does not block redemption', async () => {
    h.db.failTable = COUNTER_TABLE
    h.rpcStatus = 'ok'
    expect((await POST(req('GOOD'))).status).toBe(200)
  })
})
