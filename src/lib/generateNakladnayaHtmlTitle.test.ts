import { describe, it, expect } from 'vitest'
import { buildNakladnayaHtml } from './generateNakladnaya'

const base = {
  number: 'НК-12',
  date: '14.10.2026',
  clientName: 'ТОО «Ромашка»',
  clientBin: '123456789012',
  total: 1000,
  services: [{ name: 'Бумага А4', qty: 2, price: 500, unit: 'пачка', type: 'product' as const }],
  profile: { company_name: 'ИП Иванов', bin_iin: '900101300123', address: 'г. Алматы', phone: '+7 701 000 00 00', director_name: 'Иванов И.И.' },
}

describe('buildNakladnayaHtml — название вкладки документа (14.11.2026)', () => {
  it('в окне документа есть title с номером накладной, чужой номер экранируется', () => {
    expect(buildNakladnayaHtml(base)!).toContain('<title>Накладная № НК-12 · invoices.kz</title>')
    const html = buildNakladnayaHtml({ ...base, number: '</title><script>alert(1)</script>' })!
    expect(html).not.toContain('</title><script>alert(1)')
  })
})
