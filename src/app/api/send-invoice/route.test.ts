import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- моки внешнего мира: Resend, Supabase (в памяти), Kaspi ----
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.RESEND_API_KEY = 're_test'
})
const sendMock = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string },
  invoice: null as any,
  profile: null as any,
  profileError: null as any,
  counters: new Map<string, number>(),
  invoiceUpdates: [] as Array<{ patch: any; filters: Array<[string, unknown]> }>,
}))

vi.mock('resend', () => ({
  Resend: class { emails = { send: sendMock } },
}))
vi.mock('@/lib/kaspiPay/invoicePayment', () => ({
  getOrCreateKaspiPaymentForInvoice: vi.fn(async () => ({ payment_link: 'https://pay.kaspi.kz/pay/x' })),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return { auth: { getUser: async () => ({ data: { user: state.user } }) } }
    }
    return {
      from(table: string) {
        if (table === 'tool_kontragent_checks') {
          return {
            select: () => {
              const f: Array<[string, unknown]> = []
              const q: any = { eq(c: string, v: unknown) { f.push([c, v]); return q },
                maybeSingle: async () => {
                  const k = f.find(x => x[0] === 'key')![1] as string
                  return { data: state.counters.has(k) ? { count: state.counters.get(k) } : null, error: null }
                } }
              return q
            },
            update: (patch: any) => {
              const f: Array<[string, unknown]> = []
              const q: any = { eq(c: string, v: unknown) { f.push([c, v]); return q },
                select: async () => {
                  const k = f.find(x => x[0] === 'key')![1] as string
                  const c = f.find(x => x[0] === 'count')![1]
                  if (state.counters.get(k) === c) { state.counters.set(k, patch.count); return { data: [{ key: k }], error: null } }
                  return { data: [], error: null }
                } }
              return q
            },
            insert: async (row: any) => {
              if (state.counters.has(row.key)) return { error: { code: '23505', message: 'dup' } }
              state.counters.set(row.key, row.count)
              return { error: null }
            },
          }
        }
        if (table === 'invoices') {
          return {
            select: () => { const q: any = { eq: () => q, maybeSingle: async () => ({ data: state.invoice, error: null }) }; return q },
            update: (patch: any) => {
              const f: Array<[string, unknown]> = []
              const q: any = { eq(c: string, v: unknown) { f.push([c, v]); return q },
                then(res: (v: unknown) => unknown) { state.invoiceUpdates.push({ patch, filters: f }); return Promise.resolve({ error: null }).then(res) } }
              return q
            },
          }
        }
        if (table === 'profiles') {
          return { select: () => { const q: any = { eq: () => q, maybeSingle: async () => ({ data: state.profile, error: state.profileError }) }; return q } }
        }
        throw new Error('unexpected table ' + table)
      },
    }
  },
}))

import { POST } from './route'

const USER = { id: 'user-1', email: 'seller@example.kz' }
const INVOICE = {
  id: 'inv-1', user_id: 'user-1', number: '7', amount: 10000, status: 'draft',
  client_name: 'ТОО <b>Ромашка</b>', client_email: 'client@example.kz',
  services: [{ name: '<script>x</script>', qty: 1, price: 10000 }], note: null,
  created_at: '2026-10-20T10:00:00Z', public_token: 'tok',
}
const PRO = { is_admin: false, plan: 'pro', plan_expires_at: '2099-01-01T00:00:00', trial_expires_at: null, bonus_expires_at: null }
const FREE = { is_admin: false, plan: 'free', plan_expires_at: null, trial_expires_at: null, bonus_expires_at: null }

function req(body: unknown, auth: string | null = 'Bearer tok') {
  return new Request('http://localhost/api/send-invoice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null })
  state.user = USER
  state.invoice = { ...INVOICE }
  state.profile = { ...PRO }
  state.profileError = null
  state.counters = new Map()
  state.invoiceUpdates = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/send-invoice', () => {
  it('happy path: sends once, escapes fields, replies to the auth email, marks draft as sent', async () => {
    const res = await POST(req({ invoiceId: 'inv-1', overrideEmail: ' other@example.kz ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe('other@example.kz')
    expect(arg.replyTo).toBe('seller@example.kz')
    expect(arg.html).not.toContain('<script>')
    expect(arg.html).not.toContain('<b>Ромашка')
    expect(state.invoiceUpdates).toHaveLength(1)
    expect(state.invoiceUpdates[0].patch).toEqual({ status: 'sent' })
    expect(state.invoiceUpdates[0].filters).toContainEqual(['status', 'draft'])
  })

  it('falls back to the invoice client_email when no override is passed', async () => {
    const res = await POST(req({ invoiceId: 'inv-1' }))
    expect(res.status).toBe(200)
    expect(sendMock.mock.calls[0][0].to).toBe('client@example.kz')
  })

  it('401 without a valid session, nothing sent', async () => {
    state.user = null
    expect((await POST(req({ invoiceId: 'inv-1' }, null))).status).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('403 for someone else\'s invoice', async () => {
    state.invoice = { ...INVOICE, user_id: 'other' }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(403)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('403 on the Free plan (server-side canEmail gate)', async () => {
    state.profile = { ...FREE }
    const res = await POST(req({ invoiceId: 'inv-1' }))
    expect(res.status).toBe(403)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('lets a trial and an admin through', async () => {
    state.profile = { ...FREE, trial_expires_at: '2099-01-01T00:00:00Z' }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(200)
    state.counters = new Map()
    state.profile = { ...FREE, is_admin: true }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(200)
  })

  it('400 for arrays, objects, multiple addresses and CRLF in overrideEmail', async () => {
    for (const bad of [['a@b.kz', 'c@d.kz'], { a: 1 }, 'a@b.kz,c@d.kz', 'a@b.kz;c@d.kz', 'a@b.kz\r\nBcc: x@y.kz', 42]) {
      const res = await POST(req({ invoiceId: 'inv-1', overrideEmail: bad }))
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
    expect(sendMock).not.toHaveBeenCalled()
    // отказ по валидации не тратит лимит
    expect(state.counters.size).toBe(0)
  })

  it('400 when the stored client_email is invalid and no override is given', async () => {
    state.invoice = { ...INVOICE, client_email: 'a@b.kz, c@d.kz' }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(400)
    state.invoice = { ...INVOICE, client_email: null }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('429 after 5 sends of the same invoice in a day, with a Russian error', async () => {
    for (let i = 0; i < 5; i++) expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(200)
    const res = await POST(req({ invoiceId: 'inv-1' }))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/Попробуйте завтра/)
    expect(sendMock).toHaveBeenCalledTimes(5)
  })

  it('429 after 30 sends by one user across invoices; releases the invoice slot', async () => {
    for (let i = 0; i < 30; i++) {
      state.invoice = { ...INVOICE, id: `inv-${i}` }
      expect((await POST(req({ invoiceId: `inv-${i}` }))).status).toBe(200)
    }
    state.invoice = { ...INVOICE, id: 'inv-new' }
    const res = await POST(req({ invoiceId: 'inv-new' }))
    expect(res.status).toBe(429)
    expect(sendMock).toHaveBeenCalledTimes(30)
    // слот счёта, занятый до отказа по пользователю, возвращён
    const invoiceKeys = [...state.counters.entries()].filter(([k]) => k.startsWith('sendinv:i:'))
    expect(invoiceKeys.every(([, c]) => c <= 1)).toBe(true)
    expect(invoiceKeys.some(([, c]) => c === 0)).toBe(true)
  })

  it('gives the limit back and answers 500 when Resend fails', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    const res = await POST(req({ invoiceId: 'inv-1' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('domain not verified')
    expect([...state.counters.values()].every(c => c === 0)).toBe(true)
    expect(state.invoiceUpdates).toHaveLength(0)
  })

  it('does not rewind the status of a non-draft invoice (update is conditional on draft)', async () => {
    state.invoice = { ...INVOICE, status: 'paid' }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(200)
    expect(state.invoiceUpdates[0].filters).toContainEqual(['status', 'draft'])
  })

  it('503 when the plan cannot be read', async () => {
    state.profile = null
    state.profileError = { message: 'db down' }
    expect((await POST(req({ invoiceId: 'inv-1' }))).status).toBe(503)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('400 for a malformed body', async () => {
    expect((await POST(req('not json'))).status).toBe(400)
    expect((await POST(req({ invoiceId: { $ne: 1 } }))).status).toBe(400)
  })
})
