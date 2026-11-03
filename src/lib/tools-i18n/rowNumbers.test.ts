import { describe, it, expect } from 'vitest'
import {
  PRICE_DECIMALS, PRICE_MAX, QTY_DECIMALS, QTY_MAX,
  formatQty, formatTengeExact, roundTenge, rowCell, rowNumber,
} from './rowNumbers'

describe('rowNumber: число из ячейки позиции', () => {
  it.each([
    ['0,5', 0.5],
    ['0.5', 0.5],
    ['1 000,50', 1000.5],
    ['1 000', 1000], // неразрывный пробел
    ['', 0],
    [null, 0],
    [undefined, 0],
    ['abc', 0],
    ['1,2,3', 0],
  ])('%j -> %j', (raw, expected) => {
    expect(rowNumber(raw as string | null | undefined)).toBe(expected)
  })
})

describe('rowCell: что попадает в состояние формы', () => {
  it('ноль даёт пустую ячейку (видна подсказка), обычное число - строку', () => {
    expect(rowCell(0, QTY_MAX, QTY_DECIMALS)).toBe('')
    expect(rowCell(12, QTY_MAX, QTY_DECIMALS)).toBe('12')
    expect(rowCell(0.5, QTY_MAX, QTY_DECIMALS)).toBe('0.5')
  })

  it('отрицательное и больше предела не принимается', () => {
    expect(rowCell(-1, QTY_MAX, QTY_DECIMALS)).toBeNull()
    expect(rowCell(QTY_MAX + 1, QTY_MAX, QTY_DECIMALS)).toBeNull()
    expect(rowCell(QTY_MAX, QTY_MAX, QTY_DECIMALS)).toBe(String(QTY_MAX))
    expect(rowCell(PRICE_MAX + 1, PRICE_MAX, PRICE_DECIMALS)).toBeNull()
    expect(rowCell(NaN, QTY_MAX, QTY_DECIMALS)).toBeNull()
  })

  it('цена - до тиына: 10,005 не принимается (на экране и в PDF округлилась бы по-разному)', () => {
    expect(rowCell(10.5, PRICE_MAX, PRICE_DECIMALS)).toBe('10.5')
    expect(rowCell(10.55, PRICE_MAX, PRICE_DECIMALS)).toBe('10.55')
    expect(rowCell(10.005, PRICE_MAX, PRICE_DECIMALS)).toBeNull()
    expect(rowCell(0.1 + 0.2, PRICE_MAX, PRICE_DECIMALS)).toBe(String(0.1 + 0.2)) // 0.30000000000000004 - шум float, не лишний знак
  })

  it('количество - до грамма: 0,001 можно, 0,0005 нет', () => {
    expect(rowCell(0.001, QTY_MAX, QTY_DECIMALS)).toBe('0.001')
    expect(rowCell(1.005, QTY_MAX, QTY_DECIMALS)).toBe('1.005')
    expect(rowCell(0.0005, QTY_MAX, QTY_DECIMALS)).toBeNull()
  })

  it('запись вроде 1e-7 в состояние формы не попадает', () => {
    expect(rowCell(1e-7, QTY_MAX, QTY_DECIMALS)).toBeNull()
    expect(rowCell(1e-7, PRICE_MAX, PRICE_DECIMALS)).toBeNull()
  })

  it('по умолчанию знаков столько же, сколько у цены', () => {
    expect(rowCell(1.234, PRICE_MAX)).toBeNull()
    expect(rowCell(1.23, PRICE_MAX)).toBe('1.23')
  })
})

describe('суммы и печать', () => {
  it('roundTenge: до тиына', () => {
    expect(roundTenge(10.1 * 3)).toBe(30.3)
    expect(roundTenge(1234.5678)).toBe(1234.57)
  })

  it('formatTengeExact: целая сумма без копеек, с тиынами - с двумя знаками', () => {
    const plain = (x: string) => x.replace(/\s/g, ' ') // Intl ставит неразрывный пробел между разрядами
    expect(plain(formatTengeExact(1250))).toBe('1 250 ₸')
    expect(plain(formatTengeExact(1250.5))).toBe('1 250,50 ₸')
  })

  it('formatQty: десятичная запятая, как у сумм рядом', () => {
    expect(formatQty(0.5)).toBe('0,5')
    expect(formatQty(12)).toBe('12')
    expect(formatQty(1.25)).toBe('1,25')
  })
})
