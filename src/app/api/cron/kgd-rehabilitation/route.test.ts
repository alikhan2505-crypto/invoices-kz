import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ sync: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/kgdRehabilitationSync', () => ({ syncRehabilitation: h.sync }))

import { GET } from './route'

const SECRET = 'test-cron-secret-123456'
const call = (auth: string | null, qs = '') =>
  GET(new Request(`http://localhost/api/cron/kgd-rehabilitation${qs}`, { headers: auth ? { authorization: auth } : {} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.env.CRON_SECRET = SECRET
})

describe('GET /api/cron/kgd-rehabilitation', () => {
  it('rejects a request without the cron secret and does nothing', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('Bearer wrong-secret-value')).status).toBe(401)
    expect(h.sync).not.toHaveBeenCalled()
  })

  it('runs the sync for an authorized request', async () => {
    h.sync.mockResolvedValue({ ok: true, merged: 320 })
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(h.sync.mock.calls[0][1]).toEqual({ dry: false })
  })

  it('?dry=1 asks for a dry run', async () => {
    h.sync.mockResolvedValue({ ok: true, dry: true, merged: 320 })
    await call(`Bearer ${SECRET}`, '?dry=1')
    expect(h.sync.mock.calls[0][1]).toEqual({ dry: true })
  })

  it('table missing before the SQL is applied is a normal 200, not a failed cron', async () => {
    h.sync.mockResolvedValue({ ok: false, reason: 'table_missing' })
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect((await res.json()).reason).toBe('table_missing')
  })

  it('a failed sync is a 502 so Vercel shows the cron as failed', async () => {
    h.sync.mockResolvedValue({ ok: false, reason: 'unexpected_shape' })
    expect((await call(`Bearer ${SECRET}`)).status).toBe(502)
  })
})
