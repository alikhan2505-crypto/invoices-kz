// Подписанный документ отдаётся только по public_token документа (16.11.2026), а страница
// проверки по номеру SIGEX больше не выдаёт ни id подписи, ни ссылок на файлы.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Tables = Record<string, Record<string, unknown> | null>
let tables: Tables

const download = vi.hoisted(() => vi.fn())
vi.mock('@/lib/signedDocumentsServer', () => ({ downloadSignedDocument: download }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: tables[table] ?? null }),
        maybeSingle: async () => ({ data: tables[table] ?? null }),
      }
      return q
    },
  }),
}))

import { GET as getDocument } from './[id]/[type]/route'
import { GET as getVerify } from './verify/[sigexId]/route'
import { documentTokenMatches } from '@/lib/signedDocumentAccess'

const SIGNATURE = {
  id: 'sig-1', document_type: 'invoice', document_id: 'inv-1',
  snapshot_pdf_url: 'inv-1/snapshot.pdf', display_pdf_url: null, ddc_pdf_url: 'inv-1/card.pdf',
  owner_signed_at: '2026-11-01T00:00:00Z', client_signed_at: null,
  owner_signer_name: 'Иванов И.', owner_signer_iin: '900101300123', client_signer_name: null, client_signer_iin: null,
  owner_user_id: 'u1', sigex_document_id: '12345',
}

function docReq(query: string) {
  return getDocument(new NextRequest(`http://localhost/api/documents/sig-1/document${query}`), {
    params: Promise.resolve({ id: 'sig-1', type: 'document' }),
  })
}

beforeEach(() => {
  download.mockReset()
  download.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
  tables = {
    document_signatures: { ...SIGNATURE },
    invoices: { public_token: 'tok-invoice-aaaaaaaa', number: '7' },
    contracts: { public_token: 'tok-contract-bbbbbbbb', title: 'Договор' },
  }
})

describe('documentTokenMatches', () => {
  it('совпадает только строка в строку; пустое, чужое и без токена у документа отказ', () => {
    expect(documentTokenMatches('abc', 'abc')).toBe(true)
    expect(documentTokenMatches('abd', 'abc')).toBe(false)
    expect(documentTokenMatches('ab', 'abc')).toBe(false)
    expect(documentTokenMatches('', '')).toBe(false)
    expect(documentTokenMatches(null, 'abc')).toBe(false)
    expect(documentTokenMatches('abc', null)).toBe(false)
    expect(documentTokenMatches(undefined, undefined)).toBe(false)
  })
})

describe('/api/documents/[id]/[type]', () => {
  it('без токена: 404 и файл даже не скачивается', async () => {
    const res = await docReq('')
    expect(res.status).toBe(404)
    expect(download).not.toHaveBeenCalled()
  })

  it('чужой токен: 404', async () => {
    const res = await docReq('?t=tok-contract-bbbbbbbb')
    expect(res.status).toBe(404)
    expect(download).not.toHaveBeenCalled()
  })

  it('токен счёта: файл отдаётся', async () => {
    const res = await docReq('?t=tok-invoice-aaaaaaaa')
    expect(res.status).toBe(200)
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('договор: токен договора открывает, токен счёта нет', async () => {
    tables.document_signatures = { ...SIGNATURE, document_type: 'contract', document_id: 'c-1' }
    expect((await docReq('?t=tok-contract-bbbbbbbb')).status).toBe(200)
    expect((await docReq('?t=tok-invoice-aaaaaaaa')).status).toBe(404)
  })

  it('у документа нет токена: не открывается никому, даже с пустым ?t=', async () => {
    tables.invoices = { public_token: null, number: '7' }
    expect((await docReq('?t=')).status).toBe(404)
    expect((await docReq('')).status).toBe(404)
  })

  it('подписи с таким id нет: тот же 404', async () => {
    tables.document_signatures = null
    expect((await docReq('?t=tok-invoice-aaaaaaaa')).status).toBe(404)
  })
})

describe('/api/documents/verify/[sigexId]', () => {
  it('отдаёт подписантов и даты, но не id подписи и не ссылки на файлы', async () => {
    tables.profiles = { company_name: 'ТОО Тест' }
    const res = await getVerify(new NextRequest('http://localhost/api/documents/verify/12345'), { params: Promise.resolve({ sigexId: '12345' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ownerSignerName).toBe('Иванов И.')
    expect(body.ownerSignerIin).toBe('900101******')
    expect(body).not.toHaveProperty('documentUrl')
    expect(body).not.toHaveProperty('cardUrl')
    expect(JSON.stringify(body)).not.toContain('sig-1')
  })
})
