import { describe, it, expect } from 'vitest'
import { docQrHtml, docQrUrl, docQrDataUri, isLegalEntityBin } from './docQr'
import { buildAVRHtml } from './generateAVR'
import { buildNakladnayaHtml } from './generateNakladnaya'
import { buildKPHtml } from './generateKP'
import { generateInvoicePDF } from './generatePDF'

const TOO_BIN = '050140008166' // 5-я цифра 4: юрлицо
const IP_IIN = '890525350143' // 5-я цифра 2: ИП / физлицо

describe('QR «Проверить продавца по БИН» на бесплатных документах', () => {
  it('БИН кладётся в ссылку только у юрлица; у ИП и физлица ссылка без номера', () => {
    expect(isLegalEntityBin(TOO_BIN)).toBe(true)
    // верная цифра нужна: опечатка в БИН не должна уводить на чужую фирму или класть чужой ИИН в ссылку
    expect(isLegalEntityBin('050140008167')).toBe(false)
    expect(isLegalEntityBin('456000000000')).toBe(false)
    expect(isLegalEntityBin(IP_IIN)).toBe(false)
    expect(isLegalEntityBin('12345')).toBe(false)
    expect(isLegalEntityBin(undefined)).toBe(false)
    expect(docQrUrl('schet', TOO_BIN)).toBe('https://invoices.kz/tools/kontragent?bin=050140008166&utm_source=doc_qr&utm_medium=doc&utm_campaign=schet_qr')
    expect(docQrUrl('avr', IP_IIN)).toBe('https://invoices.kz/tools/kontragent?utm_source=doc_qr&utm_medium=doc&utm_campaign=avr_qr')
    expect(docQrUrl('kp', '05 01-4000 8166')).toContain('bin=050140008166')
    expect(docQrUrl('nakladnaya', undefined)).not.toContain('bin=')
  })

  it('метка на каждый вид документа своя (для отчёта по tool_events)', () => {
    for (const k of ['schet', 'avr', 'kp', 'nakladnaya'] as const) expect(docQrUrl(k, TOO_BIN)).toContain(`utm_campaign=${k}_qr`)
  })

  it('платный документ (без знака) QR не получает', () => {
    expect(docQrHtml(false, 'schet', TOO_BIN)).toBe('')
    expect(docQrHtml(undefined, 'kp', TOO_BIN)).toBe('')
  })

  it('блок: подпись про проверку продавца, ссылка кликабельна, нет обещаний про результат', () => {
    const h = docQrHtml(true, 'schet', TOO_BIN)
    expect(h).toContain('Проверить продавца по БИН перед оплатой')
    expect(h).toContain('href="https://invoices.kz/tools/kontragent?bin=050140008166&amp;utm_source=doc_qr')
    expect(h).toMatch(/<img src="data:image\/svg\+xml/)
    expect(h).not.toMatch(/надёжн|долга нет|всё чисто|гаранти/i)
    expect(docQrHtml(true, 'kp', TOO_BIN, { lang: 'en' })).toContain('Check the seller by BIN before paying')
    // казахской подписи нет до вычитки: русская
    expect(docQrHtml(true, 'kp', TOO_BIN, { lang: 'kk' })).toContain('Проверить продавца по БИН')
  })

  it('QR это валидный SVG-квадрат с белым фоном и тихой зоной', () => {
    const uri = docQrDataUri('https://invoices.kz/tools/kontragent?bin=050140008166')
    const svg = decodeURIComponent(uri.replace('data:image/svg+xml;charset=utf-8,', ''))
    expect(svg.startsWith('<svg')).toBe(true)
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!
    expect(vb[1]).toBe(vb[2])
    expect(svg).toContain('fill="#fff"')
  })
})

describe('QR подключён в четыре генератора только при showWatermark', () => {
  const profile = { company_name: 'ТОО «Ромашка»', bin_iin: TOO_BIN, address: 'г. Астана', director_name: 'Иванов И.И.' }
  const base = { number: '15', date: '06.11.2026', clientName: 'ТОО «Дала»', clientBin: '180540018765', services: [{ name: 'Услуга', qty: 1, price: 1000 }], total: 1000, profile }

  it('счёт', async () => {
    expect(await generateInvoicePDF({ ...base, clientEmail: '', showWatermark: true } as never)).toContain('utm_campaign=schet_qr')
    expect(await generateInvoicePDF({ ...base, clientEmail: '' } as never)).not.toContain('doc_qr')
  })
  it('акт', () => {
    expect(buildAVRHtml({ ...base, showWatermark: true } as never)).toContain('utm_campaign=avr_qr')
    expect(buildAVRHtml({ ...base } as never)).not.toContain('doc_qr')
  })
  it('накладная', () => {
    const nk = { ...base, services: [{ name: 'Бумага А4', qty: 2, price: 500, unit: 'пачка', type: 'product' }] }
    expect(buildNakladnayaHtml({ ...nk, showWatermark: true } as never)).toContain('utm_campaign=nakladnaya_qr')
    expect(buildNakladnayaHtml({ ...nk } as never)).not.toContain('doc_qr')
  })
  it('КП', () => {
    expect(buildKPHtml({ ...base, showWatermark: true } as never)).toContain('utm_campaign=kp_qr')
    expect(buildKPHtml({ ...base } as never)).not.toContain('doc_qr')
  })
  it('счёт с оплатой Kaspi: второго QR рядом с платёжным нет', async () => {
    const html = await generateInvoicePDF({ ...base, clientEmail: '', showWatermark: true, kaspiPayLink: 'https://pay.kaspi.kz/x' } as never)
    expect(html).not.toContain('doc_qr')
  })
  it('у ИП в документе ссылка без номера', () => {
    const ip = { ...profile, bin_iin: IP_IIN }
    const html = buildAVRHtml({ ...base, profile: ip, showWatermark: true } as never)
    expect(html).toContain('utm_campaign=avr_qr')
    expect(html).not.toContain(`bin=${IP_IIN}`)
  })
})
