import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Публичная подпись документа по токену: чужой формат type и сбой базы не дают
// 500 с текстом ошибки (аудит 02.11.2026, раздел 4).
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
          if (table === 'document_signatures') return { data: { id: 's1', status: 'signed', ddc_pdf_url: 'x.pdf', owner_signer_name: 'Иванов' }, error: null }
          return { data: h.docError ? null : h.doc, error: h.docError }
        },
      }
      return b
    },
  }),
}))

import { GET } from './route'

const call = (type: string | null, token = 'tok') => GET(
  new NextRequest('http://localhost/api/public/signature/' + token + (type === null ? '' : '?type=' + type)),
  { params: Promise.resolve({ token }) },
)

beforeEach(() => {
  h.tables = []
  h.docError = null
  h.doc = { id: 'd1' }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/public/signature/[token]', () => {
  it('type не из белого списка или не задан: 404, в базу таблица из ввода не попадает', async () => {
    for (const type of [null, '', 'users', 'profiles', 'constructor', '__proto__', 'invoices']) {
      expect((await call(type)).status, String(type)).toBe(404)
    }
    expect(h.tables).toHaveLength(0)
  })

  it('подпись отдаётся без пути к карточке, только has_card', async () => {
    const res = await call('invoice')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.signature).toMatchObject({ id: 's1', has_card: true })
    expect(JSON.stringify(body)).not.toContain('x.pdf')
  })

  it('сбой базы: 500 lookup_failed, текст ошибки (таблица, колонки) анониму не отдаётся', async () => {
    h.docError = { message: 'permission denied for table invoices' }
    const res = await call('invoice')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"error":"lookup_failed"}')
  })

  it('неизвестный токен: 404', async () => {
    h.doc = null
    expect((await call('contract')).status).toBe(404)
  })
})
