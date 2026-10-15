import { describe, it, expect } from 'vitest'
import { buildKPHtml, type KPData } from './generateKP'

function baseData(overrides: Partial<KPData> = {}): KPData {
  return {
    number: 'КП-0012',
    date: '14.10.2026',
    validUntil: '13.11.2026',
    clientName: 'ТОО «Ромашка» № 1',
    clientBin: '123456789012',
    services: [
      { name: 'Дизайн логотипа — «Премиум»', qty: 2, price: 15000, unit: 'усл', code: 'A-1' },
    ],
    total: 30000,
    note: 'Оплата в течение 5 дней',
    vatType: 'no_vat',
    profile: {
      company_name: 'ИП Иванов & Ко',
      bin_iin: '990101300123',
      address: 'г. Алматы, ул. Абая, д. 10',
      phone: '+7 701 000 00 00',
      email: 'info@example.kz',
      director_name: 'Иванов И.И.',
    },
    bank: { bank_name: 'АО «Kaspi Bank»', iik: 'KZ00722S000000000000', bik: 'CASPKZKA', kbe: '19' },
    ...overrides,
  }
}

// Количество наших собственных <script ...> в шаблоне (html2pdf + downloadPDF).
const OWN_SCRIPT_TAGS = (buildKPHtml(baseData()).match(/<script/gi) || []).length

describe('buildKPHtml — экранирование пользовательского текста', () => {
  it('имя клиента с <img onerror> и позиция с </td><script> не становятся разметкой', () => {
    const html = buildKPHtml(
      baseData({
        clientName: '<img src=x onerror=alert(1)>',
        services: [{ name: '</td><script>alert(1)</script>', qty: 1, price: 100, unit: '<b>шт</b>' }],
        total: 100,
      }),
    )

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;шт&lt;/b&gt;')
    expect(html).not.toContain('<img src=x')
    // onerror= нигде не стоит внутри настоящего тега
    expect(html).not.toMatch(/<[^>]*onerror=/i)
    // <script — только наши два тега
    expect((html.match(/<script/gi) || []).length).toBe(OWN_SCRIPT_TAGS)
    expect(html).not.toContain('alert(1)</script>')
  })

  it('экранирует профиль продавца, БИН клиента и банк', () => {
    const evil = '"><svg onload=alert(1)>'
    const html = buildKPHtml(
      baseData({
        clientBin: evil,
        profile: {
          company_name: evil,
          bin_iin: evil,
          address: evil,
          phone: evil,
          email: evil,
          director_name: evil,
        },
        bank: { bank_name: evil, iik: evil, bik: evil, kbe: evil },
      }),
    )
    expect(html).not.toMatch(/<svg/i)
    expect(html).toContain('&quot;&gt;&lt;svg onload=alert(1)&gt;')
  })

  it('номер КП не может выйти из JS-строки имени файла и закрыть </script>', () => {
    const html = buildKPHtml(baseData({ number: "1'</script><script>alert(1)//" }))
    expect((html.match(/<script/gi) || []).length).toBe(OWN_SCRIPT_TAGS)
    expect((html.match(/<\/script>/gi) || []).length).toBe(OWN_SCRIPT_TAGS)
    // В видимых местах — экранированный текст
    expect(html).toContain('КП №1&#39;&lt;/script&gt;&lt;script&gt;alert(1)//')
    // В скрипте — JSON-строка с \u003c вместо «<»
    expect(html).toContain('filename: "КП-1\'\\u003c/script>\\u003cscript>alert(1)//.pdf",')
  })

  it('картинки: пропускает только https/http и data:image/, экранирует атрибут', () => {
    const bad = buildKPHtml(baseData(), {
      logo: 'javascript:alert(1)',
      signature: 'data:text/html,<script>alert(1)</script>',
      stamp: '  JaVaScRiPt:alert(1)',
    })
    expect(bad).not.toContain('javascript:')
    expect(bad).not.toContain('data:text/html')
    expect(bad).not.toMatch(/<img/i)

    const ok = buildKPHtml(baseData(), {
      logo: 'https://cdn.example.kz/logo.png?a=1&b="x"',
      signature: 'data:image/png;base64,AAAA',
      stamp: 'http://example.kz/stamp.png',
    })
    expect(ok).toContain('<img src="https://cdn.example.kz/logo.png?a=1&amp;b=&quot;x&quot;"')
    expect(ok).toContain('<img src="data:image/png;base64,AAAA"')
    expect(ok).toContain('<img src="http://example.kz/stamp.png"')
  })

  it('обычный русский текст выводится без изменений', () => {
    const html = buildKPHtml(baseData())
    expect(html).toContain('<div class="party-name">ТОО «Ромашка» № 1</div>')
    expect(html).toContain('<td class="name">Дизайн логотипа — «Премиум»</td>')
    expect(html).toContain('<td>усл</td>')
    expect(html).toContain('<td>A-1</td>')
    expect(html).toContain('<span>АО «Kaspi Bank»</span>')
    expect(html).toContain('<span>KZ00722S000000000000</span>')
    expect(html).toContain('<div class="kp-number">№ КП-0012</div>')
    expect(html).toContain('<div class="sig-name">Иванов И.И.</div>')
    expect(html).toContain('г. Алматы, ул. Абая, д. 10<br>')
    expect(html).toContain('Тел: +7 701 000 00 00 · info@example.kz')
    expect(html).toContain('filename: "КП-КП-0012.pdf",')
    expect(html).toContain('13.11.2026')
    // «&» в названии компании — единственное, что меняется в разметке (и рендерится так же)
    expect(html).toContain('ИП Иванов &amp; Ко')
  })
})

describe('buildKPHtml — примечание', () => {
  it('печатает примечание (условия, сроки, доставка) и экранирует его', () => {
    const html = buildKPHtml(baseData({ note: 'Пакет документов предоставим вместе с товаром.' }))
    expect(html).toContain('<div class="section-title">Примечание</div>')
    expect(html).toContain('<div class="note-block">Пакет документов предоставим вместе с товаром.</div>')

    const hostile = buildKPHtml(baseData({ note: '<img src=x onerror=alert(1)>' }))
    expect(hostile).toContain('<div class="note-block">&lt;img src=x onerror=alert(1)&gt;</div>')
    expect(hostile).not.toContain('<img src=x')
  })

  it('без примечания блока нет', () => {
    expect(buildKPHtml(baseData({ note: '' }))).not.toContain('class="note-block"')
    expect(buildKPHtml(baseData({ note: '   ' }))).not.toContain('class="note-block"')
  })
})

describe('buildKPHtml — футер', () => {
  it('слоган как на машине: «Сервисы для бизнеса в Казахстане»', () => {
    const html = buildKPHtml(baseData())
    expect(html).toContain('<div class="footer-sub">Сервисы для бизнеса в Казахстане</div>')
    expect(html).not.toContain('Профессиональные счета')
  })
})
