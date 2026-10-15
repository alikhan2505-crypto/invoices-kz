import { describe, it, expect } from 'vitest'
import { checkNextNumber, digitsOnly, highestIssuedNumber, MAX_NEXT_NUMBER_DIGITS } from './docNumbering'

describe('digitsOnly', () => {
  it('убирает всё, кроме цифр', () => {
    expect(digitsOnly('00a1-2 3')).toBe('00123')
    expect(digitsOnly('1e5')).toBe('15')
    expect(digitsOnly('-7')).toBe('7')
    expect(digitsOnly('')).toBe('')
  })
  it('обрезает до допустимой длины', () => {
    expect(digitsOnly('1234567890123')).toHaveLength(MAX_NEXT_NUMBER_DIGITS)
  })
})

describe('highestIssuedNumber', () => {
  it('берёт наибольший номер с тем же префиксом', () => {
    expect(highestIssuedNumber(['INV-0001', 'INV-0012', 'INV-0003'], 'INV-')).toBe(12)
  })
  it('сравнивает числа, а не строки', () => {
    expect(highestIssuedNumber(['INV-999', 'INV-1000'], 'INV-')).toBe(1000)
  })
  it('пропускает чужие префиксы и номера с хвостом', () => {
    expect(highestIssuedNumber(['СЧ-0050', 'INV-0007-копия', 'INV-0004', null, undefined], 'INV-')).toBe(4)
  })
  it('КП с дополнением нулями', () => {
    expect(highestIssuedNumber(['КП-0001', 'КП-0002'], 'КП-')).toBe(2)
  })
  it('пустой префикс — номера из одних цифр', () => {
    expect(highestIssuedNumber(['15', 'INV-0099', '7'], '')).toBe(15)
  })
  it('0, если ничего не выдано', () => {
    expect(highestIssuedNumber([], 'INV-')).toBe(0)
  })
})

describe('checkNextNumber', () => {
  it('принимает число больше выданного и сохраняет ведущие нули', () => {
    expect(checkNextNumber('0013', 12)).toEqual({ ok: true, value: '0013', numeric: 13 })
  })
  it('принимает любой номер, если с этим префиксом ничего не выдано', () => {
    expect(checkNextNumber('1', 0)).toEqual({ ok: true, value: '1', numeric: 1 })
  })
  it('разрешает вернуть номер ниже прежней настройки, если он не выдан', () => {
    // выдано до 50, по ошибке стояло 500 — 51 снова можно
    expect(checkNextNumber('51', 50).ok).toBe(true)
  })
  it('отказывает в номере, равном или меньше выданного, и называет минимум', () => {
    expect(checkNextNumber('12', 12)).toEqual({ ok: false, reason: 'below_issued', minimum: 13 })
    expect(checkNextNumber('0005', 12)).toEqual({ ok: false, reason: 'below_issued', minimum: 13 })
  })
  it('отказывает в пустом, нечисловом, нулевом и слишком длинном', () => {
    expect(checkNextNumber('', 0)).toEqual({ ok: false, reason: 'empty' })
    expect(checkNextNumber('   ', 0)).toEqual({ ok: false, reason: 'empty' })
    expect(checkNextNumber('12a', 0)).toEqual({ ok: false, reason: 'not_digits' })
    expect(checkNextNumber('-1', 0)).toEqual({ ok: false, reason: 'not_digits' })
    expect(checkNextNumber('1.5', 0)).toEqual({ ok: false, reason: 'not_digits' })
    expect(checkNextNumber('0000', 0)).toEqual({ ok: false, reason: 'zero' })
    expect(checkNextNumber('1234567890', 0)).toEqual({ ok: false, reason: 'too_long' })
  })
})
