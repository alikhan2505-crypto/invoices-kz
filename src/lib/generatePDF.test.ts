import { describe, it, expect, vi } from 'vitest'

// resizeToFit работает через Image/canvas (нет в node). Подменяем поведением
// ветки onerror: исходный URL возвращается как есть — именно этот путь
// пропускает пользовательскую ссылку в src.
vi.mock('./imageResize', () => ({
  resizeToFit: async (url: string) => url,
}))

import { generateInvoicePDF, safeImageSrc } from './generatePDF'

const base = {
  number: 'СЧ-42',
  date: '14.10.2026',
  clientName: 'ТОО «Ромашка»',
  clientBin: '123456789012',
  clientEmail: 'client@example.kz',
  clientAddress: 'г. Астана, пр. Республики 5',
  clientPhone: '+7 702 111 22 33',
  services: [{ name: 'Бумага А4 «Снегурочка» №1', qty: 2, price: 500, unit: 'пачка' }],
  total: 1000,
  note: 'Оплата в течение 5 дней, ₸',
  contractNumber: 'Д-7',
  contractDate: '01.10.2026',
  autoPrint: false,
  profile: {
    company_name: 'ИП Иванов',
    bin_iin: '900101300123',
    address: 'г. Алматы, ул. Абая 1',
    phone: '+7 701 000 00 00',
    director_name: 'Иванов И.И.',
  },
  bank: { bank_name: 'АО «Kaspi Bank»', iik: 'KZ00722S000000000000', bik: 'CASPKZKA', kbe: '19' },
}

const OUR_SCRIPTS = 3 // html2pdf в <head> + html2pdf у тулбара + downloadPDF()

function scriptOpenTags(html: string): string[] {
  return html.match(/<script[^>]*>/gi) || []
}

describe('generateInvoicePDF — экранирование', () => {
  it('escapes hostile client/item/profile/bank text', async () => {
    const html = await generateInvoicePDF({
      ...base,
      clientName: '<img src=x onerror=alert(1)>',
      clientAddress: '"><svg onload=alert(1)>',
      clientPhone: "'><b>x</b>",
      clientBin: '<i>bin</i>',
      contractNumber: '<script>alert(3)</script>',
      contractDate: '&lt;',
      note: '<iframe src=javascript:alert(1)>',
      knp: '<u>849</u>',
      services: [
        { name: '</td><script>alert(1)</script>', qty: 1, price: 100, unit: '<b>u</b>', code: '<s>c</s>' },
      ],
      profile: {
        ...base.profile,
        company_name: '<script>alert("co")</script>',
        address: '<img src=x onerror=alert(2)>',
        director_name: '</span><script>alert(4)</script>',
      },
      bank: { bank_name: '<b>bank</b>', iik: '<i>iik</i>', bik: '<i>bik</i>', kbe: '<i>19</i>' },
    })

    // onerror= / onload= не должно оказаться внутри какого-либо тега.
    expect(html).not.toMatch(/<[^>]*\son(error|load)=/i)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<script>alert')
    expect(html).not.toMatch(/<(b|i|u|s)>(x|bin|849|c|u|bank|iik|bik|19)</)
    expect(scriptOpenTags(html)).toHaveLength(OUR_SCRIPTS)

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;&gt;&lt;svg onload=alert(1)&gt;')
    expect(html).toContain('&#39;&gt;&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('№&lt;script&gt;alert(3)&lt;/script&gt; от &amp;lt;')
    expect(html).toContain('&lt;script&gt;alert(&quot;co&quot;)&lt;/script&gt;')
  })

  it('keeps the invoice number from breaking out of the inline downloadPDF script', async () => {
    const html = await generateInvoicePDF({
      ...base,
      number: "1');alert(1);//</script><script>alert(2)</script>",
    })
    // Старый вид — filename: 'Счёт-…' в одинарных кавычках — давал выход из строки.
    expect(html).not.toContain("'Счёт-1');alert(1)")
    expect(html).not.toContain('</script><script>alert(2)')
    expect(scriptOpenTags(html)).toHaveLength(OUR_SCRIPTS)
    // В JS-строке имени файла — JSON-строка с < вместо «<».
    expect(html).toContain(
      'filename: "Счёт-1\');alert(1);//\\u003c/script>\\u003cscript>alert(2)\\u003c/script>.pdf",',
    )
    // В видимом тексте — HTML-экранирование.
    expect(html).toContain('Счёт №1&#39;);alert(1);//&lt;/script&gt;')
  })

  it('drops non-image URLs from logo/signature/stamp and escapes allowed ones', async () => {
    const html = await generateInvoicePDF({
      ...base,
      profile: {
        ...base.profile,
        logo_url: 'javascript:alert(1)',
        signature_url: 'data:text/html,<script>alert(1)</script>',
        stamp_url: 'https://cdn.example.kz/stamp.png?a=1&b="x" onerror="alert(1)',
      },
    })
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
    expect(html).toContain('src="https://cdn.example.kz/stamp.png?a=1&amp;b=&quot;x&quot; onerror=&quot;alert(1)"')
    expect(html).not.toContain('onerror="alert')
  })

  it('renders normal Russian text unchanged', async () => {
    const html = await generateInvoicePDF(base)
    expect(html).toContain('<div class="title">Счет на оплату №СЧ-42 от 14.10.2026</div>')
    expect(html).toContain(
      'ИИН/БИН: 123456789012, ТОО «Ромашка», г. Астана, пр. Республики 5, тел: +7 702 111 22 33',
    )
    expect(html).toContain('ИИН/БИН: 900101300123, ИП Иванов, г. Алматы, ул. Абая 1, тел: +7 701 000 00 00')
    expect(html).toContain('<td class="left">Бумага А4 «Снегурочка» №1</td>')
    expect(html).toContain('<td>пачка</td>')
    expect(html).toContain('<b>Банк бенефициара:</b><br>АО «Kaspi Bank»')
    expect(html).toContain('№Д-7 от 01.10.2026')
    expect(html).toContain('<b>Примечание:</b> Оплата в течение 5 дней, ₸')
    expect(html).toContain('/ Иванов И.И.')
    expect(html).toContain("filename: \"Счёт-СЧ-42.pdf\",")
    expect(html).not.toContain('&amp;')
    expect(html).not.toContain('&quot;')
  })
})

describe('safeImageSrc', () => {
  it('allows our data:image and http(s) URLs only', () => {
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeImageSrc('https://x.kz/a.png')).toBe('https://x.kz/a.png')
    expect(safeImageSrc('http://x.kz/a.png')).toBe('http://x.kz/a.png')
    expect(safeImageSrc('JavaScript:alert(1)')).toBe('')
    expect(safeImageSrc(' data:text/html,<b>')).toBe('')
    expect(safeImageSrc('')).toBe('')
    expect(safeImageSrc(undefined)).toBe('')
  })
})
