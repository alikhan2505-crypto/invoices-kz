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
    expect(countScriptTags(html)).toBe(2)
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
    expect(countScriptTags(html)).toBe(2)
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
    expect(countScriptTags(html)).toBe(2)
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
