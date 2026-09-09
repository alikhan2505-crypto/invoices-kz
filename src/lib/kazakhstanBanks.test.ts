import { describe, it, expect } from 'vitest'
import { KAZAKHSTAN_BANKS, findBankByBik, findBankByName, OTHER_BANK } from './kazakhstanBanks'

describe('KAZAKHSTAN_BANKS', () => {
  it('carries no duplicate БИК', () => {
    const seen = KAZAKHSTAN_BANKS.map(b => b.bik)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('has a well-formed 8-character БИК for every bank', () => {
    // A БИК that reaches the invoice PDF malformed is the exact failure this
    // registry exists to end, so the shape is asserted rather than trusted.
    for (const bank of KAZAKHSTAN_BANKS) {
      expect(bank.bik, bank.name).toMatch(/^[A-Z0-9]{8}$/)
      expect(bank.name.trim()).toBe(bank.name)
    }
  })

  it('leads with the banks our customers actually use', () => {
    expect(KAZAKHSTAN_BANKS[0].bik).toBe('CASPKZKA')
    expect(KAZAKHSTAN_BANKS[1].bik).toBe('HSBKKZKX')
  })
})

describe('findBankByBik', () => {
  it('finds a bank by its exact БИК', () => {
    expect(findBankByBik('CASPKZKA')?.name).toBe('АО «Kaspi Bank»')
  })

  it('tolerates the case and stray spaces of hand-typed values', () => {
    // 'HSBKKZKX ' with a trailing space is a real stored value.
    expect(findBankByBik('HSBKKZKX ')?.bik).toBe('HSBKKZKX')
    expect(findBankByBik('caspkzka')?.bik).toBe('CASPKZKA')
  })

  it('returns null for an unknown or empty БИК', () => {
    expect(findBankByBik('Casdfgh')).toBeNull()
    expect(findBankByBik('')).toBeNull()
    expect(findBankByBik(null)).toBeNull()
  })
})

describe('findBankByName', () => {
  it('recognises the spellings already in the database', () => {
    // Every one of these is a real stored bank_name for Kaspi.
    for (const spelling of ['АО "Kaspi Bank"', 'АО «Kaspi Bank»', 'АО  "KASPI BANK"']) {
      expect(findBankByName(spelling)?.bik, spelling).toBe('CASPKZKA')
    }
  })

  it('does not match a different bank on a partial name', () => {
    // "Каспи" alone is not the official name; guessing from a fragment is how
    // the wrong БИК would reach an invoice.
    expect(findBankByName('Каспи')).toBeNull()
    expect(findBankByName('Kaspi')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(findBankByName('')).toBeNull()
    expect(findBankByName(undefined)).toBeNull()
  })
})

describe('OTHER_BANK', () => {
  it('cannot collide with a real БИК', () => {
    expect(KAZAKHSTAN_BANKS.some(b => b.bik === OTHER_BANK)).toBe(false)
  })
})
