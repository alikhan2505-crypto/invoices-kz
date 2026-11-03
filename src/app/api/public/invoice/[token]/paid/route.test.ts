import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  statusIn: [] as string[],
  tokenEq: '' as string,
  result: { data: { id: 'inv1' }, error: null } as { data: { id: string } | null; error: { message: string } | null },
  notify: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: (_c: string, token: string) => { h.tokenEq = token; return { in: (_s: string, list: string[]) => { h.statusIn = list; return { select: () => ({ maybeSingle: async () => h.result }) } } } },
      }),
    }),
  }),
}))
vi.mock('@/lib/aiAgent/invoiceSend', () => ({ notifyInvoicePaidInConversation: h.notify }))

import { POST } from './route'

const call = (token = 'tok') => POST(new NextRequest('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ token }) })

describe('POST /api/public/invoice/[token]/paid', () => {
  beforeEach(() => { h.result = { data: { id: 'inv1' }, error: null }; h.notify.mockReset(); h.notify.mockResolvedValue(undefined) })

  it('счёт-черновик тоже можно отметить оплаченным (ссылку могли отправить без кнопки «Отправить»); оплаченные и отменённые нет', async () => {
    const res = await call('abc')
    expect(res.status).toBe(200)
    expect(h.tokenEq).toBe('abc')
    expect(h.statusIn).toEqual(['draft', 'sent', 'viewed', 'overdue'])
    expect(h.statusIn).not.toContain('paid')
    expect(h.statusIn).not.toContain('cancelled')
  })

  it('нет подходящего счёта: 404; ошибка базы: 500; без токена: 404', async () => {
    h.result = { data: null, error: null }
    expect((await call()).status).toBe(404)
    h.result = { data: null, error: { message: 'boom' } }
    expect((await call()).status).toBe(500)
    expect((await call('')).status).toBe(404)
  })

  it('сбой уведомления в чат не отменяет отметку', async () => {
    h.notify.mockRejectedValue(new Error('chat down'))
    expect((await call()).status).toBe(200)
  })

  it('сбой базы: в ответе только общий код, текст ошибки (таблица, колонки) анониму не отдаётся', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.result = { data: null, error: { message: 'relation "invoices" column "public_token" does not exist' } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"update_failed"}')
  })
})
