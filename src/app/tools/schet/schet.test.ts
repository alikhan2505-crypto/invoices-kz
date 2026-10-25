import { describe, it, expect } from 'vitest'
import { toolMetadata, toolUrl, toolAlternates, TOOL_LANGS } from '@/lib/tools-i18n'
import { OTHER_BANK } from '@/lib/kazakhstanBanks'
import { schetDict, schetFaqJsonLd } from './dict'
import { documentRows, documentTotal, localToday, resolveBank, validateForm, vatIncluded, type Form } from './calc'

const base: Form = {
  companyName: 'ИП Тест', binIin: '123456789012', address: '', director: '', phone: '', email: '',
  bankBik: 'CASPKZKA', otherBankName: '', otherBankBik: '', iik: 'KZ123456789012345678', kbe: '19',
  clientName: 'ТОО Клиент', clientBin: '210987654321',
  number: '1', date: '2026-10-14', dueDate: '', vatType: 'no_vat', note: '',
  rows: [{ name: 'Услуга', qty: '2', price: '1500' }],
}
const err = schetDict.ru.errors

// Все строки словаря, функции — вызванными, чтобы проверить и шаблоны.
const flat = (d: object) => JSON.stringify(d, (_k, v) => (typeof v === 'function' ? v(3, 3) : v))

// \b в JS-regex без флага u кириллицу за букву не считает — граница своя.
const L = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'
const RU_ABBR_ON_KK = new RegExp(`(?<![${L}])(БИН|ИИН|НДС|ИП|ТОО|АВР|КП|КГД|ЭСФ|БИК|ИИК|КНП)(?![${L}])`)

describe('schet metadata', () => {
  it('ru head names the searched wording: образец, Казахстан, скачать (24.10.2026 metadata audit)', () => {
    const m = toolMetadata('schet', 'ru', schetDict.ru.seo)
    expect(m.title).toBe('Образец счёта на оплату для Казахстана — скачать PDF')
    expect(m.description).toBe(
      'Образец счёта на оплату для ИП и ТОО в Казахстане: заполните реквизиты и скачайте PDF за минуту. НДС 16%, сумма прописью. 3 счёта в квартал бесплатно.',
    )
    expect(m.alternates?.canonical).toBe('https://invoices.kz/tools/schet')
  })

  it('canonicalises each language to itself with hreflang to all three', () => {
    for (const lang of TOOL_LANGS) {
      const m = toolMetadata('schet', lang, schetDict[lang].seo)
      expect(m.alternates?.canonical).toBe(toolUrl('schet', lang))
      expect(m.alternates?.languages).toEqual(toolAlternates('schet'))
    }
  })

  it('has a distinct title per language', () => {
    const titles = TOOL_LANGS.map(l => schetDict[l].seo.title)
    expect(new Set(titles).size).toBe(3)
  })

  it('FAQ JSON-LD matches the visible FAQ on every language', () => {
    for (const lang of TOOL_LANGS) {
      const data = JSON.parse(schetFaqJsonLd(lang))
      expect(data['@type']).toBe('FAQPage')
      expect(data['@id']).toBe(`${toolUrl('schet', lang)}#faq`)
      expect(data.mainEntity).toHaveLength(schetDict[lang].faq.length)
      expect(data.mainEntity[0].name).toBe(schetDict[lang].faq[0].q)
      expect(data.mainEntity[0].acceptedAnswer.text).toBe(schetDict[lang].faq[0].a)
    }
  })
})

describe('schet dictionary', () => {
  const keys = (o: object) => Object.keys(o).sort()

  it('has every key in every language', () => {
    for (const lang of ['kk', 'en'] as const) {
      expect(keys(schetDict[lang])).toEqual(keys(schetDict.ru))
      expect(keys(schetDict[lang].seo)).toEqual(keys(schetDict.ru.seo))
      expect(keys(schetDict[lang].errors)).toEqual(keys(schetDict.ru.errors))
      expect(keys(schetDict[lang].vatOptions)).toEqual(keys(schetDict.ru.vatOptions))
      expect(schetDict[lang].faq).toHaveLength(schetDict.ru.faq.length)
    }
  })

  it('has no empty strings (except the ru document-language note)', () => {
    for (const lang of TOOL_LANGS) {
      const empties: string[] = []
      JSON.parse(flat(schetDict[lang]), (k, v) => {
        if (v === '' && k !== 'docLangNote') empties.push(`${lang}.${k}`)
        return v
      })
      expect(empties).toEqual([])
    }
  })

  it('warns kk/en readers that the invoice itself is Russian', () => {
    expect(schetDict.ru.docLangNote).toBe('')
    expect(schetDict.kk.docLangNote).not.toBe('')
    expect(schetDict.en.docLangNote).not.toBe('')
  })

  it('uses Kazakh terms, not Russian abbreviations, on the kk page', () => {
    const kk = flat(schetDict.kk)
    expect(kk).not.toMatch(RU_ABBR_ON_KK)
    expect(kk).toMatch(/төлем шот/i)
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ЖСК/)
    expect(kk).toMatch(/БСК/)
    expect(kk).toMatch(/ҚҚС/)
    expect(kk).toMatch(/12 цифр/)
    expect(kk).toMatch(/Тіркелусіз/)
  })

  it('has no Cyrillic in the en copy', () => {
    expect(flat(schetDict.en)).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/)
  })
})

describe('schetDict limit copy (3 в квартал на IP, решение основателя 15.10.2026)', () => {
  it('describes the limit per quarter, never per day, in every language', () => {
    expect(schetDict.ru.remaining(2, 3)).toBe('Осталось 2 из 3 бесплатных счетов в этом квартале · в счёте будет строка «Создано на invoices.kz»')
    expect(schetDict.ru.limitTitle(3)).toBe('Все 3 бесплатных счёта в этом квартале уже созданы')
    expect(schetDict.ru.limitReset('2027-01-01')).toBe('Новые бесплатные счета откроются 1 января.')
    expect(schetDict.kk.remaining(2, 3)).toMatch(/тоқсан/)
    expect(schetDict.kk.limitReset('2027-04-01')).toMatch(/1 сәуірде/)
    expect(schetDict.en.remaining(2, 3)).toMatch(/this quarter/)
    expect(schetDict.en.limitReset('2026-10-01')).toBe('New free invoices unlock on 1 October.')
    for (const lang of TOOL_LANGS) {
      const d = schetDict[lang]
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

describe('schet totals match the document', () => {
  it('counts only rows that will be printed (with a name)', () => {
    expect(documentTotal([
      { name: 'A', qty: '2', price: '1500' },
      { name: '  ', qty: '1', price: '9999' },
    ])).toBe(3000)
    expect(documentRows([{ name: ' A ', qty: '2', price: '10' }])).toEqual([{ name: 'A', qty: 2, unit: 'шт', price: 10 }])
  })

  it('extracts 16% VAT the same way generateInvoicePDF does', () => {
    expect(vatIncluded(11600, 'vat_16')).toBe(1600)
    expect(vatIncluded(1000, 'vat_16')).toBe(Math.round(1000 - 1000 / 1.16))
    expect(vatIncluded(11600, 'no_vat')).toBe(0)
    expect(vatIncluded(11600, 'vat_0')).toBe(0)
  })

  it('uses the local calendar date, not UTC', () => {
    expect(localToday(new Date(2026, 9, 15, 1, 30))).toBe('2026-10-15')
  })
})

describe('schet bank', () => {
  it('takes name and BIC from the directory', () => {
    expect(resolveBank(base)).toEqual({ name: 'АО «Kaspi Bank»', bik: 'CASPKZKA' })
    expect(resolveBank({ ...base, bankBik: '' })).toEqual({ name: '', bik: '' })
  })

  it('accepts a letter BIC for a bank typed by hand', () => {
    const f = { ...base, bankBik: OTHER_BANK, otherBankName: ' Some Bank ', otherBankBik: 'abcdkzka' }
    expect(resolveBank(f)).toEqual({ name: 'Some Bank', bik: 'ABCDKZKA' })
    expect(validateForm(f, err)).toBe('')
    expect(validateForm({ ...f, otherBankBik: 'ABC' }, err)).toBe(err.bank)
  })
})

describe('schet validation', () => {
  it('accepts a complete form', () => {
    expect(validateForm(base, err)).toBe('')
  })

  it('checks the supplier, bank and client in the original order', () => {
    expect(validateForm({ ...base, companyName: ' ' }, err)).toBe(err.company)
    expect(validateForm({ ...base, binIin: '123' }, err)).toBe(err.bin)
    expect(validateForm({ ...base, bankBik: '' }, err)).toBe(err.bank)
    expect(validateForm({ ...base, iik: 'KZ123' }, err)).toBe(err.iik)
    expect(validateForm({ ...base, clientName: '' }, err)).toBe(err.client)
    expect(validateForm({ ...base, clientBin: '' }, err)).toBe(err.clientBin)
  })

  it('rejects a priced row without a name instead of silently dropping it', () => {
    expect(validateForm({ ...base, rows: [...base.rows, { name: '', qty: '1', price: '500' }] }, err)).toBe(err.rowName(2))
  })

  it('rejects an empty quantity or price (the document would otherwise disagree with the total)', () => {
    expect(validateForm({ ...base, rows: [{ name: 'Услуга', qty: '', price: '100' }] }, err)).toBe(err.rowQty('Услуга'))
    expect(validateForm({ ...base, rows: [{ name: 'Услуга', qty: '1', price: '' }] }, err)).toBe(err.rowPrice('Услуга'))
    expect(validateForm({ ...base, rows: [{ name: '', qty: '1', price: '' }] }, err)).toBe(err.noRows)
  })

  it('returns errors in the page language', () => {
    expect(validateForm({ ...base, companyName: '' }, schetDict.kk.errors)).toBe(schetDict.kk.errors.company)
    expect(validateForm({ ...base, companyName: '' }, schetDict.en.errors)).toBe(schetDict.en.errors.company)
  })
})

describe('schet marketing email', () => {
  it('has the optional email label, consent text and privacy link in every language', () => {
    for (const lang of TOOL_LANGS) {
      const d = schetDict[lang]
      expect(d.emailLabel, `${lang}.emailLabel`).toMatch(/email/i)
      expect(d.marketingConsent, `${lang}.marketingConsent`).toMatch(/invoices\.kz/)
      expect(d.privacyLink, `${lang}.privacyLink`).not.toBe('')
      // FAQ «куда уходят данные» обязан честно упоминать email для рассылки.
      expect(d.faq.some(q => /email/i.test(q.a)), `${lang}.faq mentions email`).toBe(true)
    }
    expect(schetDict.ru.emailLabel).toBe('Ваш email (необязательно)')
    expect(schetDict.kk.emailLabel).toBe('Сіздің email (міндетті емес)')
    expect(schetDict.en.emailLabel).toBe('Your email (optional)')
  })
})

describe('schet — подсказка НДС под итогом', () => {
  it('для НДС 0% тоже пишет «в т.ч. НДС 0%: 0 ₸» на всех языках', async () => {
    const { schetDict } = await import('./dict')
    expect(schetDict.ru.vatIncluded('0 ₸', 0)).toBe('в т.ч. НДС 0%: 0 ₸')
    expect(schetDict.ru.vatIncluded('1 600 ₸', 16)).toBe('в т.ч. НДС 16%: 1 600 ₸')
    expect(schetDict.kk.vatIncluded('0 ₸', 0)).toBe('оның ішінде ҚҚС 0%: 0 ₸')
    expect(schetDict.en.vatIncluded('0 ₸', 0)).toBe('incl. VAT 0%: 0 ₸')
  })
})
