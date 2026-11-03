import { describe, it, expect } from 'vitest'
import { formatKzPhone, nationalDigits, normalizeKzPhone } from './kzPhone'

const FULL = '+7 777 123 45 67'

describe('formatKzPhone: вставка целиком', () => {
  it.each([
    ['+7 777 123 45 67', FULL],
    ['+77771234567', FULL],
    ['87771234567', FULL],
    ['77771234567', FULL],
    ['7 777 123 45 67', FULL],
    ['8 (777) 123-45-67', FULL],
    ['+7 (777) 123-45-67', FULL],
    ['777 123 45 67', FULL], // номер без кода страны, как в контактах: раньше терял последнюю цифру
    ['7771234567', FULL],
  ])('%j -> %j', (raw, expected) => {
    expect(formatKzPhone(raw)).toBe(expected)
  })

  it('форматирование идемпотентно: готовую строку повторный вызов не меняет', () => {
    expect(formatKzPhone(FULL)).toBe(FULL)
    expect(formatKzPhone(formatKzPhone('87771234567'))).toBe(FULL)
  })

  it('лишние цифры после полного номера (кроме перестройки на коде) обрезаются до десяти', () => {
    expect(nationalDigits('+7 777 123 45 67 8').length).toBe(10)
  })
})

describe('formatKzPhone: набор по одной цифре, как в поле ввода', () => {
  // Эмулирует поле: каждый символ дописывается к тому, что уже показано.
  const typeInto = (keys: string) => [...keys].reduce((shown, ch) => formatKzPhone(shown + ch), '')

  it('номер без кода: 7771234567 набирается как +7 777 123 45 67', () => {
    expect(typeInto('7771234567')).toBe(FULL)
  })

  it('номер с кодом 7 (одиннадцать цифр): на последней цифре строка перестраивается', () => {
    expect(typeInto('77771234567')).toBe(FULL)
  })

  it('номер с 8: восьмёрка не попадает в номер', () => {
    expect(typeInto('87771234567')).toBe(FULL)
  })

  it('номер с «+7»', () => {
    expect(typeInto('+77771234567')).toBe(FULL)
  })

  it('промежуточные состояния читаются как набор по группам', () => {
    expect(typeInto('7')).toBe('+7 7')
    expect(typeInto('77')).toBe('+7 77')
    expect(typeInto('777123')).toBe('+7 777 123')
    expect(typeInto('777123456')).toBe('+7 777 123 45 6')
    expect(typeInto('8')).toBe('')
  })

  it('стирание: после удаления последней цифры поле очищается, а не застревает на +7', () => {
    expect(formatKzPhone('+7 7')).toBe('+7 7')
    expect(formatKzPhone('+7')).toBe('')
    expect(formatKzPhone('')).toBe('')
    expect(formatKzPhone('   ')).toBe('')
    expect(formatKzPhone('abc')).toBe('')
  })
})

describe('normalizeKzPhone', () => {
  it('десять национальных цифр - номер для отправки, иначе null', () => {
    expect(normalizeKzPhone(FULL)).toBe('+77771234567')
    expect(normalizeKzPhone('8 777 123 45 67')).toBe('+77771234567')
    expect(normalizeKzPhone('777 123 45 67')).toBe('+77771234567')
    expect(normalizeKzPhone('+7 777 123')).toBeNull()
    expect(normalizeKzPhone('')).toBeNull()
  })
})
