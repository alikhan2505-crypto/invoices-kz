import { describe, it, expect } from 'vitest'
import { companyIdKind, companyInitials } from './companyIdentity'

describe('companyIdKind', () => {
  it('ИП → ИИН, ТОО/АО → БИН по форме в названии', () => {
    expect(companyIdKind('ИП Смагулов А.К.', '')).toBe('iin')
    expect(companyIdKind('ЖК Смағұлов', null)).toBe('iin')
    expect(companyIdKind('ТОО «Альфа»', null)).toBe('bin')
    expect(companyIdKind('АО Казахтелеком', null)).toBe('bin')
    expect(companyIdKind('«Мысал» ЖШС', null)).toBe('unknown')
  })

  it('без формы в названии — по 5-й цифре номера', () => {
    expect(companyIdKind('Альфа', '180440012345')).toBe('bin')
    expect(companyIdKind('Смагулов', '920101401234')).toBe('iin')
  })

  it('не понять — unknown', () => {
    expect(companyIdKind('', '')).toBe('unknown')
    expect(companyIdKind('Альфа', '123')).toBe('unknown')
    expect(companyIdKind('Альфа', '920190000000')).toBe('unknown')
  })

  it('слово, лишь начинающееся с букв формы, — не форма', () => {
    expect(companyIdKind('Аоки', '920101401234')).toBe('iin')
    expect(companyIdKind('Ипподром', '180440012345')).toBe('bin')
  })
})

describe('companyInitials', () => {
  it('берёт буквы настоящего названия, без формы и кавычек', () => {
    expect(companyInitials('ТОО «Альфа Строй»')).toBe('АС')
    expect(companyInitials('ИП Смагулов А.К.')).toBe('СА')
    expect(companyInitials('Invoices')).toBe('I')
  })

  it('нет названия — пустая строка (покажем иконку, а не «FP»)', () => {
    expect(companyInitials('')).toBe('')
    expect(companyInitials(null)).toBe('')
    expect(companyInitials('ТОО')).toBe('')
  })
})
