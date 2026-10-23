import { describe, it, expect } from 'vitest'
import { buildAVRHtml } from './generateAVR'

const baseProfile = {
  company_name: 'ТОО «Ромашка»',
  bin_iin: '123456789012',
  address: 'г. Алматы, пр. Абая 1',
  phone: '+7 777 123 45 67',
  director_name: 'Иванов И.И.',
}

function build(overrides: Record<string, unknown> = {}, images = {}) {
  return buildAVRHtml(
    {
      number: '15',
      date: '14.10.2026',
      clientName: 'ИП Петров',
      clientBin: '987654321098',
      clientAddress: 'г. Астана',
      services: [{ name: 'Консультация', qty: 2, price: 5000, unit: 'час' }],
      total: 10000,
      profile: baseProfile,
      ...overrides,
    } as Parameters<typeof buildAVRHtml>[0],
    images,
  ) as string
}

// Наш собственный шаблон содержит ровно два <script> (html2pdf и downloadPDF);
// любой третий — инъекция.
function countScriptTags(html: string) {
  return (html.match(/<script/gi) || []).length
}

describe('buildAVRHtml — экранирование', () => {
  it('escapes a hostile client name and item name', () => {
    const html = build({
      clientName: '<img src=x onerror=alert(1)>',
      services: [{ name: '</td><script>alert(1)</script>', qty: 1, price: 100 }],
    })
    expect(html).not.toContain('<img src=x')
    // обработчик внутри настоящего тега; экранированный текст «&lt;img … onerror=…&gt;» безвреден
    expect(html).not.toMatch(/<[a-z][^<>]*onerror=/i)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(countScriptTags(html)).toBe(3) // html2pdf + downloadPDF + docFit (подгонка под ширину телефона)
  })

  it('escapes every other user field', () => {
    const evil = '"><svg onload=alert(1)>'
    const html = build({
      number: evil,
      date: evil,
      contractNumber: evil,
      contractDate: evil,
      clientBin: evil,
      clientAddress: evil,
      services: [{ name: 'Услуга', qty: 1, price: 1, unit: evil }],
      profile: {
        company_name: evil,
        bin_iin: evil,
        address: evil,
        phone: evil,
        director_name: evil,
      },
    })
    expect(html).not.toContain('<svg')
    expect(html).not.toMatch(/<[a-z][^<>]*onload=/i)
  })

  it('cannot break out of the PDF filename JS string', () => {
    const html = build({ number: "1'); alert(1); ('</script><script>alert(2)//" })
    expect(countScriptTags(html)).toBe(3) // html2pdf + downloadPDF + docFit (подгонка под ширину телефона)
    const BS = String.fromCharCode(92) // обратный слэш
    expect(html).toContain(`filename: "АВР-1'); alert(1); ('${BS}u003c/script>${BS}u003cscript>alert(2)//.pdf"`)
  })

  it('drops non-http(s)/non-data:image image URLs and escapes the rest', () => {
    const html = build({}, {
      logo: 'javascript:alert(1)',
      stamp: 'data:text/html,<script>alert(1)</script>',
      signature: 'https://x.test/a.png" onerror="alert(1)',
    })
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
    expect(html).not.toContain('" onerror="')
    expect(html).toContain('src="https://x.test/a.png&quot; onerror=&quot;alert(1)"')
    expect(countScriptTags(html)).toBe(3) // html2pdf + downloadPDF + docFit (подгонка под ширину телефона)
  })

  it('keeps our own data:image URLs', () => {
    const html = build({}, { logo: 'data:image/png;base64,AAAA' })
    expect(html).toContain('<img src="data:image/png;base64,AAAA"')
  })
})

describe('buildAVRHtml — обычные данные не меняются', () => {
  it('renders Russian text, «», № and contract line unchanged', () => {
    const html = build({ contractNumber: 'Д-7/2026', contractDate: '01.10.2026' })
    expect(html).toContain('ИП Петров, г. Астана')
    expect(html).toContain('ТОО «Ромашка», г. Алматы, пр. Абая 1, тел: +7 777 123 45 67')
    expect(html).toContain('АВР №15</span>')
    expect(html).toContain('№Д-7/2026 от 01.10.2026 года')
    expect(html).toContain('<td>Консультация</td>')
    expect(html).toContain('>час</td>')
    expect(html).toContain('>Иванов И.И.</td>')
    expect(html).toContain('filename: "АВР-15.pdf"')
  })

  it('returns null when there are no services', () => {
    expect(build({ services: [{ name: 'Товар', qty: 1, price: 1, type: 'product' }] })).toBeNull()
  })
})

describe('buildAVRHtml — сумма прописью', () => {
  const words = (html: string) => html.match(/Всего оказано услуг на сумму: <u>([^<]*)<\/u>/)?.[1]

  it('prints 21 000 with the feminine «одна тысяча»', () => {
    const html = build({ services: [{ name: 'Работа', qty: 1, price: 21000 }] })
    expect(words(html)).toBe('двадцать одна тысяча тенге 00 тиын')
  })

  it('prints 2 000 000 and a long sum with tiyn', () => {
    expect(words(build({ services: [{ name: 'Работа', qty: 2, price: 1000000 }] }))).toBe('два миллиона тенге 00 тиын')
    expect(words(build({ services: [{ name: 'Работа', qty: 1, price: 1234567.89 }] })))
      .toBe('один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь тенге 89 тиын')
  })

  it('sums only services and matches the «Итого» cell', () => {
    const html = build({
      services: [
        { name: 'А', qty: 2, price: 5000 },
        { name: 'Б', qty: 1, price: 84000 },
        { name: 'Товар', qty: 1, price: 999999, type: 'product' },
      ],
    })
    expect(words(html)).toBe('девяносто четыре тысячи тенге 00 тиын')
    expect(html).toContain('94 000,00')
  })

  it('with 16% VAT the words are the gross total, same as «Итого»', () => {
    const html = build({ vatType: 'vat_16', services: [{ name: 'Работа', qty: 1, price: 116000 }] })
    expect(words(html)).toBe('сто шестнадцать тысяч тенге 00 тиын')
  })

  it('declines 11-14 thousand and takes tiyn from a float product', () => {
    for (const [n, w] of [[11000, 'одиннадцать тысяч'], [12000, 'двенадцать тысяч'], [14000, 'четырнадцать тысяч']] as const) {
      expect(words(build({ services: [{ name: 'Работа', qty: 1, price: n }] }))).toBe(w + ' тенге 00 тиын')
    }
    expect(words(build({ services: [{ name: 'Работа', qty: 3, price: 33.33 }] }))).toMatch(/девяносто девять тенге 99 тиын$/)
  })

  it('works without VAT and does not print the line for a non-numeric total', () => {
    expect(words(build({ vatType: 'no_vat', services: [{ name: 'Работа', qty: 1, price: 5000 }] }))).toBe('пять тысяч тенге 00 тиын')
    expect(build({ services: [{ name: 'Работа', qty: Number.NaN, price: 10 }] })).not.toContain('Всего оказано услуг на сумму')
  })

  it('sits right under the totals table, before the stock line and the signatures', () => {
    const html = build()
    const i = html.indexOf('Всего оказано услуг на сумму')
    expect(i).toBeGreaterThan(html.indexOf('Итого'))
    expect(i).toBeLessThan(html.indexOf('Сведения об использовании запасов'))
    expect(i).toBeLessThan(html.indexOf('Сдал (Исполнитель)'))
  })
})
