import { describe, it, expect } from 'vitest'
import { isSellableUnit, moqText } from './micUnits'

describe('isSellableUnit', () => {
  it.each([['Pieces'], ['piece'], ['pcs'], ['Pairs'], ['Sets'], [' Units '], ['Pieces.']])('штучная единица %j', u => {
    expect(isSellableUnit(u)).toBe(true)
  })
  it.each([['Bags'], ['Boxes'], ['Cartons'], ['Rolls'], ['Tons'], ['Kilograms'], [''], [null], [undefined], ['pallets']])(
    'не штучная или неизвестная единица %j: цену как за штуку не подставляем', u => {
      expect(isSellableUnit(u as string | null | undefined)).toBe(false)
    })
})

describe('moqText', () => {
  it('число с разрядами и русская единица', () => {
    expect(moqText(10000, 'Bags')?.replace(/\s/g, ' ')).toBe('10 000 пакетов')
    expect(moqText(500, 'Pieces')).toBe('500 шт')
    expect(moqText(100, 'Sets')).toBe('100 комплектов')
  })
  it('неизвестная единица остаётся как есть, в нижнем регистре', () => {
    expect(moqText(20, 'Pallets')).toBe('20 pallets')
  })
  it.each([[null], [undefined], [0], [-5], [NaN]])('нет партии %j: null', q => {
    expect(moqText(q as number | null | undefined, 'Pieces')).toBeNull()
  })
})
