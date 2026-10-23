import { describe, it, expect } from 'vitest'
import { entryMatchesWabaId } from './whatsappWabaMatch'

describe('entryMatchesWabaId', () => {
  it('passes when entry.id equals the stored waba_id', () => {
    expect(entryMatchesWabaId('222', '222')).toBe(true)
  })
  it('blocks when entry.id differs from the stored waba_id', () => {
    expect(entryMatchesWabaId('999', '222')).toBe(false)
  })
  it('does not block legacy connections without a stored waba_id', () => {
    expect(entryMatchesWabaId('999', '')).toBe(true)
    expect(entryMatchesWabaId('999', null)).toBe(true)
    expect(entryMatchesWabaId('999', undefined)).toBe(true)
  })
  it('does not block a delivery that carries no entry.id', () => {
    expect(entryMatchesWabaId(undefined, '222')).toBe(true)
    expect(entryMatchesWabaId('', '222')).toBe(true)
  })
})
