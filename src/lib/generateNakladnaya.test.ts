import { describe, it, expect } from 'vitest'
import { buildNakladnayaHtml } from './generateNakladnaya'

const base = {
  number: 'НК-12',
  date: '14.10.2026',
  clientName: 'ТОО «Ромашка»',
  clientBin: '123456789012',
  total: 1000,
  services: [{ name: 'Бумага А4 «Снегурочка» №1', qty: 2, price: 500, unit: 'пачка', type: 'product' as const }],
  profile: {
    company_name: 'ИП Иванов',
    bin_iin: '900101300123',
    address: 'г. Алматы, ул. Абая 1',
    phone: '+7 701 000 00 00',
    director_name: 'Иванов И.И.',
  },
}

// Всё, что выглядит как исполняемая разметка, но не наша.
function scriptTags(html: string): string[] {
  return html.match(/<script[^>]*>/gi) || []
}

describe('buildNakladnayaHtml — экранирование', () => {
  it('escapes hostile client name, item name, profile fields and number', () => {
    const html = buildNakladnayaHtml({
      ...base,
      number: "1');alert(1);//</script><script>alert(2)</script>",
      clientName: '<img src=x onerror=alert(1)>',
      clientBin: '"><svg onload=alert(1)>',
      services: [{
        name: '</td><script>alert(1)</script>',
        code: '<b>c</b>',
        unit: '<i>u</i>',
        qty: 1,
        price: 10,
        type: 'product',
      }],
      profile: {
        ...base.profile,
        company_name: '<script>alert("co")</script>',
        address: '<img src=x onerror=alert(2)>',
        phone: "'><script>",
        director_name: '<u onmouseover=x>',
        bin_iin: '&<>',
      },
    })!
    expect(html).not.toBeNull()
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;script&gt;alert(&quot;co&quot;)&lt;/script&gt;')
    expect(html).toContain('&amp;&lt;&gt;')
    expect(html).not.toMatch(/<img src=x/i)
    expect(html).not.toMatch(/<[a-z]+[^>]*\son(error|load|mouseover)=/i)
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<b>c</b>')
    // Только наши два <script> (html2pdf с CDN и downloadPDF) и ни одного '</script' в JS-строке имени файла.
    expect(scriptTags(html)).toHaveLength(2)
    const inline = html.slice(html.lastIndexOf('<script>'))
    const filenameLine = inline.split('\n').find(l => l.includes('filename:'))!
    expect(filenameLine).not.toMatch(/<\/script/i)
    expect(filenameLine).toContain(String.fromCharCode(92) + 'u003c/script>')
  })

  it('drops non-http(s)/data:image image sources and escapes allowed ones', () => {
    const html = buildNakladnayaHtml(base, {
      logoBase64: 'javascript:alert(1)',
      signatureBase64: 'https://x.test/s.png?a="><script>',
      stampBase64: 'data:image/png;base64,AAAA',
    })!
    expect(html).not.toContain('javascript:')
    expect(html).toContain('src="https://x.test/s.png?a=&quot;&gt;&lt;script&gt;"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('renders normal Russian text unchanged', () => {
    const html = buildNakladnayaHtml(base)!
    expect(html).toContain('Накладная №НК-12</span>')
    expect(html).toContain('ТОО «Ромашка»<br>БИН: 123456789012')
    expect(html).toContain('<td>Бумага А4 «Снегурочка» №1</td>')
    expect(html).toContain('>пачка</td>')
    expect(html).toContain('ИП Иванов, г. Алматы, ул. Абая 1, тел: +7 701 000 00 00')
    expect(html).toContain('filename: "Накладная-НК-12.pdf",')
  })

  it('returns null when there are no products', () => {
    expect(buildNakladnayaHtml({ ...base, services: [{ name: 'Услуга', qty: 1, price: 1, type: 'service' }] })).toBeNull()
  })
})
