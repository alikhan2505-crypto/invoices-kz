import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Файл договора для контрагента: сбой базы не отдаёт текст ошибки анониму, а
// недоступный файл - 404 (JSON или страница), не 500 (аудит 02.11.2026, раздел 4).
const h = vi.hoisted(() => ({
  error: null as { message: string } | null,
  contract: { user_id: 'u1', file_url: 'u1/contract.pdf' } as { user_id: string; file_url: string } | null,
  url: 'https://storage.example/signed?token=abc' as string | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: h.error ? null : h.contract, error: h.error }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/signedDocumentsServer', () => ({
  resolveContractFilePath: (fileUrl: string) => fileUrl,
  signedDocumentUrl: async () => h.url,
}))

import { GET } from './route'

const call = (accept?: string) => GET(
  new NextRequest('http://localhost/api/public/contract/tok/file', { headers: accept ? { accept } : {} }),
  { params: Promise.resolve({ token: 'tok' }) },
)

beforeEach(() => {
  h.error = null
  h.contract = { user_id: 'u1', file_url: 'u1/contract.pdf' }
  h.url = 'https://storage.example/signed?token=abc'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/public/contract/[token]/file', () => {
  it('действующий токен: переадресация на подписанную ссылку, как раньше', async () => {
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://storage.example/signed?token=abc')
  })

  it('сбой базы: 500 lookup_failed, текст ошибки анониму не отдаётся', async () => {
    h.error = { message: 'permission denied for table contracts' }
    const res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"lookup_failed"}')
  })

  it('файл недоступен: 404 JSON для программного запроса, страница для браузера', async () => {
    h.url = null
    const json = await call()
    expect(json.status).toBe(404)
    expect(await json.json()).toEqual({ error: 'file_unavailable' })
    const html = await call('text/html')
    expect(html.status).toBe(404)
    expect(html.headers.get('content-type')).toContain('text/html')
  })

  it('неизвестный токен: 404', async () => {
    h.contract = null
    expect((await call()).status).toBe(404)
  })
})
