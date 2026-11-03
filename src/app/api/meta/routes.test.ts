import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
})
const h = vi.hoisted(() => ({ deleted: [] as unknown[], error: null as null | { message: string } }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        delete: () => b,
        in: () => b,
        eq: (col: string, val: string) => { h.deleted.push([col, val]); return b },
        select: async () => ({ data: h.error ? null : [{ id: 'c1' }], error: h.error }),
      }
      return b
    },
  }),
}))

import { POST as deauthorize } from './deauthorize/route'
import { POST as dataDeletion } from './data-deletion/route'

const SECRET = 'ig-app-secret'
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function signedRequest(secret = SECRET) {
  const p = b64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '17841400000000001' }))
  return `${b64url(createHmac('sha256', secret).update(p).digest())}.${p}`
}
const post = (route: (req: NextRequest) => Promise<Response>, fields: Record<string, string>) => route(new NextRequest('http://localhost/api/meta/x', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
}))

beforeEach(() => {
  process.env.INSTAGRAM_APP_SECRET = SECRET
  delete process.env.WHATSAPP_APP_SECRET
  h.deleted = []
  h.error = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('POST /api/meta/deauthorize', () => {
  it('a signed request removes the connections and answers 200', async () => {
    const res = await post(deauthorize, { signed_request: signedRequest() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.deleted).toContainEqual(['external_account_id', '17841400000000001'])
  })

  it('a forged or missing signed_request is 400 and deletes nothing', async () => {
    expect((await post(deauthorize, { signed_request: signedRequest('attacker') })).status).toBe(400)
    expect((await post(deauthorize, {})).status).toBe(400)
    expect(h.deleted).toHaveLength(0)
  })

  it('a database failure is 500 so that Meta retries, without the error text', async () => {
    h.error = { message: 'relation "ai_agent_channel_connections" is gone' }
    const res = await post(deauthorize, { signed_request: signedRequest() })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"failed"}')
  })
})

describe('POST /api/meta/data-deletion', () => {
  it('answers with the status url and a confirmation code in the shape Meta expects', async () => {
    const res = await post(dataDeletion, { signed_request: signedRequest() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.confirmation_code).toMatch(/^[0-9a-f]{18}$/)
    expect(body.url).toBe(`https://invoices.kz/data-deletion?code=${body.confirmation_code}`)
    expect(h.deleted).toContainEqual(['external_account_id', '17841400000000001'])
  })

  it('a forged signature gets no code and removes nothing', async () => {
    const res = await post(dataDeletion, { signed_request: signedRequest('attacker') })
    expect(res.status).toBe(400)
    expect(h.deleted).toHaveLength(0)
  })
})
