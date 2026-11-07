import { describe, it, expect } from 'vitest'
import { readMoneyBody } from './moneyBody'

describe('readMoneyBody: null и «некорректно» это разные вещи (аудит K34)', () => {
  it('явный null очищает только там, где это разрешено', () => {
    expect(readMoneyBody(null, { nullable: true })).toEqual({ ok: true, value: null })
    expect(readMoneyBody(null)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('поле не передано: ошибка, а не «очистить»', () => {
    expect(readMoneyBody(undefined, { nullable: true })).toEqual({ ok: false, reason: 'missing' })
  })

  it('числа и строки с запятой и пробелами разбираются', () => {
    expect(readMoneyBody(1250.5)).toEqual({ ok: true, value: 1250.5 })
    expect(readMoneyBody('1250,50')).toEqual({ ok: true, value: 1250.5 })
    expect(readMoneyBody('1 250')).toEqual({ ok: true, value: 1250 })
    expect(readMoneyBody('12,5', { max: 100 })).toEqual({ ok: true, value: 12.5 })
    expect(readMoneyBody(0)).toEqual({ ok: true, value: 0 })
  })

  it('пустая строка, мусор, NaN, объект, отрицательное и выше предела это отказ', () => {
    for (const bad of ['', '   ', 'abc', NaN, Infinity, {}, [], true, -1, '-5', '12,500']) {
      expect(readMoneyBody(bad as any, { nullable: true }).ok).toBe(false)
    }
    expect(readMoneyBody(101, { max: 100 }).ok).toBe(false)
    expect(readMoneyBody('150', { max: 100 }).ok).toBe(false)
  })
})
