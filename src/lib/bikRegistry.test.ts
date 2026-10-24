import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BIK_BANK_PAGES,
  BIK_BANKS,
  BIK_NON_BANKS,
  BIK_ROWS,
  bikBankAlternates,
  bikBankPath,
  bikHubAlternates,
  bikHubPath,
  bikSitemapEntries,
  getBikBySlug,
} from './bikRegistry'
import { SEO_TARIFF_BIK_LIVE } from './seoLaunch'

const APP_BIK = path.resolve(__dirname, '../app/bik')

describe('bikRegistry', () => {
  it('has all 33 rows of the National Bank directory', () => {
    expect(BIK_ROWS).toHaveLength(33)
    expect(BIK_ROWS.map(r => r.n)).toEqual(Array.from({ length: 33 }, (_, i) => i + 1))
  })

  it('has no duplicate БИК, bank code or number', () => {
    expect(new Set(BIK_ROWS.map(r => r.bik)).size).toBe(33)
    expect(new Set(BIK_ROWS.map(r => r.code)).size).toBe(33)
  })

  it('every БИК is 8 characters and every bank code 3 digits', () => {
    for (const r of BIK_ROWS) {
      expect(r.bik, r.bik).toMatch(/^[A-Z]{6}[A-Z0-9]{2}$/)
      expect(r.code, r.bik).toMatch(/^\d{3}$/)
      expect(r.nameNbk.length, r.bik).toBeGreaterThan(3)
    }
  })

  it('splits 24 banks from 9 non-banks', () => {
    expect(BIK_BANKS).toHaveLength(24)
    expect(BIK_NON_BANKS).toHaveLength(9)
    expect(BIK_BANKS.length + BIK_NON_BANKS.length).toBe(33)
    expect(new Set(BIK_NON_BANKS.map(r => r.bik))).toEqual(
      new Set(['CEDUKZKA', 'EABRKZKA', 'GCVPKZ2A', 'INEARUMM', 'KCCJKZKK', 'KICEKZKX', 'KKMFKZ2A', 'KPSTKZKA', 'NBRKKZKX']),
    )
  })

  it('marks exactly the 11 banks the verification confirmed on the bank site', () => {
    const confirmed = BIK_ROWS.filter(r => r.confirmedOnBankSite).map(r => r.bik).sort()
    expect(confirmed).toEqual(
      [
        'BRKEKZKA', 'CASPKZKA', 'EURIKZKA', 'HSBKKZKX', 'IRTYKZKA', 'KCJBKZKX',
        'KMFBKZKK', 'KSNVKZKA', 'SHBKKZKA', 'TSESKZKA', 'VTBAKZKZ',
      ].sort(),
    )
    // Unconfirmed on the bank site (stay table-only): Home Credit, ADCB, Банк Развития.
    for (const bik of ['INLMKZKA', 'HLALKZKZ', 'DVKAKZKA', 'HCSKKZKA', 'MOKFKZKA']) {
      expect(BIK_ROWS.find(r => r.bik === bik)!.confirmedOnBankSite, bik).toBe(false)
    }
    expect(BIK_BANK_PAGES).toHaveLength(11)
    expect(BIK_BANK_PAGES.every(r => r.kind === 'bank')).toBe(true)
  })

  it('confirmed rows carry a slug, a label, a bank page URL and nothing else does', () => {
    for (const r of BIK_ROWS) {
      if (r.confirmedOnBankSite) {
        expect(r.slug, r.bik).toMatch(/^[a-z0-9-]+$/)
        expect(r.label, r.bik).toBeTruthy()
        expect(r.bankSite?.url, r.bik).toMatch(/^https:\/\//)
        expect(r.bankSite?.host, r.bik).toBeTruthy()
        if (r.bankSite?.bin) expect(r.bankSite.bin, r.bik).toMatch(/^\d{12}$/)
      } else {
        expect(r.slug, r.bik).toBeUndefined()
        expect(r.bankSite, r.bik).toBeUndefined()
      }
    }
    expect(new Set(BIK_BANK_PAGES.map(r => r.slug)).size).toBe(11)
  })

  it('does not print a БИН for Halyk and Евразийский (not confirmed in the verification)', () => {
    expect(getBikBySlug('halyk-bank')!.bankSite!.bin).toBeUndefined()
    expect(getBikBySlug('evraziyskiy-bank')!.bankSite!.bin).toBeUndefined()
  })

  it('every per-bank page slug has a ru and a kk page directory', () => {
    for (const r of BIK_BANK_PAGES) {
      expect(existsSync(path.join(APP_BIK, r.slug!, 'page.tsx')), `ru ${r.slug}`).toBe(true)
      expect(existsSync(path.join(APP_BIK, 'kk', r.slug!, 'page.tsx')), `kk ${r.slug}`).toBe(true)
    }
    expect(existsSync(path.join(APP_BIK, 'page.tsx'))).toBe(true)
    expect(existsSync(path.join(APP_BIK, 'kk', 'page.tsx'))).toBe(true)
  })

  it('has no page directory for a bank that is not confirmed on its own site', () => {
    const dirs = new Set(BIK_BANK_PAGES.map(r => r.slug))
    for (const bik of ['INLMKZKA', 'HLALKZKZ', 'DVKAKZKA']) {
      expect(dirs.has(bik.toLowerCase())).toBe(false)
    }
    expect(existsSync(path.join(APP_BIK, 'home-credit-bank'))).toBe(false)
    expect(existsSync(path.join(APP_BIK, 'adcb'))).toBe(false)
  })

  it('shows the Cyrillic А for KMF Банк and changes no other name', () => {
    for (const r of BIK_ROWS) {
      if (r.bik === 'KMFBKZKK') {
        expect(r.nameNbk.startsWith('A')).toBe(true) // Latin, as in the NBK table
        expect(r.displayName.startsWith('А')).toBe(true) // Cyrillic
        expect(r.displayName.slice(1)).toBe(r.nameNbk.slice(1))
      } else {
        expect(r.displayName, r.bik).toBe(r.nameNbk)
      }
    }
  })

  it('keeps the Bereke БИК as BRKEKZKA and has no SABRKZKA row', () => {
    expect(BIK_ROWS.find(r => r.bik === 'BRKEKZKA')!.nameNbk).toContain('Bereke Bank')
    expect(BIK_ROWS.some(r => r.bik === 'SABRKZKA')).toBe(false)
  })

  it('builds paths and hreflang sets like the guides', () => {
    expect(bikHubPath('ru')).toBe('/bik')
    expect(bikHubPath('kk')).toBe('/bik/kk')
    expect(bikBankPath('kaspi-bank', 'ru')).toBe('/bik/kaspi-bank')
    expect(bikBankPath('kaspi-bank', 'kk')).toBe('/bik/kk/kaspi-bank')
    expect(bikHubAlternates()['x-default']).toBe('https://invoices.kz/bik')
    expect(bikBankAlternates('halyk-bank')).toEqual({
      ru: 'https://invoices.kz/bik/halyk-bank',
      kk: 'https://invoices.kz/bik/kk/halyk-bank',
      'x-default': 'https://invoices.kz/bik/halyk-bank',
    })
  })

  it('sitemap entries respect the launch flag', () => {
    const entries = bikSitemapEntries()
    if (!SEO_TARIFF_BIK_LIVE) {
      expect(entries).toEqual([])
    } else {
      expect(entries).toHaveLength(2 + 11 * 2)
      for (const e of entries) expect(e.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
