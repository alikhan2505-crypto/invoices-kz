// @vitest-environment happy-dom
// Ссылки «Скачать подписанный документ» и «карточка проверки» несут public_token документа
// (?t=): без него /api/documents/[id]/[type] отвечает 404 (закрыто 16.11.2026).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const SIGNED = {
  id: 'sig-1', status: 'signed', owner_signed_at: '2026-11-01T10:00:00Z', client_signed_at: null,
  owner_signer_name: 'Иванов И.', owner_signer_iin: null, client_signer_name: null, client_signer_iin: null,
  ddc_pdf_url: 'inv-1/card.pdf', snapshot_pdf_url: 'inv-1/s.pdf', display_pdf_url: null,
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === 'document_signatures' ? SIGNED : { public_token: `owner-token-${table}` } }),
      }
      return q
    },
  },
}))
vi.mock('@/components/LanguageProvider', () => ({ useLanguage: () => ({ lang: 'ru' }) }))
vi.mock('@/lib/signDocument', () => ({
  renderPdfBlob: vi.fn(), uploadSnapshot: vi.fn(), runSigexQrSigning: vi.fn(),
  injectAttestationBlock: vi.fn(), buildAttestationHtml: vi.fn(),
}))

import SignatureSection from './SignatureSection'

let root: Root
let host: HTMLDivElement

async function mount(el: any) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(el) })
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}
const hrefs = () => Array.from(host.querySelectorAll('a')).map(a => a.getAttribute('href') || '').filter(h => h.startsWith('/api/documents/'))

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ signature: { ...SIGNED, has_card: true, ddc_pdf_url: undefined, snapshot_pdf_url: undefined } }), { status: 200 })) as any
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
})

describe('SignatureSection: ссылки на подписанный документ', () => {
  it('клиент на публичной странице: токен из адреса страницы', async () => {
    await mount(createElement(SignatureSection, { mode: 'client', publicToken: 'pub tok/1', documentId: 'inv-1', documentTitle: 'Счёт №1' }))
    expect(hrefs()).toEqual([
      '/api/documents/sig-1/document?t=pub%20tok%2F1',
      '/api/documents/sig-1/card?t=pub%20tok%2F1',
    ])
  })

  it('владелец: токен счёта читается из своей строки', async () => {
    await mount(createElement(SignatureSection, { mode: 'owner', documentId: 'inv-1', documentTitle: 'Счёт №1', getHtml: async () => '' }))
    expect(hrefs()).toEqual([
      '/api/documents/sig-1/document?t=owner-token-invoices',
      '/api/documents/sig-1/card?t=owner-token-invoices',
    ])
  })

  it('владелец, договор: токен берётся из contracts', async () => {
    await mount(createElement(SignatureSection, { mode: 'owner', documentType: 'contract', documentId: 'c-1', documentTitle: 'Договор', getPdfUrl: async () => '' }))
    expect(hrefs()[0]).toBe('/api/documents/sig-1/document?t=owner-token-contracts')
  })
})
