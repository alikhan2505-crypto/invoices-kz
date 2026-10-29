import { describe, expect, it } from 'vitest'
import { OTHER_BANK } from '@/lib/kazakhstanBanks'
import { schetDict } from './schet/dict'
import { validateForm as validateSchet, type Form as SchetForm } from './schet/calc'
import { avrDict } from './avr/dict'
import { validateForm as validateAvr, type Form as AvrForm } from './avr/calc'
import { nakladnayaDict } from './nakladnaya/dict'
import { validateForm as validateNk, type Form as NkForm } from './nakladnaya/calc'

// Что на телефоне свёрнуто в «Дополнительно» (29.10.2026), никогда не должно
// мешать получить документ: валидация не требует ни одного из свёрнутых полей.
// Если когда-нибудь поле из блока станет обязательным, этот тест упадёт, и его
// надо вынести из «Дополнительно» (или блок раскрывать при ошибке: hasError).

const rows = [{ name: 'Услуга', qty: '1', unit: 'шт', price: '1000' }]

const schetMin: SchetForm = {
  companyName: 'ИП Иванов', binIin: '890525350143', address: '', director: '', phone: '', email: '',
  bankBik: OTHER_BANK, otherBankName: 'Банк', otherBankBik: 'ABCDKZKA', iik: 'KZ' + '0'.repeat(18), kbe: '19',
  clientName: 'ТОО Клиент', clientBin: '040340001997',
  number: '1', date: '2026-10-29', dueDate: '', vatType: 'no_vat', note: '', rows,
}
const avrMin: AvrForm = {
  companyName: 'ИП Иванов', binIin: '890525350143', address: '', director: '', phone: '', email: '',
  clientName: 'ТОО Клиент', clientBin: '', clientAddress: '',
  number: '1', date: '2026-10-29', contractNumber: '', contractDate: '', vatType: 'no_vat', rows,
}
const nkMin: NkForm = {
  companyName: 'ИП Иванов', binIin: '890525350143', address: '', director: '', email: '',
  clientName: 'ТОО Клиент', clientBin: '', number: '1', date: '2026-10-29', vatType: 'no_vat', rows,
}

describe('счёт: свёрнутое не обязательно, видимое обязательно', () => {
  const e = schetDict.ru.errors
  it('accepts a form with only the visible required fields', () => {
    expect(validateSchet(schetMin, e)).toBe('')
  })
  for (const [key, msg] of [['companyName', e.company], ['binIin', e.bin], ['iik', e.iik], ['clientName', e.client], ['clientBin', e.clientBin]] as const) {
    it('requires ' + key, () => {
      expect(validateSchet({ ...schetMin, [key]: '' }, e)).toBe(msg)
    })
  }
  it('requires the bank (rule of the founder: bank and BIK stay mandatory)', () => {
    expect(validateSchet({ ...schetMin, bankBik: '' }, e)).toBe(e.bank)
    expect(validateSchet({ ...schetMin, otherBankBik: 'ABC' }, e)).toBe(e.bank)
  })
})

describe('АВР: свёрнутое не обязательно', () => {
  const e = avrDict.ru.errors
  it('accepts a form with only the visible required fields', () => {
    expect(validateAvr(avrMin, e)).toBe('')
  })
  for (const [key, msg] of [['companyName', e.company], ['binIin', e.bin], ['clientName', e.client]] as const) {
    it('requires ' + key, () => {
      expect(validateAvr({ ...avrMin, [key]: '' }, e)).toBe(msg)
    })
  }
})

describe('накладная: свёрнутое не обязательно', () => {
  const e = nakladnayaDict.ru.errors
  it('accepts a form with only the visible required fields', () => {
    expect(validateNk(nkMin, e)).toBe('')
  })
  for (const [key, msg] of [['companyName', e.company], ['binIin', e.bin], ['clientName', e.client]] as const) {
    it('requires ' + key, () => {
      expect(validateNk({ ...nkMin, [key]: '' }, e)).toBe(msg)
    })
  }
})
