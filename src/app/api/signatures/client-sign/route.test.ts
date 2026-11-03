import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Публичный роут подписи контрагента: кривой ввод даёт 400, а сбои SIGEX и базы
// не показывают анониму текст ошибки (аудит 02.11.2026, раздел 4).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'
  process.env.RESEND_API_KEY = 're_test'
})
const h = vi.hoisted(() => ({
  queries: 0,
  updateError: null as { message: string } | null,
  addSignature: vi.fn(),
  tg: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const b: any = {
        select: () => b,
        eq: () => b,
        update: () => b,
        single: async () => {
          h.queries++
          if (table === 'document_signatures') {
            return { data: { id: 'sig1', document_type: 'invoice', document_id: 'inv1', status: 'awaiting_client', snapshot_pdf_url: 'p.pdf', sigex_document_id: 'sx1', owner_user_id: 'u1' }, error: null }
          }
          return { data: { number: '5', public_token: 'tok' }, error: null }
        },
        // await на update().eq(): результат записи подписи.
        then: (res: any, rej: any) => Promise.resolve({ error: h.updateError }).then(res, rej),
      }
      return b
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({}) } } }))
vi.mock('@/lib/sigex', () => ({
  sigexAddSignature: h.addSignature,
  sigexGetDocument: async () => ({ signatures: [{ subject: 'CN=Иванов', userId: '900101300123' }] }),
  sigexBuildDDC: async () => new Uint8Array([1]),
  parseSignerName: () => 'Иванов',
}))
vi.mock('@/lib/signedDocumentsServer', () => ({ downloadSignedDocument: async () => new Uint8Array([1, 2]) }))
vi.mock('@/lib/notificationPrefsServer', () => ({ loadNotifyProfile: async () => ({ email: 'o@x.kz', telegram_chat_id: '1' }) }))
vi.mock('@/lib/notificationPrefs', () => ({ wantsNotification: () => false }))
vi.mock('@/lib/telegramNotify', () => ({ sendTelegramNotification: h.tg }))

import { POST } from './route'

const call = (body: unknown) => POST(new NextRequest('http://localhost/api/signatures/client-sign', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}))
const good = { signatureId: 'sig1', signatureCms: 'CMS-BASE64', publicToken: 'tok' }

beforeEach(() => {
  h.queries = 0
  h.updateError = null
  h.addSignature.mockReset()
  h.addSignature.mockResolvedValue({ signId: 1 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/signatures/client-sign', () => {
  it('кривое тело (не JSON, пустое, не объект): 400 Missing params, до базы дело не доходит', async () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '123']) {
      const res = await call(raw)
      expect(res.status, raw).toBe(400)
      expect(await res.json()).toEqual({ error: 'Missing params' })
    }
    expect(h.queries).toBe(0)
  })

  it('поля не строки или пустые: 400, до базы дело не доходит', async () => {
    const bad = [
      { ...good, signatureId: 123 },
      { ...good, signatureId: { a: 1 } },
      { ...good, signatureCms: ['x'] },
      { ...good, publicToken: { $ne: 1 } },
      { ...good, publicToken: '' },
      { signatureCms: 'x', publicToken: 'tok' },
    ]
    for (const body of bad) expect((await call(body)).status, JSON.stringify(body)).toBe(400)
    expect(h.queries).toBe(0)
    expect(h.addSignature).not.toHaveBeenCalled()
  })

  it('корректный запрос проходит как раньше', async () => {
    const res = await call(good)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    expect(h.addSignature).toHaveBeenCalledWith('sx1', 'CMS-BASE64')
  })

  it('чужой токен документа: 404 как раньше', async () => {
    expect((await call({ ...good, publicToken: 'other' })).status).toBe(404)
    expect(h.addSignature).not.toHaveBeenCalled()
  })

  it('сбой SIGEX: 502 с общим текстом, тело ответа SIGEX и адреса наружу не уходят, детали в логе', async () => {
    h.addSignature.mockRejectedValue(new Error('SIGEX 500 https://sigex.kz/api/sx1 {"trace":"java.lang.NullPointerException"}'))
    const res = await call(good)
    expect(res.status).toBe(502)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('SIGEX')
    expect(text).not.toContain('sigex.kz')
    expect(text).not.toContain('NullPointer')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('client-sign'), expect.stringContaining('NullPointerException'))
  })

  it('сбой записи подписи: 500 с общим текстом, без имён таблицы и колонок', async () => {
    h.updateError = { message: 'column "client_signature_cms" of relation "document_signatures" does not exist' }
    const res = await call(good)
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('client_signature_cms')
    expect(text).not.toContain('document_signatures')
    expect(text).not.toContain('relation')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('client-sign'), expect.stringContaining('document_signatures'))
  })
})
