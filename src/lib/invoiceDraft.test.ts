import { describe, it, expect } from 'vitest'
import {
  isDraftWorthKeeping,
  serializeDraft,
  parseStoredDraft,
  INVOICE_DRAFT_MAX_AGE_MS,
  type InvoiceDraft,
} from './invoiceDraft'

const EMPTY: InvoiceDraft = {
  clientName: '',
  clientBin: '',
  clientEmail: '',
  clientAddress: '',
  clientPhone: '',
  contractNumber: '',
  contractDate: '',
  noContract: false,
  // The three fields /create prefills by itself, plus the one blank service row
  // it always starts with -- an untouched form, not an empty object.
  dueDate: '2026-09-13',
  clientKnp: '849',
  note: 'Оплатить до 13.09.2026',
  services: [{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }],
}

const NOW = 1_788_677_000_000

describe('isDraftWorthKeeping', () => {
  it('does not keep a form the user never touched', () => {
    expect(isDraftWorthKeeping(EMPTY)).toBe(false)
  })

  it('does not count the prefilled due date, KNP or note as user input', () => {
    expect(isDraftWorthKeeping({ ...EMPTY, dueDate: '2026-12-31', clientKnp: '710', note: 'что-то' })).toBe(false)
  })

  it('keeps a draft once any client field is typed', () => {
    expect(isDraftWorthKeeping({ ...EMPTY, clientName: 'ТОО Ромашка' })).toBe(true)
    expect(isDraftWorthKeeping({ ...EMPTY, clientBin: '123456789012' })).toBe(true)
    expect(isDraftWorthKeeping({ ...EMPTY, clientPhone: '+7 777 000 00 00' })).toBe(true)
    expect(isDraftWorthKeeping({ ...EMPTY, contractNumber: '12/А' })).toBe(true)
  })

  it('ignores whitespace-only input', () => {
    expect(isDraftWorthKeeping({ ...EMPTY, clientName: '   ' })).toBe(false)
  })

  it('keeps a draft when a service has a name or a price', () => {
    expect(isDraftWorthKeeping({ ...EMPTY, services: [{ ...EMPTY.services[0], name: 'Консультация' }] })).toBe(true)
    expect(isDraftWorthKeeping({ ...EMPTY, services: [{ ...EMPTY.services[0], price: 5000 }] })).toBe(true)
  })

  it('survives a malformed services array instead of throwing', () => {
    expect(isDraftWorthKeeping({ ...EMPTY, services: [null as any] })).toBe(false)
    expect(isDraftWorthKeeping({ ...EMPTY, services: undefined as any })).toBe(false)
  })
})

describe('parseStoredDraft', () => {
  const filled: InvoiceDraft = { ...EMPTY, clientName: 'ТОО Ромашка', clientBin: '123456789012' }

  it('round-trips a draft saved a moment ago', () => {
    expect(parseStoredDraft(serializeDraft(filled, NOW), NOW + 1000)).toEqual(filled)
  })

  it('returns null when there is nothing stored', () => {
    expect(parseStoredDraft(null, NOW)).toBeNull()
    expect(parseStoredDraft('', NOW)).toBeNull()
  })

  it('returns null for anything unparseable or mis-shaped', () => {
    expect(parseStoredDraft('not json', NOW)).toBeNull()
    expect(parseStoredDraft('null', NOW)).toBeNull()
    expect(parseStoredDraft('"a string"', NOW)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({ draft: filled }), NOW)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({ savedAt: 'yesterday', draft: filled }), NOW)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({ savedAt: NOW }), NOW)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({ savedAt: NOW, draft: { clientName: 'x' } }), NOW)).toBeNull()
  })

  it('keeps a draft right up to the age limit and drops it past it', () => {
    const raw = serializeDraft(filled, NOW)
    expect(parseStoredDraft(raw, NOW + INVOICE_DRAFT_MAX_AGE_MS)).not.toBeNull()
    expect(parseStoredDraft(raw, NOW + INVOICE_DRAFT_MAX_AGE_MS + 1)).toBeNull()
  })

  it('drops a draft stamped in the future rather than trusting the clock', () => {
    const raw = serializeDraft(filled, NOW + INVOICE_DRAFT_MAX_AGE_MS + 1)
    expect(parseStoredDraft(raw, NOW)).toBeNull()
  })

  it('fills missing string fields instead of restoring undefined into inputs', () => {
    const raw = JSON.stringify({ savedAt: NOW, draft: { services: [], clientName: 'ТОО Ромашка' } })
    const parsed = parseStoredDraft(raw, NOW)
    expect(parsed).toEqual({
      clientName: 'ТОО Ромашка',
      clientBin: '',
      clientEmail: '',
      clientAddress: '',
      clientPhone: '',
      contractNumber: '',
      contractDate: '',
      noContract: false,
      dueDate: '',
      clientKnp: '',
      note: '',
      services: [],
    })
  })
})
