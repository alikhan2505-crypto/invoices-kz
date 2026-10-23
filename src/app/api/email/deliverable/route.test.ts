import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ db: null as any }))

vi.mock('@supabase/supabase-js', async () => {
  const { makeFakeDb } = await import('@/lib/fakeDb.testkit')
  h.db = makeFakeDb()
  return { createClient: () => h.db.client }
})

import { NextRequest } from 'next/server'
import { POST } from './route'
import { COUNTER_TABLE } from '@/lib/toolQuota'

let resendCalls: number

function req(email: string, ip: string | null = '8.8.4.4') {
  return new NextRequest('http://localhost/api/email/deliverable', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: JSON.stringify({ email }),
  })
}

beforeEach(() => {
  h.db.tables[COUNTER_TABLE] = []
  h.db.failTable = undefined
  resendCalls = 0
  vi.stubEnv('RESEND_READ_API_KEY', 'rk')
  vi.stubGlobal('fetch', vi.fn(async () => {
    resendCalls++
    return new Response('{}', { status: 404 })
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/email/deliverable: per-IP limit', () => {
  it('asks Resend for the first 60 checks from one IP, then answers unknown without calling it', async () => {
    for (let i = 0; i < 60; i++) await POST(req(`user${i}@example.com`))
    expect(resendCalls).toBe(60)
    const res = await POST(req('another@example.com'))
    expect(await res.json()).toEqual({ verdict: 'unknown' })
    expect(resendCalls).toBe(60)
  })

  it('another IP has its own budget', async () => {
    for (let i = 0; i < 60; i++) await POST(req(`user${i}@example.com`, '1.1.1.1'))
    await POST(req('x@example.com', '2.2.2.2'))
    expect(resendCalls).toBe(61)
  })

  it('a broken counter fails safe: unknown, Resend not called', async () => {
    h.db.failTable = COUNTER_TABLE
    const res = await POST(req('a@example.com'))
    expect(await res.json()).toEqual({ verdict: 'unknown' })
    expect(resendCalls).toBe(0)
  })

  it('junk input never reaches the counter or Resend', async () => {
    await POST(req('not-an-email'))
    expect(resendCalls).toBe(0)
    expect(h.db.tables[COUNTER_TABLE]).toHaveLength(0)
  })
})
