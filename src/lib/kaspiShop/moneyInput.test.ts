import { describe, it, expect } from 'vitest'
import { parseMoneyInput, moneyParseMessage } from './moneyInput'

const ok = (v: number) => ({ ok: true, value: v })

describe('parseMoneyInput: то, что набрал человек', () => {
  it('целое число', () => {
    expect(parseMoneyInput('12500')).toEqual(ok(12500))
    expect(parseMoneyInput('  900 ')).toEqual(ok(900))
  })

  it('пробелы любого вида как разделитель тысяч: «1 250», неразрывный и узкий', () => {
    expect(parseMoneyInput('12 500')).toEqual(ok(12500))
    expect(parseMoneyInput('12 500')).toEqual(ok(12500))
    expect(parseMoneyInput('1 250')).toEqual(ok(1250))
    expect(parseMoneyInput('1 250 000')).toEqual(ok(1250000))
  })

  it('запятая и точка как десятичный разделитель', () => {
    expect(parseMoneyInput('12,5')).toEqual(ok(12.5))
    expect(parseMoneyInput('12.5')).toEqual(ok(12.5))
    expect(parseMoneyInput('1 250,50')).toEqual(ok(1250.5))
    expect(parseMoneyInput('0,250')).toEqual(ok(0.25))
  })

  it('знак тенге и «тг» отбрасываются', () => {
    expect(parseMoneyInput('1 250 ₸')).toEqual(ok(1250))
    expect(parseMoneyInput('900тг')).toEqual(ok(900))
  })

  it('пустое поле - blank, а не 0 (Number("") === 0 раньше превращал пустой минимум в ноль)', () => {
    expect(parseMoneyInput('')).toEqual({ ok: false, blank: true, reason: 'blank' })
    expect(parseMoneyInput('   ')).toEqual({ ok: false, blank: true, reason: 'blank' })
    expect(parseMoneyInput(null)).toEqual({ ok: false, blank: true, reason: 'blank' })
    expect(parseMoneyInput(undefined)).toEqual({ ok: false, blank: true, reason: 'blank' })
  })

  it('мусор - invalid, не NaN и не 0', () => {
    for (const bad of ['abc', '12abc', '1,2,3', '1.2.3', '-5', '--', '12 -', 'e5']) {
      const r = parseMoneyInput(bad)
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.blank, bad).toBe(false)
    }
  })

  it('«12,500» и «12.500» неоднозначны (12,5 или 12 500): не угадываем, просим переписать', () => {
    for (const s of ['12,500', '12.500', '1,250', '999.999']) {
      const r = parseMoneyInput(s)
      expect(r, s).toMatchObject({ ok: false, reason: 'ambiguous' })
    }
    // но у ровно трёх цифр после запятой при нулевой целой части это явно десятичные
    expect(parseMoneyInput('0.500')).toEqual(ok(0.5))
    // и «12 500,50» однозначно
    expect(parseMoneyInput('12 500,50')).toEqual(ok(12500.5))
  })

  it('слишком большое число отвергается', () => {
    expect(parseMoneyInput('99999999999')).toMatchObject({ ok: false, reason: 'too_large' })
  })
})

describe('moneyParseMessage', () => {
  it('пишет, что именно не так, и называет поле', () => {
    const blank = parseMoneyInput('')
    const bad = parseMoneyInput('abc')
    const amb = parseMoneyInput('12,500')
    if (blank.ok || bad.ok || amb.ok) throw new Error('unexpected')
    expect(moneyParseMessage('Минимальная цена', blank)).toBe('Минимальная цена: заполните поле.')
    expect(moneyParseMessage('Шаг', bad)).toContain('введите число')
    expect(moneyParseMessage('Шаг', amb)).toContain('непонятная запись числа')
  })
})
