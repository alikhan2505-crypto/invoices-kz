import { describe, it, expect } from 'vitest'
import { toolMetadata, toolUrl, toolAlternates, TOOL_LANGS } from '@/lib/tools-i18n'
import { avrDict } from './dict'
import { documentRows, documentTotal, localToday, ruDate, validateForm, vatIncluded, type Form } from './calc'

const base: Form = {
  companyName: 'ИП Тест', binIin: '123456789012', address: '', director: '', phone: '', email: '',
  clientName: 'ТОО Клиент', clientBin: '', clientAddress: '',
  number: '1', date: '2026-10-14', contractNumber: '', contractDate: '', vatType: 'no_vat',
  rows: [{ name: 'Разработка сайта', qty: '1', price: '150000' }],
}
const err = avrDict.ru.errors

// Строки словаря целиком, с вызванными функциями — для проверок языка.
const flat = (d: object) => JSON.stringify(d, (_k, v) => (typeof v === 'function' ? v(3, 3) : v))

// \b в JS-regex без флага u кириллицу за букву не считает — граница своя.
const NB = '(?<![A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])'
const NA = '(?![A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])'
const RU_ABBR = new RegExp(`${NB}(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ЭЦП)${NA}`)
const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/

describe('avr metadata', () => {
  it('keeps the ru head as it was before the split (limit wording: per quarter since 15.10.2026)', () => {
    const m = toolMetadata('avr', 'ru', avrDict.ru.seo)
    expect(m.title).toBe('Акт выполненных работ — образец, АВР онлайн | invoices.kz')
    expect(m.description).toBe(
      'Образец акта выполненных работ (АВР) для ИП и ТОО: заполните стороны и договор, скачайте PDF за минуту. НДС, сумма прописью. 3 акта в квартал бесплатно.',
    )
    expect(m.openGraph?.title).toBe('АВР онлайн — акт выполненных работ за минуту')
  })

  it('canonicalises each language to itself with hreflang to all three', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('avr', lang, avrDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('avr', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('avr'))
      const og = m.openGraph as { images?: { url: string }[] }
      expect(og.images?.[0].url).toBe('https://invoices.kz/og/tool-avr.png')
    }
  })

  it('has distinct titles per language', () => {
    const titles = TOOL_LANGS.map(l => avrDict[l].seo.title)
    expect(new Set(titles).size).toBe(3)
  })
})

describe('avr dictionary', () => {
  const keys = (o: object) => Object.keys(o).sort()

  it('has every key in ru, kk and en, and the same FAQ length', () => {
    for (const lang of ['kk', 'en'] as const) {
      expect(keys(avrDict[lang])).toEqual(keys(avrDict.ru))
      expect(keys(avrDict[lang].seo)).toEqual(keys(avrDict.ru.seo))
      expect(keys(avrDict[lang].errors)).toEqual(keys(avrDict.ru.errors))
      expect(keys(avrDict[lang].vatOptions)).toEqual(keys(avrDict.ru.vatOptions))
      expect(avrDict[lang].faq).toHaveLength(avrDict.ru.faq.length)
    }
  })

  it('has no empty strings except the ru document-language note', () => {
    for (const lang of TOOL_LANGS) {
      const d = avrDict[lang]
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'string' && !(lang === 'ru' && k === 'docLangNote')) expect(v, `${lang}.${k}`).not.toBe('')
      }
      for (const item of d.faq) {
        expect(item.q).not.toBe('')
        expect(item.a).not.toBe('')
      }
    }
  })

  it('warns kk/en readers that the form itself is Russian', () => {
    expect(avrDict.ru.docLangNote).toBe('')
    expect(avrDict.kk.docLangNote).not.toBe('')
    expect(avrDict.en.docLangNote).not.toBe('')
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = flat(avrDict.kk)
    expect(kk).not.toMatch(RU_ABBR)
    expect(kk).not.toMatch(/выполненн|оказанн|накладн/i)
    expect(kk).toMatch(/Орындалған жұмыстар/)
    expect(kk).toMatch(/ОЖА/)
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ҚҚС/)
    expect(kk).toMatch(/12 цифр/)
  })

  it('has no Cyrillic in the en head', () => {
    const en = avrDict.en
    for (const s of [en.h1, en.seo.title, en.seo.description, en.seo.keywords, en.seo.ogTitle, en.seo.ogDescription, en.seo.ogImageAlt]) {
      expect(s).not.toMatch(CYRILLIC)
    }
  })
})

describe('avrDict limit copy (3 в квартал на IP, решение основателя 15.10.2026)', () => {
  it('describes the limit per quarter, never per day, in every language', () => {
    expect(avrDict.ru.remaining(2, 3)).toBe('Осталось 2 из 3 бесплатных актов в этом квартале')
    expect(avrDict.ru.limitTitle(3)).toBe('Все 3 бесплатных акта в этом квартале уже созданы')
    expect(avrDict.ru.limitReset('2027-01-01')).toBe('Новые бесплатные акты откроются 1 января.')
    expect(avrDict.kk.remaining(2, 3)).toMatch(/тоқсан/)
    expect(avrDict.kk.limitReset('2027-04-01')).toMatch(/1 сәуірде/)
    expect(avrDict.en.remaining(2, 3)).toMatch(/this quarter/)
    expect(avrDict.en.limitReset('2026-10-01')).toBe('New free certificates unlock on 1 October.')
    for (const lang of TOOL_LANGS) {
      const d = avrDict[lang]
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

describe('avr totals match the document', () => {
  it('counts only rows that will be printed (with a name)', () => {
    const rows = [
      { name: 'Дизайн', qty: '2', price: '1500' },
      { name: '  ', qty: '1', price: '9999' },
    ]
    expect(documentRows(rows)).toEqual([{ name: 'Дизайн', qty: 2, unit: 'шт', price: 1500 }])
    expect(documentTotal(rows)).toBe(3000)
  })

  it('extracts 16% VAT the same way generateAVR does', () => {
    expect(vatIncluded(11600, 'vat_16')).toBe(1600)
    expect(vatIncluded(1000, 'vat_16')).toBe(Math.round(1000 - 1000 / 1.16))
    expect(vatIncluded(11600, 'no_vat')).toBe(0)
    expect(vatIncluded(11600, 'vat_0')).toBe(0)
  })

  it('uses the local calendar date, not UTC, and prints dd.mm.yyyy', () => {
    // 01:30 local time on 15 Oct — toISOString() in UTC+5 would say 14 Oct.
    expect(localToday(new Date(2026, 9, 15, 1, 30))).toBe('2026-10-15')
    expect(ruDate('2026-10-04')).toBe('04.10.2026')
  })
})

describe('avr validation', () => {
  it('accepts a complete form', () => {
    expect(validateForm(base, err)).toBe('')
  })

  it('checks BINs and required parties', () => {
    expect(validateForm({ ...base, companyName: ' ' }, err)).toBe(err.company)
    expect(validateForm({ ...base, binIin: '123' }, err)).toBe(err.bin)
    expect(validateForm({ ...base, clientName: ' ' }, err)).toBe(err.client)
    expect(validateForm({ ...base, clientBin: '123' }, err)).toBe(err.clientBin)
    expect(validateForm({ ...base, rows: [{ name: '', qty: '1', price: '' }] }, err)).toBe(err.noRows)
  })

  it('rejects a priced row without a name instead of silently dropping it', () => {
    expect(validateForm({ ...base, rows: [...base.rows, { name: '', qty: '1', price: '500' }] }, err)).toBe(err.rowName(2))
  })

  it('rejects an empty or zero quantity and a missing price', () => {
    expect(validateForm({ ...base, rows: [{ name: 'Работа', qty: '', price: '100' }] }, err)).toBe(err.rowQty('Работа'))
    expect(validateForm({ ...base, rows: [{ name: 'Работа', qty: '0', price: '100' }] }, err)).toBe(err.rowQty('Работа'))
    expect(validateForm({ ...base, rows: [{ name: 'Работа', qty: '1', price: '' }] }, err)).toBe(err.rowPrice('Работа'))
  })

  it('returns errors in the page language', () => {
    expect(validateForm({ ...base, companyName: '' }, avrDict.kk.errors)).toBe(avrDict.kk.errors.company)
    expect(validateForm({ ...base, companyName: '' }, avrDict.en.errors)).toBe(avrDict.en.errors.company)
  })
})

describe('avr marketing email', () => {
  it('has the optional email label, consent text and privacy link in every language', () => {
    for (const lang of TOOL_LANGS) {
      const d = avrDict[lang]
      expect(d.emailLabel, `${lang}.emailLabel`).toMatch(/email/i)
      expect(d.marketingConsent, `${lang}.marketingConsent`).toMatch(/invoices\.kz/)
      expect(d.privacyLink, `${lang}.privacyLink`).not.toBe('')
      // FAQ «куда уходят данные» обязан честно упоминать email для рассылки.
      expect(d.faq.some(q => /email/i.test(q.a)), `${lang}.faq mentions email`).toBe(true)
    }
    expect(avrDict.ru.emailLabel).toBe('Ваш email (необязательно)')
    expect(avrDict.kk.emailLabel).toBe('Сіздің email (міндетті емес)')
    expect(avrDict.en.emailLabel).toBe('Your email (optional)')
  })
})
