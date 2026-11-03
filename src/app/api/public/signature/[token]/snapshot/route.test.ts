import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Снимок документа для подписи контрагента: белый список type и сбой базы без
// текста ошибки в ответе (аудит 02.11.2026, раздел 4).
const h = vi.hoisted(() => ({
  tables: [] as string[],
  docError: null as { message: string } | null,
  doc: { id: 'd1' } as { id: string } | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      h.tables.push(table)
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => {
          if (table === 'document_signatures') return { data: { snapshot_pdf_url: 'snap.pdf' }, error: null }
          return { data: h.docError ? null : h.doc, error: h.docError }
        },
      }
      return b
    },
  }),
}))
vi.mock('@/lib/signedDocumentsServer', () => ({ signedDocumentUrl: async () => 'https://storage.example/signed?token=abc' }))

import { GET } from './route'

const call = (type: string | null) => GET(
  new NextRequest('http://localhost/api/public/signature/tok/snapshot' + (type === null ? '' : '?type=' + type)),
  { params: Promise.resolve({ token: 'tok' }) },
)

beforeEach(() => {
  h.tables = []
  h.docError = null
  h.doc = { id: 'd1' }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/public/signature/[token]/snapshot', () => {
  it('type не из белого списка или не задан: 404, база не затронута', async () => {
    for (const type of [null, '', 'users', 'constructor', '__proto__']) {
      expect((await call(type)).status, String(type)).toBe(404)
    }
    expect(h.tables).toHaveLength(0)
  })

  it('действующий токен: переадресация на подписанную ссылку, как раньше', async () => {
    const res = await call('invoice')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://storage.example/signed?token=abc')
  })

  it('сбой базы: 500 lookup_failed, текст ошибки анониму не отдаётся', async () => {
    h.docError = { message: 'permission denied for table contracts' }
    const res = await call('contract')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"lookup_failed"}')
  })
})
