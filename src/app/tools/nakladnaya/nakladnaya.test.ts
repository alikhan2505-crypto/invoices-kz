import { describe, it, expect } from 'vitest'
import { toolMetadata, toolUrl, toolAlternates, TOOL_LANGS } from '@/lib/tools-i18n'
import { nakladnayaDict } from './dict'
import { documentTotal, localToday, validateForm, vatIncluded, type Form } from './calc'

const base: Form = {
  companyName: 'ИП Тест', binIin: '123456789012', address: '', director: '', email: '',
  clientName: 'ТОО Клиент', clientBin: '',
  number: '1', date: '2026-10-14', vatType: 'no_vat',
  rows: [{ name: 'Товар', qty: '2', price: '1500' }],
}
const err = nakladnayaDict.ru.errors

describe('nakladnaya metadata', () => {
  it('keeps the ru title exactly as it was before the split', () => {
    const m = toolMetadata('nakladnaya', 'ru', nakladnayaDict.ru.seo)
    expect(m.title).toBe('Накладная на отпуск запасов — образец, онлайн | invoices.kz')
  })

  it('canonicalises each language to itself with hreflang to all three', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('nakladnaya', lang, nakladnayaDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('nakladnaya', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('nakladnaya'))
    }
  })
})

describe('nakladnaya dictionary', () => {
  const keys = (o: object) => Object.keys(o).sort()

  it('has the same keys and FAQ length in every language', () => {
    for (const lang of ['kk', 'en'] as const) {
      expect(keys(nakladnayaDict[lang])).toEqual(keys(nakladnayaDict.ru))
      expect(keys(nakladnayaDict[lang].errors)).toEqual(keys(nakladnayaDict.ru.errors))
      expect(nakladnayaDict[lang].faq).toHaveLength(nakladnayaDict.ru.faq.length)
    }
  })

  it('warns kk/en readers that the form itself is Russian', () => {
    expect(nakladnayaDict.ru.docLangNote).toBe('')
    expect(nakladnayaDict.kk.docLangNote).not.toBe('')
    expect(nakladnayaDict.en.docLangNote).not.toBe('')
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = JSON.stringify(nakladnayaDict.kk, (_k, v) => (typeof v === 'function' ? v(3, 3) : v))
    // Регистр важен: «кабинетінде» содержит «бин».
    expect(kk).not.toMatch(/БИН|ИИН|НДС|ЭСФ|АВР|ТОО|\bИП\b/)
    expect(kk).not.toMatch(/накладн/i)
    expect(kk).toMatch(/жүкқұжат/i)
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ҚҚС/)
  })
})

describe('nakladnayaDict limit copy (3 в квартал на IP, решение основателя 15.10.2026)', () => {
  it('describes the limit per quarter, never per day, in every language', () => {
    expect(nakladnayaDict.ru.remaining(2, 3)).toBe('Осталось 2 из 3 бесплатных накладных в этом квартале')
    expect(nakladnayaDict.ru.limitTitle(3)).toBe('Все 3 бесплатные накладные в этом квартале уже созданы')
    expect(nakladnayaDict.ru.limitReset('2027-01-01')).toBe('Новые бесплатные накладные откроются 1 января.')
    expect(nakladnayaDict.kk.remaining(2, 3)).toMatch(/тоқсан/)
    expect(nakladnayaDict.kk.limitReset('2027-04-01')).toMatch(/1 сәуірде/)
    expect(nakladnayaDict.en.remaining(2, 3)).toMatch(/this quarter/)
    expect(nakladnayaDict.en.limitReset('2026-10-01')).toBe('New free notes unlock on 1 October.')
    for (const lang of TOOL_LANGS) {
      const d = nakladnayaDict[lang]
      const limitTexts = [
        d.seo.description, d.intro(3), d.remaining(1, 3), d.limitTitle(3), d.limitReset('2027-01-01'),
        d.errors.unavailable, ...d.faq.map(item => item.a),
      ].join(' ')
      expect(limitTexts).not.toMatch(/в день|сегодня|күніне|бүгін|a day|per day|today/i)
      expect(d.seo.description).toMatch(/квартал|тоқсан|quarter/)
      expect(d.intro(3)).toMatch(/квартал|тоқсан|quarter/)
    }
  })
})

describe('nakladnaya totals match the document', () => {
  it('counts only rows that will be printed (with a name)', () => {
    expect(documentTotal([
      { name: 'A', qty: '2', price: '1500' },
      { name: '  ', qty: '1', price: '9999' },
    ])).toBe(3000)
  })

  it('extracts 16% VAT the same way generateNakladnaya does', () => {
    expect(vatIncluded(11600, 'vat_16')).toBe(1600)
    expect(vatIncluded(1000, 'vat_16')).toBe(Math.round(1000 - 1000 / 1.16))
    expect(vatIncluded(11600, 'no_vat')).toBe(0)
    expect(vatIncluded(11600, 'vat_0')).toBe(0)
  })

  it('uses the local calendar date, not UTC', () => {
    // 01:30 local time on 15 Oct — toISOString() in UTC+5 would say 14 Oct.
    expect(localToday(new Date(2026, 9, 15, 1, 30))).toBe('2026-10-15')
  })
})

describe('nakladnaya validation', () => {
  it('accepts a complete form', () => {
    expect(validateForm(base, err)).toBe('')
  })

  it('rejects a priced row without a name instead of silently dropping it', () => {
    expect(validateForm({ ...base, rows: [...base.rows, { name: '', qty: '1', price: '500' }] }, err)).toBe(err.rowName(2))
  })

  it('rejects an empty or zero quantity (the document would otherwise print 1)', () => {
    expect(validateForm({ ...base, rows: [{ name: 'Товар', qty: '', price: '100' }] }, err)).toBe(err.rowQty('Товар'))
    expect(validateForm({ ...base, rows: [{ name: 'Товар', qty: '0', price: '100' }] }, err)).toBe(err.rowQty('Товар'))
  })

  it('rejects a missing price', () => {
    expect(validateForm({ ...base, rows: [{ name: 'Товар', qty: '1', price: '' }] }, err)).toBe(err.rowPrice('Товар'))
  })

  it('checks BINs and required parties', () => {
    expect(validateForm({ ...base, binIin: '123' }, err)).toBe(err.bin)
    expect(validateForm({ ...base, clientBin: '123' }, err)).toBe(err.clientBin)
    expect(validateForm({ ...base, clientName: ' ' }, err)).toBe(err.client)
    expect(validateForm({ ...base, rows: [{ name: '', qty: '1', price: '' }] }, err)).toBe(err.noRows)
  })

  it('returns errors in the page language', () => {
    expect(validateForm({ ...base, companyName: '' }, nakladnayaDict.kk.errors)).toBe(nakladnayaDict.kk.errors.company)
    expect(validateForm({ ...base, companyName: '' }, nakladnayaDict.en.errors)).toBe(nakladnayaDict.en.errors.company)
  })
})

describe('nakladnaya marketing email', () => {
  it('has the optional email label, consent text and privacy link in every language', () => {
    for (const lang of TOOL_LANGS) {
      const d = nakladnayaDict[lang]
      expect(d.emailLabel, `${lang}.emailLabel`).toMatch(/email/i)
      expect(d.marketingConsent, `${lang}.marketingConsent`).toMatch(/invoices\.kz/)
      expect(d.privacyLink, `${lang}.privacyLink`).not.toBe('')
      // FAQ «куда уходят данные» обязан честно упоминать email для рассылки.
      expect(d.faq.some(q => /email/i.test(q.a)), `${lang}.faq mentions email`).toBe(true)
    }
    expect(nakladnayaDict.ru.emailLabel).toBe('Ваш email (необязательно)')
    expect(nakladnayaDict.kk.emailLabel).toBe('Сіздің email (міндетті емес)')
    expect(nakladnayaDict.en.emailLabel).toBe('Your email (optional)')
  })
})
