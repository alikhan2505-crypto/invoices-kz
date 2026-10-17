import { describe, it, expect } from 'vitest'
import { pageDocumentTitle } from './pageTitle'

describe('pageDocumentTitle', () => {
  it('appends the site name after an em dash', () => {
    expect(pageDocumentTitle('История счетов')).toBe('История счетов — INVOICES.KZ')
  })
  it('trims the heading', () => {
    expect(pageDocumentTitle('  Invoice history ')).toBe('Invoice history — INVOICES.KZ')
  })
})
