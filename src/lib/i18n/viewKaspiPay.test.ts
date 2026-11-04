import { describe, it, expect } from 'vitest'
import { viewKaspiPayDict } from './viewKaspiPay'

describe('viewKaspiPayDict', () => {
  const langs = ['ru', 'kk', 'en'] as const

  it('has a non-empty text for every key in every language', () => {
    for (const lang of langs) {
      for (const [key, value] of Object.entries(viewKaspiPayDict[lang])) {
        const text = typeof value === 'function' ? (value as (a: string) => string)('X') : value
        expect(text.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('puts the phone and the countdown into the text in every language', () => {
    for (const lang of langs) {
      expect(viewKaspiPayDict[lang].requestSentTo('+7 777 123 45 67')).toContain('+7 777 123 45 67')
      expect(viewKaspiPayDict[lang].qrValidFor('4:32')).toContain('4:32')
    }
  })

  it('the Kazakh and English texts are really translated, not copies of the Russian ones', () => {
    for (const key of Object.keys(viewKaspiPayDict.ru) as Array<keyof typeof viewKaspiPayDict.ru>) {
      const ru = viewKaspiPayDict.ru[key]
      if (typeof ru === 'function') continue
      expect(viewKaspiPayDict.kk[key], `kk.${key}`).not.toBe(ru)
      expect(viewKaspiPayDict.en[key], `en.${key}`).not.toBe(ru)
    }
  })
})
