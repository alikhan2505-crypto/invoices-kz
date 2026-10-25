import { describe, it, expect } from 'vitest'
import {
  validateRecipientEmail, buildInvoiceEmailHtml, invoiceEmailSubject, plainSubject, safeHttpsUrl, num,
} from './invoiceEmail'

describe('validateRecipientEmail', () => {
  it('accepts an ordinary address and trims it', () => {
    expect(validateRecipientEmail('  client@example.kz ')).toEqual({ ok: true, email: 'client@example.kz' })
    expect(validateRecipientEmail('a.b+tag@sub.mail-host.com')).toEqual({ ok: true, email: 'a.b+tag@sub.mail-host.com' })
    expect(validateRecipientEmail('x@y.kz').ok).toBe(true)
    // перевод строки по краям срезается trim-ом, а не попадает в адрес
    expect(validateRecipientEmail('a@b.kz\n')).toEqual({ ok: true, email: 'a@b.kz' })
  })

  it('rejects anything that is not a string (arrays, objects, numbers, null)', () => {
    for (const v of [['a@b.kz'], ['a@b.kz', 'c@d.kz'], { email: 'a@b.kz' }, 123, null, undefined, true]) {
      expect(validateRecipientEmail(v).ok).toBe(false)
    }
  })

  it('rejects several addresses and header-injection attempts', () => {
    for (const v of [
      'a@b.kz,c@d.kz', 'a@b.kz;c@d.kz', 'a@b.kz c@d.kz', 'a@b.kz\nBcc: evil@x.kz', 'a@b.kz\r\nBcc: evil@x.kz',
      'a@b.kz\nc@d.kz', '"Name" <a@b.kz>', '<a@b.kz>', 'Имя <a@b.kz>', 'a@b.kz>',
    ]) {
      expect(validateRecipientEmail(v).ok, JSON.stringify(v)).toBe(false)
    }
  })

  it('rejects malformed addresses', () => {
    for (const v of ['', '   ', 'plain', '@b.kz', 'a@', 'a@b', 'a@b.', 'a@.kz', 'a..b@c.kz', '.a@b.kz', 'a.@b.kz', 'a@b..kz', 'a@-b.kz', 'a@b.k']) {
      expect(validateRecipientEmail(v).ok, JSON.stringify(v)).toBe(false)
    }
  })

  it('caps the length at 254 characters', () => {
    const long = 'a'.repeat(64) + '@' + 'b'.repeat(60) + '.' + 'c'.repeat(60) + '.' + 'd'.repeat(60) + '.kz'
    expect(long.length).toBeLessThanOrEqual(254)
    expect(validateRecipientEmail('a'.repeat(250) + '@b.kz').ok).toBe(false)
    expect(validateRecipientEmail('a'.repeat(300) + '@b.kz').ok).toBe(false)
  })
})

describe('buildInvoiceEmailHtml', () => {
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&'
  const base = {
    number: '15',
    amount: '12500',
    clientName: evil,
    createdAt: '2026-10-20T10:00:00Z',
    services: [{ name: evil, qty: 2, price: 5000, unit: evil }, { name: 'Работа', qty: '1', price: '2500' }],
    note: evil,
    publicToken: 'tok/../"><x',
    kaspiPaymentLink: 'https://pay.kaspi.kz/pay/abc',
  }

  it('escapes every user-controlled field', () => {
    const html = buildInvoiceEmailHtml(base)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('onerror=alert(2)>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    // имя клиента, услуга, ед. изм. и примечание — четыре вхождения
    expect(html.split('&lt;script&gt;').length - 1).toBe(4)
  })

  it('keeps the public token inside the URL path', () => {
    const html = buildInvoiceEmailHtml(base)
    expect(html).toContain('https://invoices.kz/view/tok%2F..%2F%22%3E%3Cx')
    expect(html).not.toContain('"><x')
  })

  it('coerces numbers and never prints NaN', () => {
    const html = buildInvoiceEmailHtml({ ...base, amount: 'abc', services: [{ name: 'x', qty: 'many', price: { a: 1 } }] })
    expect(html).not.toContain('NaN')
  })

  it('renders the happy path: amounts, kaspi button, note block', () => {
    const html = buildInvoiceEmailHtml({ ...base, clientName: 'ТОО Ромашка', services: [{ name: 'Работа', qty: 2, price: 5000, unit: 'час' }], note: 'Спасибо' })
    expect(html).toContain('ТОО Ромашка')
    expect(html).toContain('2 час')
    expect(html).toContain('ОПЛАТИТЬ ЧЕРЕЗ KASPI')
    expect(html).toContain('href="https://pay.kaspi.kz/pay/abc"')
    expect(html).toContain('Кнопка для клиентов Kaspi.kz')
    expect(html).toContain('Спасибо')
    expect(html).toContain('ОТКРЫТЬ СЧЁТ ОНЛАЙН')
  })

  it('drops a non-https payment link and an empty note', () => {
    const html = buildInvoiceEmailHtml({ ...base, kaspiPaymentLink: 'javascript:alert(1)', note: '' })
    expect(html).not.toContain('ОПЛАТИТЬ ЧЕРЕЗ KASPI')
    expect(html).not.toContain('Кнопка для клиентов Kaspi.kz')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('Примечание')
  })

  it('survives garbage services', () => {
    expect(() => buildInvoiceEmailHtml({ ...base, services: 'oops' })).not.toThrow()
    expect(() => buildInvoiceEmailHtml({ ...base, services: [null, 5, {}] })).not.toThrow()
  })
})

describe('subject helpers', () => {
  it('strips line breaks from the subject and keeps text unescaped', () => {
    const s = invoiceEmailSubject({ number: '1\r\nBcc: x@y.kz', amount: 1000, clientName: 'A & B\nC' })
    expect(s).not.toMatch(/[\r\n]/)
    expect(s).toContain('A & B C')
  })
  it('plainSubject caps length', () => {
    expect(plainSubject('x'.repeat(500)).length).toBe(200)
  })
})

describe('small helpers', () => {
  it('num', () => {
    expect(num('12')).toBe(12)
    expect(num('abc')).toBe(0)
    expect(num(Infinity)).toBe(0)
    expect(num(undefined)).toBe(0)
  })
  it('safeHttpsUrl', () => {
    expect(safeHttpsUrl('https://a.kz/x?y=1')).toBe('https://a.kz/x?y=1')
    expect(safeHttpsUrl('http://a.kz')).toBeNull()
    expect(safeHttpsUrl('https://a.kz/"onmouseover=')).toBeNull()
    expect(safeHttpsUrl(null)).toBeNull()
  })
})
