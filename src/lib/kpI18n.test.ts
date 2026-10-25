import { describe, it, expect, vi } from 'vitest'

// generateKP тянет imageResize (Image/canvas, в node нет); картинок в тестах нет.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import { buildKPHtml, type KPData } from './generateKP'
import { KP_LANGS, KP_STRINGS, KK_DOC_UNDER_REVIEW, isKpLang, kpFileName, kpStrings, kpUnitLabel, type KpLang, type KpStrings } from './kpI18n'
import { TOOL_UNITS } from '@/lib/tools-i18n/units'
import { UNIT_OPTIONS } from '@/lib/i18n/units'

const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/

function latinData(lang: KpLang, overrides: Partial<KPData> = {}): KPData {
  return {
    lang,
    number: 'A-12',
    date: '14.10.2026',
    validUntil: '13.11.2026',
    clientName: 'Client LLP',
    clientBin: '123456789012',
    clientAddress: '1 Main St, Almaty',
    clientPhone: '+7 700 111 22 33',
    clientEmail: 'buyer@example.com',
    services: [
      { name: 'Logo design', qty: 2, price: 15000, unit: 'услуга', code: 'A-1' },
      { name: 'Printing', qty: 1, price: 50, unit: 'упак.' },
      { name: 'Paper', qty: 3, price: 10 },
    ],
    total: 30080,
    note: 'Payment within 5 days',
    vatType: 'vat_16',
    profile: {
      company_name: 'Acme Ltd',
      bin_iin: '990101300123',
      address: '10 Abay Ave, Almaty',
      phone: '+7 701 000 00 00',
      email: 'info@example.com',
      director_name: 'John Smith',
    },
    bank: { bank_name: 'Sample Bank', iik: 'KZ00722S000000000000', bik: 'SAMPKZKA', kbe: '19' },
    ...overrides,
  }
}

/** Видимый текст документа: без комментариев, style, script и тегов, по одной строке на узел. */
function visibleLines(html: string): string[] {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
}

/** Строковые значения словаря (dateLine - функция, проверяем отдельно). */
function stringEntries(d: KpStrings): [string, string][] {
  return Object.entries(d).filter(([, v]) => typeof v === 'string') as [string, string][]
}

describe('kpI18n dictionary', () => {
  it('has the same keys in ru, kk and en and no empty strings (except ru htmlLang)', () => {
    const keys = Object.keys(KP_STRINGS.ru).sort()
    for (const lang of KP_LANGS) {
      expect(Object.keys(KP_STRINGS[lang]).sort(), lang).toEqual(keys)
      for (const [k, v] of stringEntries(KP_STRINGS[lang])) {
        if (lang === 'ru' && k === 'htmlLang') continue
        expect(v.trim(), `${lang}.${k}`).not.toBe('')
      }
      const line = KP_STRINGS[lang].dateLine('14.10.2026')
      expect(line, `${lang}.dateLine`).toContain('14.10.2026')
      expect(line.trim().length).toBeGreaterThan('14.10.2026'.length)
    }
  })

  it('en has no Cyrillic at all; kk keeps its own terminology', () => {
    expect(JSON.stringify([stringEntries(KP_STRINGS.en), KP_STRINGS.en.dateLine('x')])).not.toMatch(CYRILLIC)
    const kk = KP_STRINGS.kk
    expect(kk.title).toBe('Коммерциялық ұсыныс')
    expect(kk.supplier).toBe('Жеткізуші')
    expect(kk.buyer).toBe('Сатып алушы')
    expect(kk.vat16).toBe('ҚҚС 16%:')
    expect(kk.bin).toBe('БСН: ')
    expect(kk.iik).toBe('ЖСК')
    expect(kk.bik).toBe('БСК')
    // Русские сокращения на казахском бланке недопустимы.
    expect(JSON.stringify(stringEntries(kk))).not.toMatch(/БИН|ИИН|НДС|КП|ИТОГО|Поставщик|Покупатель/)
  })

  it('every translated label differs from the Russian one (nothing left untranslated by accident)', () => {
    // Исключения - слова, одинаковые в языках по делу.
    const same = new Set(['htmlLang', 'tel', 'email', 'colNo', 'bank', 'kbe', 'numberSign'])
    for (const lang of ['kk', 'en'] as const) {
      for (const [k, v] of stringEntries(KP_STRINGS[lang])) {
        if (same.has(k)) continue
        expect(v, `${lang}.${k}`).not.toBe((KP_STRINGS.ru as unknown as Record<string, string>)[k])
      }
    }
  })

  it('falls back to Russian for an unknown language', () => {
    expect(kpStrings(undefined)).toBe(KP_STRINGS.ru)
    expect(kpStrings('de')).toBe(KP_STRINGS.ru)
    expect(isKpLang('kk')).toBe(true)
    expect(isKpLang('KK')).toBe(false)
    expect(KP_LANGS).toEqual(['ru', 'kk', 'en'])
  })

  it('picks a sensible PDF file prefix per language', () => {
    expect(kpFileName('ru', '12')).toBe('КП-12.pdf')
    expect(kpFileName('kk', '12')).toBe('КҰ-12.pdf')
    expect(kpFileName('en', '12')).toBe('Proposal-12.pdf')
  })

  it('keeps the review flag on until the founder has read the Kazakh text', () => {
    // Меняется ровно одним значением после вычитки; тест напоминает, что флаг есть.
    expect(typeof KK_DOC_UNDER_REVIEW).toBe('boolean')
  })
})

describe('kpUnitLabel', () => {
  it('leaves the Russian document alone (empty - "шт")', () => {
    expect(kpUnitLabel('услуга', 'ru')).toBe('услуга')
    expect(kpUnitLabel('усл', 'ru')).toBe('усл')
    expect(kpUnitLabel(undefined, 'ru')).toBe('шт')
    expect(kpUnitLabel('', 'ru')).toBe('шт')
  })

  it('translates the standard units on kk/en and keeps free text as typed', () => {
    expect(kpUnitLabel('шт', 'kk')).toBe('дана')
    expect(kpUnitLabel('услуга', 'kk')).toBe('қызмет')
    expect(kpUnitLabel('упак.', 'kk')).toBe('қаптама')
    expect(kpUnitLabel('шт', 'en')).toBe('pcs')
    expect(kpUnitLabel('услуга', 'en')).toBe('service')
    expect(kpUnitLabel('усл', 'en')).toBe('service')
    expect(kpUnitLabel('  Час ', 'en')).toBe('hour')
    expect(kpUnitLabel(undefined, 'kk')).toBe('дана')
    expect(kpUnitLabel('', 'en')).toBe('pcs')
    // Пользовательский ввод остаётся как есть.
    expect(kpUnitLabel('коробка', 'en')).toBe('коробка')
    expect(kpUnitLabel('box', 'kk')).toBe('box')
  })

  it('covers every unit offered in /tools and in the cabinet, with no Cyrillic in English', () => {
    for (const u of [...TOOL_UNITS, ...UNIT_OPTIONS]) {
      expect(kpUnitLabel(u, 'en'), `en ${u}`).not.toMatch(CYRILLIC)
      expect(kpUnitLabel(u, 'kk').trim(), `kk ${u}`).not.toBe('')
    }
  })
})

describe('buildKPHtml: language', () => {
  it('without lang the document is Russian, same as lang "ru"', () => {
    const a = buildKPHtml(latinData('ru', { lang: undefined }))
    const b = buildKPHtml(latinData('ru'))
    expect(a).toBe(b)
    expect(a).toContain('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ')
    expect(a).toContain('<html>')
    expect(a).toContain('filename: "КП-A-12.pdf",')
    expect(a).toContain("btn.textContent = '⏳ Загрузка...'")
    // Единицы русского документа не переводятся.
    expect(a).toContain('<td>услуга</td>')
    expect(a).toContain('<td>шт</td>')
  })

  it('an unknown lang value prints Russian', () => {
    const html = buildKPHtml({ ...latinData('ru'), lang: 'de' as unknown as KpLang })
    expect(html).toContain('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ')
  })

  it('en: every service label is English, no Cyrillic in the visible text or the script literals', () => {
    for (const vat of ['vat_16', 'vat_0', 'no_vat'] as const) {
      for (const withBank of [true, false]) {
        const html = buildKPHtml(latinData('en', { vatType: vat, bank: withBank ? latinData('en').bank : undefined }))
        const text = visibleLines(html).join('\n')
        expect(text, `${vat} bank=${withBank}`).not.toMatch(CYRILLIC)
        // Строки внутри <script> (кнопка, имя файла) - тоже английские.
        expect(html.match(/textContent = '[^']*'/g)!.join('')).not.toMatch(CYRILLIC)
        expect(html).toContain('filename: "Proposal-A-12.pdf",')
        expect(html).toContain('<html lang="en">')
      }
    }
  })

  it('en: prints the expected English labels and translated units', () => {
    const html = buildKPHtml(latinData('en'))
    for (const s of [
      'COMMERCIAL PROPOSAL', 'No. A-12', 'dated 14.10.2026', 'Commercial proposal', 'Supplier', 'Buyer', 'BIN (tax ID): 990101300123',
      'Tel: +7 701 000 00 00', 'Email: info@example.com', 'List of goods / services', 'Description', 'Qty', 'Unit', 'Price', 'Amount',
      'Subtotal excl. VAT:', 'VAT 16%:', 'TOTAL DUE:', 'Note', 'Bank details', 'Account number (IIK)', 'Bank code (BIK)', 'Beneficiary code (KBe)',
      'Director / Representative', 'Date issued', 'Valid until', 'Business services in Kazakhstan', '← Back', '🖨️ Print', '💾 Download PDF', 'Proposal No. A-12',
    ]) expect(html, s).toContain(s)
    expect(html).toContain('<td>service</td>')
    expect(html).toContain('<td>pack</td>')
    expect(html).toContain('<td>pcs</td>')
    expect(html).toContain('<th style="width:8%">Code</th>')
  })

  it('kk: Kazakh labels, kk units, <html lang>, filename prefix', () => {
    const html = buildKPHtml(latinData('kk'))
    for (const s of [
      'КОММЕРЦИЯЛЫҚ ҰСЫНЫС', '№ A-12', '14.10.2026 ж.', 'Коммерциялық ұсыныс', 'Жеткізуші', 'Сатып алушы', 'БСН: 990101300123',
      'Құрметті серіктестер', 'Тауарлар / қызметтер тізбесі', 'Атауы', 'Саны', 'Бағасы', 'Сомасы', 'ҚҚС-сыз жиыны:', 'ҚҚС 16%:', 'ТӨЛЕУГЕ БАРЛЫҒЫ:',
      'Ескертпе', 'Банк деректемелері', 'ЖСК', 'БСК', 'КБе', 'Басшы / Өкіл', 'Жасалған күні', 'Жарамдылық мерзімі', '← Артқа', 'КҰ №A-12',
    ]) expect(html, s).toContain(s)
    expect(html).toContain('<td>қызмет</td>')
    expect(html).toContain('<td>қаптама</td>')
    expect(html).toContain('<td>дана</td>')
    expect(html).toContain('<html lang="kk">')
    expect(html).toContain('filename: "КҰ-A-12.pdf",')
    expect(html).toContain('<th style="width:8%">Коды</th>')
  })

  it('kk: none of the Russian service labels is left in the visible text', () => {
    const lines = visibleLines(buildKPHtml(latinData('kk')))
    const text = lines.join('\n')
    for (const [k, ru] of stringEntries(KP_STRINGS.ru)) {
      const kk = (KP_STRINGS.kk as unknown as Record<string, string>)[k]
      if (ru === kk || ru.trim() === '') continue
      const label = ru.trim()
      expect(lines, `${k}: "${label}" as a whole line`).not.toContain(label)
      if (label.length >= 8) expect(text, `${k}: "${label}"`).not.toContain(label)
    }
    // Явные русские подписи (в том числе короткие) отсутствуют.
    for (const bad of ['Поставщик', 'Покупатель', 'Наименование', 'Количество', 'Кол-во', 'Банковские реквизиты', 'ИТОГО К ОПЛАТЕ', 'Руководитель', 'Дата составления', 'Действителен до', 'Примечание', 'Итого', 'НДС', 'БИН', 'ИИК', 'БИК']) {
      expect(text, bad).not.toContain(bad)
    }
    expect(html2script(buildKPHtml(latinData('kk')))).not.toMatch(/Загрузка|Скачать/)
  })

  it('user data in any language is printed as typed, even Russian, and still escaped', () => {
    for (const lang of ['kk', 'en'] as const) {
      const html = buildKPHtml(latinData(lang, {
        clientName: 'ТОО «Ромашка» <b>',
        note: 'Оплата в течение 5 дней',
        services: [{ name: 'Дизайн <img src=x onerror=1>', qty: 1, price: 100, unit: 'коробка' }],
        total: 100,
        profile: { company_name: 'ИП Иванов', bin_iin: '990101300123', address: 'г. Алматы', director_name: 'Иванов И.И.' },
      }))
      expect(html).toContain('ТОО «Ромашка» &lt;b&gt;')
      expect(html).toContain('Оплата в течение 5 дней')
      expect(html).toContain('Дизайн &lt;img src=x onerror=1&gt;')
      expect(html).not.toContain('<img src=x')
      expect(html).toContain('<td>коробка</td>')
      expect(html).toContain('ИП Иванов')
      expect(html).toContain('Иванов И.И.')
    }
  })

  it('does not change amounts or the VAT split between languages', () => {
    const grab = (html: string) => (html.match(/[\d  ]+,\d\d ₸/g) ?? []).map(x => x.replace(/\s/g, ' '))
    const ru = grab(buildKPHtml(latinData('ru')))
    expect(ru.length).toBeGreaterThan(6)
    expect(grab(buildKPHtml(latinData('kk')))).toEqual(ru)
    expect(grab(buildKPHtml(latinData('en')))).toEqual(ru)
  })

  it('uses the default company name in the document language when the profile is missing', () => {
    expect(buildKPHtml(latinData('ru', { profile: undefined }))).toContain('ИП First Project')
    expect(buildKPHtml(latinData('kk', { profile: undefined }))).toContain('ЖК First Project')
    expect(buildKPHtml(latinData('en', { profile: undefined }))).toContain('Sole proprietor First Project')
  })

  it('totals rows: kk and en have no "VAT"/"НДС" mismatches for vat_0 and no_vat', () => {
    const kk0 = visibleLines(buildKPHtml(latinData('kk', { vatType: 'vat_0' }))).join('\n')
    expect(kk0).toContain('ҚҚС 0%:')
    expect(kk0).toContain('Жиыны:')
    const enNo = visibleLines(buildKPHtml(latinData('en', { vatType: 'no_vat' }))).join('\n')
    expect(enNo).toContain('No VAT')
    expect(enNo).toContain('Total:')
  })
})

/** Содержимое последнего <script> документа (с downloadPDF). */
function html2script(html: string): string {
  const m = html.match(/function downloadPDF[\s\S]*?\n {8}}\n/)
  return m ? m[0] : ''
}
