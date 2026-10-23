import { describe, it, expect, vi, beforeEach } from 'vitest'

// Один набор тестов на оба публичных роута уведомлений (notify-paid и
// notify-viewed): у них общая логика «одно уведомление на счёт».
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.RESEND_API_KEY = 're_test'
})
const sendMock = vi.hoisted(() => vi.fn())
const tgMock = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  invoice: null as any,
  counters: new Map<string, number>(),
  failCounter: false,
}))

vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: tgMock }))
vi.mock('@/lib/notificationPrefsServer', () => ({
  loadNotifyProfile: vi.fn(async () => ({ email: 'owner@example.kz', telegram_chat_id: '123' })),
}))
vi.mock('@/lib/notificationPrefs', () => ({ wantsNotification: () => true }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      if (table === 'invoices') {
        return { select: () => { const q: any = { eq: () => q, single: async () => ({ data: state.invoice, error: null }) }; return q } }
      }
      if (table === 'tool_kontragent_checks') {
        return {
          select: () => { const q: any = { eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q },
          update: () => { const q: any = { eq: () => q, select: async () => ({ data: [], error: null }) }; return q },
          insert: async (row: any) => {
            if (state.failCounter) return { error: { message: 'down' } }
            if (state.counters.has(row.key)) return { error: { code: '23505', message: 'dup' } }
            state.counters.set(row.key, row.count)
            return { error: null }
          },
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

import { POST as postPaid } from './route'
import { POST as postViewed } from '../notify-viewed/route'

const req = (body: unknown) => new Request('http://localhost/api/x', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}) as any

beforeEach(() => {
  sendMock.mockReset(); sendMock.mockResolvedValue({ data: { id: 'e' }, error: null })
  tgMock.mockReset()
  state.counters = new Map()
  state.failCounter = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const evilInvoice = (status: string) => ({
  number: '5<img src=x>', amount: '2500', client_name: '<script>alert(1)</script>', status, user_id: 'u1',
})

describe.each([
  ['notify-paid', postPaid, 'paid'],
  ['notify-viewed', postViewed, 'viewed'],
] as const)('%s', (_name, post, okStatus) => {
  it('notifies the owner once, escaping the client-controlled fields', async () => {
    state.invoice = evilInvoice(okStatus)
    const res = await post(req({ invoiceId: 'inv-1' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(tgMock).toHaveBeenCalledTimes(1)
    const html: string = sendMock.mock.calls[0][0].html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<img src=x>')
    expect(tgMock.mock.calls[0][1]).not.toContain('<script>')
    expect(sendMock.mock.calls[0][0].subject).not.toMatch(/[\r\n]/)
  })

  it('does not notify again on repeated calls (page reloads / manual replays)', async () => {
    state.invoice = evilInvoice(okStatus)
    await post(req({ invoiceId: 'inv-1' }))
    for (let i = 0; i < 5; i++) {
      const res = await post(req({ invoiceId: 'inv-1' }))
      expect(await res.json()).toEqual({ ok: true, skipped: true })
    }
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(tgMock).toHaveBeenCalledTimes(1)
  })

  it('lets exactly one of parallel callers send', async () => {
    state.invoice = evilInvoice(okStatus)
    await Promise.all(Array.from({ length: 8 }, () => post(req({ invoiceId: 'inv-1' }))))
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('a different invoice gets its own notification', async () => {
    state.invoice = evilInvoice(okStatus)
    await post(req({ invoiceId: 'inv-1' }))
    await post(req({ invoiceId: 'inv-2' }))
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('skips (and does not burn the one-shot) when the invoice is in the wrong status', async () => {
    state.invoice = evilInvoice('draft')
    expect(await (await post(req({ invoiceId: 'inv-1' }))).json()).toEqual({ ok: true, skipped: true })
    expect(state.counters.size).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('stays silent when the counter is unavailable', async () => {
    state.invoice = evilInvoice(okStatus)
    state.failCounter = true
    expect(await (await post(req({ invoiceId: 'inv-1' }))).json()).toEqual({ ok: true, skipped: true })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('400 for a missing, non-string or malformed invoiceId', async () => {
    for (const body of [{}, { invoiceId: 123 }, { invoiceId: ['a'] }, { invoiceId: 'x'.repeat(100) }, 'not json']) {
      expect((await post(req(body))).status, JSON.stringify(body)).toBe(400)
    }
  })
})
